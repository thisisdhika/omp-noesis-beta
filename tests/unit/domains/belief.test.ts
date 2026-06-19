"use strict";

/**
 * Unit tests for the Belief Domain (belief-domain.ts).
 *
 * Tests addFact, addDecision, getActiveFacts, getActiveDecisions,
 * and resolveLearning — including supersession tagging, status/confidence
 * filtering, and error paths.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  addFact,
  addDecision,
  getActiveFacts,
  getActiveDecisions,
} from "../../../src/domains/belief/belief-domain.js";
import type { NoesisState, BeliefFact, BeliefDecision, BeliefSource } from "../../../src/shared/schema.js";
import { EMPTY_STATE, CAPS } from "../../../src/shared/schema.js";
import { freshState } from "../../helpers/fixtures.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// addFact
// ---------------------------------------------------------------------------

describe("addFact", () => {
  it("creates a belief fact with correct fields", () => {
    const state = freshState();
    const fact = addFact(state, {
      content: "TDD improves code quality",
      confidence: 0.85,
      source: "execution",
      tags: ["testing", "quality"],
      evidence: "Observed over 100 commits",
    });

    expect(fact.id).toMatch(/^bf-/);
    expect(fact.content).toBe("TDD improves code quality");
    expect(fact.confidence).toBe(0.85);
    expect(fact.source).toBe("execution");
    expect(fact.tags).toEqual(["testing", "quality"]);
    expect(fact.evidence).toBe("Observed over 100 commits");
    expect(fact.status).toBe("active");
    expect(fact.createdAt).toBeDefined();
    expect(fact.updatedAt).toBeDefined();

    // State was mutated
    expect(state.belief.facts).toHaveLength(1);
    expect(state.belief.facts[0]!.id).toBe(fact.id);
  });

  it("handles optional tags and evidence omitted", () => {
    const state = freshState();
    const fact = addFact(state, {
      content: "Simple fact",
      confidence: 0.5,
      source: "user",
    });

    expect(fact.tags).toBeUndefined();
    expect(fact.evidence).toBeUndefined();
  });

  it("supersedes contradicted facts via contradicts", async () => {
    const state = freshState();
    const existing = addFact(state, {
      content: "Old fact",
      confidence: 0.8,
      source: "execution",
    });

    const replacement = addFact(state, {
      content: "New fact",
      confidence: 0.9,
      source: "execution",
      contradicts: [existing.id],
    });

    // Existing fact should now be superseded
    expect(state.belief.facts.find((f) => f.id === existing.id)!.status).toBe("superseded");
    expect(state.belief.facts.find((f) => f.id === existing.id)!.supersededBy).toBe(replacement.id);

    // Replacement is active
    expect(replacement.status).toBe("active");
  });

  it("handles empty contradicts gracefully", () => {
    const state = freshState();
    const fact = addFact(state, {
      content: "No contradictions",
      confidence: 0.7,
      source: "user",
      contradicts: [],
    });
    expect(fact.status).toBe("active");
    expect(state.belief.facts).toHaveLength(1);
  });

  it("auto-supersedes existing active facts with the same content (K*6 equivalence)", () => {
    const state = freshState();
    const first = addFact(state, {
      content: "Duplicate content",
      confidence: 0.7,
      source: "execution",
    });

    const second = addFact(state, {
      content: "Duplicate content",
      confidence: 0.9,
      source: "execution",
    });

    // First fact should be superseded by the content-match
    const refreshedFirst = state.belief.facts.find((f) => f.id === first.id)!;
    expect(refreshedFirst.status).toBe("superseded");
    expect(refreshedFirst.supersededBy).toBe(second.id);

    // Second fact is active
    expect(second.status).toBe("active");

    // getActiveFacts should only return the second fact
    const active = getActiveFacts(state);
    expect(active).toHaveLength(1);
    expect(active[0]!.id).toBe(second.id);
  });

  it("prefers explicit contradicts over content-match for unrelated content", () => {
    const state = freshState();
    const unrelated = addFact(state, {
      content: "Unrelated content",
      confidence: 0.7,
      source: "execution",
    });

    // Create new fact with different content but explicitly contradicts the unrelated one
    const newFact = addFact(state, {
      content: "New content",
      confidence: 0.9,
      source: "execution",
      contradicts: [unrelated.id],
    });

    // Unrelated fact should be superseded via explicit contradicts
    expect(state.belief.facts.find((f) => f.id === unrelated.id)!.status).toBe("superseded");
    expect(state.belief.facts.find((f) => f.id === unrelated.id)!.supersededBy).toBe(newFact.id);
  });

  it("does not supersede already-superseded facts with same content", () => {
    const state = freshState();
    const first = addFact(state, {
      content: "Superseded then re-added",
      confidence: 0.6,
      source: "user",
    });

    // Second fact supersedes the first (higher confidence content match)
    const second = addFact(state, {
      content: "Superseded then re-added",
      confidence: 0.8,
      source: "execution",
    });

    // Count superseded before the third add
    const supersededBefore = state.belief.facts.filter((f) => f.status === "superseded").length;

    // Third fact with same content, higher confidence — replaces second only
    const third = addFact(state, {
      content: "Superseded then re-added",
      confidence: 0.9,
      source: "inference",
    });

    const supersededAfter = state.belief.facts.filter((f) => f.status === "superseded").length;
    // Only second gets newly superseded (first was already superseded)
    expect(supersededAfter - supersededBefore).toBe(1);

    const refreshedFirst = state.belief.facts.find((f) => f.id === first.id)!;
    expect(refreshedFirst.status).toBe("superseded");
    expect(refreshedFirst.supersededBy).toBe(second.id); // first was superseded by second, not third

    const refreshedSecond = state.belief.facts.find((f) => f.id === second.id)!;
    expect(refreshedSecond.status).toBe("superseded");
    expect(refreshedSecond.supersededBy).toBe(third.id); // second superseded by third

    const active = getActiveFacts(state);
    expect(active).toHaveLength(1);
    expect(active[0]!.id).toBe(third.id);
  });

  it("records lower-confidence duplicate as superseded without creating an active head", () => {
    const state = freshState();
    const original = addFact(state, {
      content: "Existing high-confidence fact",
      confidence: 0.9,
      source: "execution",
    });

    // New fact with same content but lower confidence
    const duplicate = addFact(state, {
      content: "Existing high-confidence fact",
      confidence: 0.5,
      source: "user",
    });

    // Original should still be active — new fact should be superseded by it
    const refreshedOriginal = state.belief.facts.find((f) => f.id === original.id)!;
    expect(refreshedOriginal.status).toBe("active");
    expect(refreshedOriginal.supersededBy).toBeUndefined();

    // Duplicate should be superseded by the original
    const refreshedDuplicate = state.belief.facts.find((f) => f.id === duplicate.id)!;
    expect(refreshedDuplicate.status).toBe("superseded");
    expect(refreshedDuplicate.supersededBy).toBe(original.id);

    // getActiveFacts should return only the original
    const active = getActiveFacts(state);
    expect(active).toHaveLength(1);
    expect(active[0]!.id).toBe(original.id);
  });

  it("equal-confidence duplicate replaces existing active head", () => {
    const state = freshState();
    const original = addFact(state, {
      content: "Equal confidence test",
      confidence: 0.8,
      source: "execution",
    });

    const replacement = addFact(state, {
      content: "Equal confidence test",
      confidence: 0.8,
      source: "user",
    });

    // Original should be superseded (new one has >= confidence)
    expect(state.belief.facts.find((f) => f.id === original.id)!.status).toBe("superseded");
    expect(replacement.status).toBe("active");
  });
});


// ---------------------------------------------------------------------------
// addDecision
// ---------------------------------------------------------------------------

describe("addDecision", () => {
  it("creates a decision with correct fields", () => {
    const state = freshState();
    const decision = addDecision(state, {
      content: "Use Bun as runtime",
      rationale: "Fastest TS execution",
      source: "user",
      alternatives: ["Node.js", "Deno"],
      tags: ["runtime", "performance"],
    });

    expect(decision.id).toMatch(/^bd-/);
    expect(decision.content).toBe("Use Bun as runtime");
    expect(decision.rationale).toBe("Fastest TS execution");
    expect(decision.source).toBe("user");
    expect(decision.alternatives).toEqual(["Node.js", "Deno"]);
    expect(decision.tags).toEqual(["runtime", "performance"]);
    expect(decision.status).toBe("active");

    expect(state.belief.decisions).toHaveLength(1);
  });

  it("handles optional fields omitted", () => {
    const state = freshState();
    const decision = addDecision(state, {
      content: "Minimal decision",
      rationale: "Because",
      source: "execution",
    });

    expect(decision.alternatives).toBeUndefined();
    expect(decision.tags).toBeUndefined();
  });

  it("supersedes contradicted decisions via contradicts", () => {
    const state = freshState();
    const old = addDecision(state, {
      content: "Old decision",
      rationale: "Outdated",
      source: "execution",
    });

    const updated = addDecision(state, {
      content: "Updated decision",
      rationale: "Better approach",
      source: "user",
      contradicts: [old.id],
    });

    expect(state.belief.decisions.find((d) => d.id === old.id)!.status).toBe("superseded");
    expect(state.belief.decisions.find((d) => d.id === old.id)!.supersededBy).toBe(updated.id);
  });
});

// ---------------------------------------------------------------------------
// getActiveFacts
// ---------------------------------------------------------------------------

describe("getActiveFacts", () => {
  it("returns only active facts", () => {
    const state = freshState();
    addFact(state, { content: "Active fact", confidence: 0.9, source: "execution" });
    addFact(state, { content: "Superseded fact", confidence: 0.7, source: "execution", contradicts: [state.belief.facts[0]!.id] });

    const active = getActiveFacts(state);
    expect(active).toHaveLength(1);
    expect(active[0]!.content).toBe("Superseded fact");
  });

  it("filters by minimum confidence", () => {
    const state = freshState();
    addFact(state, { content: "High confidence", confidence: 0.9, source: "execution" });
    addFact(state, { content: "Low confidence", confidence: 0.3, source: "execution" });

    const filtered = getActiveFacts(state, 0.8);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.content).toBe("High confidence");
  });

  it("filters by tags", () => {
    const state = freshState();
    addFact(state, { content: "Has matching tag", confidence: 0.8, source: "execution", tags: ["important"] });
    addFact(state, { content: "No matching tag", confidence: 0.8, source: "execution", tags: ["other"] });

    const filtered = getActiveFacts(state, undefined, ["important"]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.content).toBe("Has matching tag");
  });

  it("returns empty array from empty state", () => {
    const state = freshState();
    expect(getActiveFacts(state)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getActiveDecisions
// ---------------------------------------------------------------------------

describe("getActiveDecisions", () => {
  it("returns only active decisions", () => {
    const state = freshState();
    addDecision(state, { content: "Active", rationale: "r1", source: "user" });
    addDecision(state, { content: "Superseded", rationale: "r2", source: "user", contradicts: [state.belief.decisions[0]!.id] });

    const active = getActiveDecisions(state);
    expect(active).toHaveLength(1);
    expect(active[0]!.content).toBe("Superseded");
  });

  it("filters by tags", () => {
    const state = freshState();
    addDecision(state, { content: "Tagged A", rationale: "r1", source: "user", tags: ["architecture"] });
    addDecision(state, { content: "Tagged B", rationale: "r2", source: "user", tags: ["testing"] });

    const filtered = getActiveDecisions(state, ["architecture"]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.content).toBe("Tagged A");
  });

  it("returns empty array from empty state", () => {
    const state = freshState();
    expect(getActiveDecisions(state)).toEqual([]);
  });
});
