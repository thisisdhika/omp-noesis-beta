"use strict";

/**
 * omp-noesis: State Cleanup Unit Tests
 *
 * Tests for evictStale, evictOverCap, and fullCleanup.
 */

import { describe, it, expect } from "bun:test";
import { evictStale, evictOverCap, fullCleanup } from "../../../src/rendering/state-cleanup.js";
import { EMPTY_STATE, CAPS, generateId } from "../../../src/schema.js";
import type { NoesisState, BeliefFact, BeliefDecision, Hypothesis, WorkflowStep, PlannedAction, LearningEntry } from "../../../src/schema.js";
import { now } from "../../../src/shared/time.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OLD_TIMESTAMP = "2020-01-01T00:00:00.000Z";
const RECENT_TIMESTAMP = "2099-01-01T00:00:00.000Z";
const TS = now();

function freshState(): NoesisState {
  return structuredClone(EMPTY_STATE);
}

// ---------------------------------------------------------------------------
// evictStale
// ---------------------------------------------------------------------------

describe("evictStale", () => {
  it("returns 0 for empty state", () => {
    const state = freshState();
    expect(evictStale(state)).toBe(0);
  });

  it("does not remove active beliefs", () => {
    const state = freshState();
    state.belief.facts.push({
      id: "bf-test-001",
      content: "active fact",
      confidence: 0.8,
      source: "graph",
      createdAt: OLD_TIMESTAMP,
      updatedAt: OLD_TIMESTAMP,
      status: "active",
    });
    expect(evictStale(state)).toBe(0);
    expect(state.belief.facts).toHaveLength(1);
  });

  it("removes archived beliefs older than 30 days", () => {
    const state = freshState();
    state.belief.facts.push({
      id: "bf-test-001",
      content: "archived old fact",
      confidence: 0.8,
      source: "graph",
      createdAt: OLD_TIMESTAMP,
      updatedAt: OLD_TIMESTAMP,
      status: "archived",
    });
    expect(evictStale(state)).toBe(1);
    expect(state.belief.facts).toHaveLength(0);
  });

  it("does not remove superseded beliefs regardless of age", () => {
    // evictStale only removes archived facts, not superseded
    const state = freshState();
    state.belief.facts.push({
      id: "bf-test-001",
      content: "superseded fact",
      confidence: 0.8,
      source: "graph",
      createdAt: OLD_TIMESTAMP,
      updatedAt: OLD_TIMESTAMP,
      status: "superseded",
    });
    expect(evictStale(state)).toBe(0);
    expect(state.belief.facts).toHaveLength(1);
  });

  it("removes archived decisions older than 30 days", () => {
    const state = freshState();
    state.belief.decisions.push({
      id: "bd-test-001",
      content: "archived decision",
      rationale: "because",
      source: "user",
      createdAt: OLD_TIMESTAMP,
      updatedAt: OLD_TIMESTAMP,
      status: "archived",
    });
    expect(evictStale(state)).toBe(1);
    expect(state.belief.decisions).toHaveLength(0);
  });

  it("does not remove archived decisions that are recent", () => {
    const state = freshState();
    state.belief.decisions.push({
      id: "bd-test-001",
      content: "recent archived decision",
      rationale: "because",
      source: "user",
      createdAt: RECENT_TIMESTAMP,
      updatedAt: RECENT_TIMESTAMP,
      status: "archived",
    });
    expect(evictStale(state)).toBe(0);
    expect(state.belief.decisions).toHaveLength(1);
  });

  it("removes abandoned hypotheses older than 30 days", () => {
    const state = freshState();
    state.inference.hypotheses.push({
      id: "hy-test-001",
      content: "abandoned hypothesis",
      status: "abandoned",
      createdAt: OLD_TIMESTAMP,
      updatedAt: OLD_TIMESTAMP,
    });
    expect(evictStale(state)).toBe(1);
    expect(state.inference.hypotheses).toHaveLength(0);
  });

  it("does not remove abandoned hypotheses that are recent", () => {
    const state = freshState();
    state.inference.hypotheses.push({
      id: "hy-test-001",
      content: "recent abandoned",
      status: "abandoned",
      createdAt: RECENT_TIMESTAMP,
      updatedAt: RECENT_TIMESTAMP,
    });
    expect(evictStale(state)).toBe(0);
    expect(state.inference.hypotheses).toHaveLength(1);
  });

  it("removes stale learning entries older than 30 days (unresolved)", () => {
    const state = freshState();
    state.learning.failures.push({
      id: "le-test-001",
      description: "stale learning",
      status: "captured",
      capturedAt: OLD_TIMESTAMP,
    });
    expect(evictStale(state)).toBe(1);
    expect(state.learning.failures).toHaveLength(0);
  });

  it("preserves resolved learning entries regardless of age", () => {
    const state = freshState();
    state.learning.failures.push({
      id: "le-test-001",
      description: "resolved old entry",
      status: "resolved",
      capturedAt: OLD_TIMESTAMP,
    });
    expect(evictStale(state)).toBe(0);
    expect(state.learning.failures).toHaveLength(1);
  });

  it("tracks removal count correctly across multiple layers", () => {
    const state = freshState();

    // Add an archived old fact
    state.belief.facts.push({
      id: "bf-test-001",
      content: "old archived fact",
      confidence: 0.7,
      source: "graph",
      createdAt: OLD_TIMESTAMP,
      updatedAt: OLD_TIMESTAMP,
      status: "archived",
    });

    // Add an archived old decision
    state.belief.decisions.push({
      id: "bd-test-001",
      content: "old archived decision",
      rationale: "reason",
      source: "user",
      createdAt: OLD_TIMESTAMP,
      updatedAt: OLD_TIMESTAMP,
      status: "archived",
    });

    // Add an abandoned old hypothesis
    state.inference.hypotheses.push({
      id: "hy-test-001",
      content: "old abandoned hypo",
      status: "abandoned",
      createdAt: OLD_TIMESTAMP,
      updatedAt: OLD_TIMESTAMP,
    });

    expect(evictStale(state)).toBe(3);
    expect(state.belief.facts).toHaveLength(0);
    expect(state.belief.decisions).toHaveLength(0);
    expect(state.inference.hypotheses).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// evictOverCap
// ---------------------------------------------------------------------------

describe("evictOverCap", () => {
  it("returns 0 when state is under all caps", () => {
    const state = freshState();
    expect(evictOverCap(state)).toBe(0);
  });

  it("trims graphFindings over CAPS.graphQueries keeping newest", () => {
    const state = freshState();
    const cap = CAPS.graphQueries;
    // Add cap + 1 findings
    for (let i = 0; i < cap + 1; i++) {
      state.attention.graphFindings.push({
        query: `query-${i}`,
        nodes: [],
        relations: [],
        confidence: "EXTRACTED",
        timestamp: `2025-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
      });
    }
    expect(evictOverCap(state)).toBe(1);
    expect(state.attention.graphFindings).toHaveLength(cap);
    // The newest should be kept; the oldest (day 1) should be gone
    const queries = state.attention.graphFindings.map((f) => f.query);
    expect(queries).not.toContain("query-0");
    expect(queries).toContain(`query-${cap}`);
  });

  it("trims workflow steps over CAPS.workflowSteps", () => {
    const state = freshState();
    const cap = CAPS.workflowSteps;
    // Add cap + 2 steps
    for (let i = 0; i < cap + 2; i++) {
      state.commitment.workflow.steps.push({
        id: `ws-${String(i).padStart(3, "0")}`,
        description: `Step ${i}`,
        status: "pending",
        createdAt: TS,
        updatedAt: TS,
      });
    }
    expect(state.commitment.workflow.steps).toHaveLength(cap + 2);
    expect(evictOverCap(state)).toBe(2);
    expect(state.commitment.workflow.steps).toHaveLength(cap);
    // First cap steps kept; the last 2 dropped
    expect(state.commitment.workflow.steps[0]!.id).toBe("ws-000");
    expect(state.commitment.workflow.steps[cap - 1]!.id).toBe(
      `ws-${String(cap - 1).padStart(3, "0")}`,
    );
  });

  it("trims actions over CAPS.actions", () => {
    const state = freshState();
    const cap = CAPS.actions;
    // Add cap + 1 actions
    for (let i = 0; i < cap + 1; i++) {
      state.commitment.actions.push({
        id: `pa-${String(i).padStart(3, "0")}`,
        content: `Action ${i}`,
        priority: "normal",
        createdAt: TS,
      });
    }
    expect(evictOverCap(state)).toBe(1);
    expect(state.commitment.actions).toHaveLength(cap);
    expect(state.commitment.actions[0]!.id).toBe("pa-000");
  });

  it("trims learning successes over CAPS.learningEntries", () => {
    const state = freshState();
    const cap = CAPS.learningEntries;
    // Add cap + 1 successes
    for (let i = 0; i < cap + 1; i++) {
      state.learning.successes.push({
        id: `le-s-${String(i).padStart(3, "0")}`,
        description: `Success ${i}`,
        status: "resolved",
        capturedAt: new Date(2025, 0, i + 1).toISOString(),
      });
    }
    expect(evictOverCap(state)).toBe(1);
    expect(state.learning.successes).toHaveLength(cap);
  });

  it("trims learning failures over CAPS.learningEntries", () => {
    const state = freshState();
    const cap = CAPS.learningEntries;
    // Add cap + 1 failures
    for (let i = 0; i < cap + 1; i++) {
      state.learning.failures.push({
        id: `le-f-${String(i).padStart(3, "0")}`,
        description: `Failure ${i}`,
        status: "captured",
        capturedAt: new Date(2025, 0, i + 1).toISOString(),
      });
    }
    expect(evictOverCap(state)).toBe(1);
    expect(state.learning.failures).toHaveLength(cap);
  });
});

// ---------------------------------------------------------------------------
// fullCleanup
// ---------------------------------------------------------------------------

describe("fullCleanup", () => {
  it("runs both evictStale and evictOverCap and returns combined count", () => {
    const state = freshState();

    // Add a stale archived fact (removed by evictStale)
    state.belief.facts.push({
      id: "bf-test-001",
      content: "old archived fact",
      confidence: 0.7,
      source: "graph",
      createdAt: OLD_TIMESTAMP,
      updatedAt: OLD_TIMESTAMP,
      status: "archived",
    });

    // Add cap + 1 graph findings (trimmed by evictOverCap)
    for (let i = 0; i < CAPS.graphQueries + 1; i++) {
      state.attention.graphFindings.push({
        query: `query-${i}`,
        nodes: [],
        relations: [],
        confidence: "EXTRACTED",
        timestamp: new Date(2025, 0, i + 1).toISOString(),
      });
    }

    const total = fullCleanup(state);
    // evictStale removed 1 fact + evictOverCap removed 1 finding = 2
    expect(total).toBe(2);
    expect(state.belief.facts).toHaveLength(0);
    expect(state.attention.graphFindings).toHaveLength(CAPS.graphQueries);
  });

  it("returns 0 when state is already clean", () => {
    const state = freshState();
    expect(fullCleanup(state)).toBe(0);
  });
});
