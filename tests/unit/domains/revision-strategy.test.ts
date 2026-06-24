"use strict";

/**
 * Unit tests for the Belief Revision Strategy (revision-strategy.ts).
 *
 * Tests supersede — AGM K*2–K*6 supersession that mutates state in-place.
 * Pure mutation testing: pre-fill state, call supersede, verify side effects.
 */

import { describe, it, expect } from "bun:test";
import { supersede } from "../../../src/domains/belief/revision-strategy.js";
import type { NoesisState, BeliefFact, BeliefDecision } from "../../../src/shared/schema.js";
import { EMPTY_STATE } from "../../../src/shared/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cloneState(): NoesisState {
  return structuredClone(EMPTY_STATE);
}

function makeFact(overrides: Partial<BeliefFact> & { id: string }): BeliefFact {
  return {
    content: "Test fact",
    confidence: 0.8,
    source: "execution",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "active",
    epistemicStatus: "speculative" as const,
    reviewRequired: false,
    scope: "local" as const,
    revision: 0,
    ...overrides,
  };
}

function makeDecision(overrides: Partial<BeliefDecision> & { id: string }): BeliefDecision {
  return {
    content: "Test decision",
    rationale: "Test rationale",
    source: "user",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "active",
    scope: "local" as const,
    revision: 0,
    ...overrides,
  };
}

/** Quick timestamp check — within a few seconds of now. */
function isRecent(iso: string): boolean {
  const age = Date.now() - Date.parse(iso);
  return age >= 0 && age < 10_000; // within 10 seconds
}

// ---------------------------------------------------------------------------
// supersede
// ---------------------------------------------------------------------------

