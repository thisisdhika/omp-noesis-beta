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
  resolveLearning,
  getContestedWarnings,
} from "../../../src/domains/belief/belief-domain.js";
import type { NoesisState, BeliefFact, BeliefDecision, BeliefSource } from "../../../src/schema.js";
import { EMPTY_STATE, CAPS } from "../../../src/schema.js";
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

  it("supersedes contradicted facts via contradictsIds", () => {
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
      contradictsIds: [existing.id],
    });

    // Existing fact should now be superseded
    expect(state.belief.facts.find((f) => f.id === existing.id)!.status).toBe("superseded");
    expect(state.belief.facts.find((f) => f.id === existing.id)!.supersededBy).toBe(replacement.id);

    // Replacement is active
    expect(replacement.status).toBe("active");
  });

  it("handles empty contradictsIds gracefully", () => {
    const state = freshState();
    const fact = addFact(state, {
      content: "No contradictions",
      confidence: 0.7,
      source: "user",
      contradictsIds: [],
    });
    expect(fact.status).toBe("active");
    expect(state.belief.facts).toHaveLength(1);
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

  it("supersedes contradicted decisions via contradictsIds", () => {
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
      contradictsIds: [old.id],
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
    addFact(state, { content: "Superseded fact", confidence: 0.7, source: "execution", contradictsIds: [state.belief.facts[0]!.id] });

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
    addDecision(state, { content: "Superseded", rationale: "r2", source: "user", contradictsIds: [state.belief.decisions[0]!.id] });

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

// ---------------------------------------------------------------------------
// resolveLearning
// ---------------------------------------------------------------------------

describe("resolveLearning", () => {
  it("creates a belief fact from a learning entry", () => {
    const state = freshState();
    // Add a learning entry manually (simulating what learning domain does)
    state.learning.successes.push({
      id: "le-test-1",
      description: "Learned to use Bun",
      status: "captured",
      capturedAt: new Date().toISOString(),
    });

    const fact = resolveLearning(state, "le-test-1", "New to Bun", "Read docs");

    expect(fact.content).toContain("Learned to use Bun");
    expect(fact.content).toContain("Root cause: New to Bun");
    expect(fact.content).toContain("Fix: Read docs");
    expect(fact.confidence).toBe(0.85);
    expect(fact.source).toBe("inference");
    expect(fact.tags).toEqual(["learning-resolved"]);
    expect(fact.status).toBe("active");
    expect(state.belief.facts).toHaveLength(1);
  });

  it("creates fact without rootCause or fix when empty", () => {
    const state = freshState();
    state.learning.failures.push({
      id: "le-test-2",
      description: "Something broke",
      status: "captured",
      capturedAt: new Date().toISOString(),
    });

    const fact = resolveLearning(state, "le-test-2", "", "");

    expect(fact.content).toBe("Something broke");
    expect(fact.content).not.toContain("Root cause:");
    expect(fact.content).not.toContain("Fix:");
  });

  it("throws for unknown learning entry id", () => {
    const state = freshState();
    expect(() => resolveLearning(state, "nonexistent", "rc", "fix")).toThrow(
      "Learning entry not found: nonexistent",
    );
  });
});

// ---------------------------------------------------------------------------
// getContestedWarnings
// ---------------------------------------------------------------------------

describe("getContestedWarnings", () => {
  it("returns empty array when no superseded facts exist", () => {
    const state = freshState();
    state.belief.facts.push({
      id: "bf-1",
      content: "Active fact",
      confidence: 0.9,
      source: "execution",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      status: "active",
    });
    state.inference.hypotheses.push({
      id: "hy-1",
      content: "Hypothesis depending on active fact",
      status: "testing",
      relatedBeliefId: "bf-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(getContestedWarnings(state)).toEqual([]);
  });

  it("returns empty array when superseded fact has no dependents", () => {
    const state = freshState();
    state.belief.facts.push({
      id: "bf-1",
      content: "Superseded fact",
      confidence: 0.9,
      source: "execution",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      status: "superseded",
    });
    expect(getContestedWarnings(state)).toEqual([]);
  });

  it("returns warning when superseded fact has one dependent hypothesis", () => {
    const state = freshState();
    state.belief.facts.push({
      id: "bf-1",
      content: "Test fact for supersession",
      confidence: 0.9,
      source: "execution",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      status: "superseded",
    });
    state.inference.hypotheses.push({
      id: "hy-1",
      content: "Hypothesis depending on fact",
      status: "testing",
      relatedBeliefId: "bf-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const result = getContestedWarnings(state);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("Belief 'Test fact for supersession' superseded");
    expect(result[0]).toContain("hypothesis 'Hypothesis depending on fact'");
    expect(result[0]).toContain("bf-1");
    expect(result[0]).toContain("hy-1");
  });

  it("returns multiple warnings when superseded fact has multiple dependent hypotheses", () => {
    const state = freshState();
    state.belief.facts.push({
      id: "bf-1",
      content: "Shared fact",
      confidence: 0.9,
      source: "execution",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      status: "superseded",
    });
    state.inference.hypotheses.push(
      {
        id: "hy-1",
        content: "First hypothesis",
        status: "testing",
        relatedBeliefId: "bf-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "hy-2",
        content: "Second hypothesis",
        status: "testing",
        relatedBeliefId: "bf-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    );
    const result = getContestedWarnings(state);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain("hy-1");
    expect(result[1]).toContain("hy-2");
  });

  it("collects warnings from multiple superseded facts", () => {
    const state = freshState();
    state.belief.facts.push(
      {
        id: "bf-1",
        content: "First superseded fact",
        confidence: 0.9,
        source: "execution",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        status: "superseded",
      },
      {
        id: "bf-2",
        content: "Second superseded fact",
        confidence: 0.8,
        source: "user",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        status: "superseded",
      },
    );
    state.inference.hypotheses.push(
      {
        id: "hy-1",
        content: "Depends on first",
        status: "testing",
        relatedBeliefId: "bf-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "hy-2",
        content: "Depends on second",
        status: "testing",
        relatedBeliefId: "bf-2",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    );
    const result = getContestedWarnings(state);
    expect(result).toHaveLength(2);
    expect(result.some((w) => w.includes("bf-1") && w.includes("hy-1"))).toBe(true);
    expect(result.some((w) => w.includes("bf-2") && w.includes("hy-2"))).toBe(true);
  });

  it("truncates long content to 40 characters with ellipsis", () => {
    const state = freshState();
    const longFactContent = "A very long belief fact content that exceeds forty character limit";
    state.belief.facts.push({
      id: "bf-1",
      content: longFactContent,
      confidence: 0.9,
      source: "execution",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      status: "superseded",
    });
    state.inference.hypotheses.push({
      id: "hy-1",
      content: "Short hypothesis",
      status: "testing",
      relatedBeliefId: "bf-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const result = getContestedWarnings(state);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("Belief 'A very long belief fact content that exc...'");
    expect(result[0]).toContain("hypothesis 'Short hypothesis'");
  });

  it("ignores superseded decisions (known limitation)", () => {
    const state = freshState();
    state.belief.decisions.push({
      id: "bd-1",
      content: "Superseded decision",
      rationale: "Some rationale",
      source: "user",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      status: "superseded",
    });
    expect(getContestedWarnings(state)).toEqual([]);
  });
});