describe("supersede", () => {
  it("supersedes an active fact", () => {
    const state = cloneState();
    state.belief.facts.push(makeFact({ id: "bf-1", content: "Original fact" }));

    supersede(state, "bf-2", ["bf-1"]);

    const fact = state.belief.facts[0]!;
    expect(fact.status).toBe("superseded");
    expect(fact.supersededBy).toBe("bf-2");
  });

  it("supersedes an active decision", () => {
    const state = cloneState();
    state.belief.decisions.push(makeDecision({ id: "bd-1", content: "Original decision" }));

    supersede(state, "bd-2", ["bd-1"]);

    const decision = state.belief.decisions[0]!;
    expect(decision.status).toBe("superseded");
    expect(decision.supersededBy).toBe("bd-2");
  });

  it("ignores an already-superseded fact", () => {
    const state = cloneState();
    state.belief.facts.push(makeFact({ id: "bf-1", content: "Already superseded", status: "superseded", supersededBy: "bf-0" }));

    supersede(state, "bf-2", ["bf-1"]);

    const fact = state.belief.facts[0]!;
    // Should remain unchanged — still superseded by bf-0
    expect(fact.status).toBe("superseded");
    expect(fact.supersededBy).toBe("bf-0");
  });

  it("ignores an archived fact", () => {
    const state = cloneState();
    state.belief.facts.push(makeFact({ id: "bf-1", content: "Archived fact", status: "archived" }));

    supersede(state, "bf-2", ["bf-1"]);

    const fact = state.belief.facts[0]!;
    expect(fact.status).toBe("archived");
    expect(fact.supersededBy).toBeUndefined();
  });

  it("ignores an already-superseded decision", () => {
    const state = cloneState();
    state.belief.decisions.push(makeDecision({ id: "bd-1", content: "Already superseded", status: "superseded", supersededBy: "bd-0" }));

    supersede(state, "bd-2", ["bd-1"]);

    const decision = state.belief.decisions[0]!;
    expect(decision.status).toBe("superseded");
    expect(decision.supersededBy).toBe("bd-0");
  });

  it("supersedes multiple targets at once (mix of facts and decisions)", () => {
    const state = cloneState();
    state.belief.facts.push(
      makeFact({ id: "bf-1", content: "Fact A" }),
      makeFact({ id: "bf-2", content: "Fact B" }),
    );
    state.belief.decisions.push(
      makeDecision({ id: "bd-1", content: "Decision A" }),
    );

    supersede(state, "new-1", ["bf-1", "bd-1", "bf-2"]);

    expect(state.belief.facts.find((f) => f.id === "bf-1")!.status).toBe("superseded");
    expect(state.belief.facts.find((f) => f.id === "bf-2")!.status).toBe("superseded");
    expect(state.belief.decisions.find((d) => d.id === "bd-1")!.status).toBe("superseded");
  });

  it("has no effect on non-existent ids", () => {
    const state = cloneState();
    state.belief.facts.push(makeFact({ id: "bf-1", content: "Real fact" }));

    // Should not throw or mutate anything
    supersede(state, "bf-2", ["nonexistent-id"]);

    const fact = state.belief.facts[0]!;
    expect(fact.status).toBe("active");
    expect(fact.supersededBy).toBeUndefined();
  });

  it("has no effect when targetIds is empty", () => {
    const state = cloneState();
    state.belief.facts.push(makeFact({ id: "bf-1", content: "Real fact" }));

    supersede(state, "bf-2", []);

    expect(state.belief.facts[0]!.status).toBe("active");
  });

  it("prefers facts over decisions when both share the same id", () => {
    const state = cloneState();
    state.belief.facts.push(makeFact({ id: "shared-1", content: "Fact with id" }));
    state.belief.decisions.push(makeDecision({ id: "shared-1", content: "Decision with same id" }));

    supersede(state, "new-1", ["shared-1"]);

    // Fact should be superseded (found first)
    expect(state.belief.facts.find((f) => f.id === "shared-1")!.status).toBe("superseded");
    // Decision should NOT be superseded (continue skips after fact match)
    expect(state.belief.decisions.find((d) => d.id === "shared-1")!.status).toBe("active");
  });

  it("sets supersededBy to the newId on facts", () => {
    const state = cloneState();
    state.belief.facts.push(makeFact({ id: "bf-1", content: "To be superseded" }));

    supersede(state, "bf-new", ["bf-1"]);

    expect(state.belief.facts[0]!.supersededBy).toBe("bf-new");
  });

  it("sets supersededBy to the newId on decisions", () => {
    const state = cloneState();
    state.belief.decisions.push(makeDecision({ id: "bd-1", content: "To be superseded" }));

    supersede(state, "bd-new", ["bd-1"]);

    expect(state.belief.decisions[0]!.supersededBy).toBe("bd-new");
  });

  it("updates updatedAt on superseded facts", () => {
    const state = cloneState();
    const oldDate = "2020-01-01T00:00:00.000Z";
    state.belief.facts.push(makeFact({ id: "bf-1", content: "Old fact", updatedAt: oldDate }));

    supersede(state, "bf-2", ["bf-1"]);

    const updated = state.belief.facts[0]!.updatedAt;
    expect(updated).not.toBe(oldDate);
    expect(isRecent(updated)).toBe(true);
  });

  it("updates updatedAt on superseded decisions", () => {
    const state = cloneState();
    const oldDate = "2020-01-01T00:00:00.000Z";
    state.belief.decisions.push(makeDecision({ id: "bd-1", content: "Old decision", updatedAt: oldDate }));

    supersede(state, "bd-2", ["bd-1"]);

    const updated = state.belief.decisions[0]!.updatedAt;
    expect(updated).not.toBe(oldDate);
    expect(isRecent(updated)).toBe(true);
  });

  it("leaves unrelated facts and decisions untouched", () => {
    const state = cloneState();
    state.belief.facts.push(makeFact({ id: "bf-1", content: "Target fact" }));
    state.belief.facts.push(makeFact({ id: "bf-2", content: "Untouched fact" }));
    state.belief.decisions.push(makeDecision({ id: "bd-1", content: "Untouched decision" }));

    supersede(state, "bf-new", ["bf-1"]);

    expect(state.belief.facts.find((f) => f.id === "bf-2")!.status).toBe("active");
    expect(state.belief.decisions.find((d) => d.id === "bd-1")!.status).toBe("active");
  });
});
