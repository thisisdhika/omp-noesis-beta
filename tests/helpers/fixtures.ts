"use strict";

/**
 * Test fixtures — reusable test data for omp-noesis unit tests.
 */

import type { NoesisState, BeliefFact, BeliefDecision, Hypothesis, Workflow, LearningEntry } from "../../src/shared/schema.js";
import { EMPTY_STATE, generateId } from "../../src/shared/schema.js";
import { now } from "../../src/shared/time.js";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

/** Old timestamp for staleness tests. */
export const OLD_TIMESTAMP = "2020-01-01T00:00:00.000Z";

/** Recent timestamp for non-stale tests. */
export const RECENT_TIMESTAMP = "2099-01-01T00:00:00.000Z";

/** Clone EMPTY_STATE with full type inference (avoids `as NoesisState` casts). */
export function cloneState(): NoesisState {
  return structuredClone(EMPTY_STATE);
}

/** Create a fresh empty state for testing (alias for cloneState). */
export function freshState(): NoesisState {
  return cloneState();
}

/** Remove persisted state.json so tests start from EMPTY_STATE. */
export function cleanPersistedState(): void {
  const statePath = join(process.cwd(), ".omp", "noesis", "state.json");
  try {
    if (existsSync(statePath)) unlinkSync(statePath);
  } catch {
    // best-effort cleanup
  }
}

/** A minimal NoesisState with some data pre-populated for testing. */
export function populatedState(): NoesisState {
  const state = structuredClone(EMPTY_STATE);

  // Add a belief fact
  state.belief.facts.push({
    id: generateId("bf"),
    content: "TypeScript strict mode prevents common runtime errors",
    confidence: 0.9,
    source: "execution",
    createdAt: now(),
    updatedAt: now(),
    status: "active",
    tags: ["typescript", "safety"],
    epistemicStatus: "certain",
    scope: "local",
    revision: 0,
    reviewRequired: false,
  });

  // Add a belief decision
  state.belief.decisions.push({
    id: generateId("bd"),
    content: "Use Zod for runtime validation",
    rationale: "Provides type-safe runtime checks beyond TypeScript compile-time checks",
    status: "active",
    source: "user",
    createdAt: now(),
    updatedAt: now(),
    tags: ["validation", "architecture"],
    scope: "local",
    revision: 0,
  });

  // Add a hypothesis
  state.inference.hypotheses.push({
    id: generateId("hy"),
    content: "Atomic writes prevent state corruption during concurrent access",
    status: "testing",
    createdAt: now(),
    updatedAt: now(),
    tags: ["persistence"],
  });

  // Set up workflow
  state.commitment.workflow.goal = "Implement cognitive substrate";
  state.commitment.workflow.status = "active";
  state.commitment.workflow.steps = [
    {
      id: generateId("ws"),
      description: "Write shared utilities",
      status: "done",
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: generateId("ws"),
      description: "Write domain logic",
      status: "active",
      dependsOn: [state.commitment.workflow.steps.length > 0 ? state.commitment.workflow.steps[0]!.id : ""],
      createdAt: now(),
      updatedAt: now(),
    },
  ];

  // Add learning entry
  state.learning.failures.push({
    id: generateId("le"),
    description: "State corruption after unhandled exception during write",
    status: "captured",
    capturedAt: now(),
    toolName: "writeAtomic",
  });

  return state;
}

/** A simple belief fact for testing. */
export function sampleFact(overrides?: Partial<BeliefFact>): BeliefFact {
  return {
    id: generateId("bf"),
    content: "Test fact",
    confidence: 0.8,
    source: "execution",
    createdAt: now(),
    updatedAt: now(),
    status: "active",
    epistemicStatus: "speculative",
    reviewRequired: false,
    scope: "local",
    revision: 0,
    ...overrides,
  };
}

/** A simple belief decision for testing. */
export function sampleDecision(overrides?: Partial<BeliefDecision>): BeliefDecision {
  return {
    id: generateId("bd"),
    content: "Test decision",
    rationale: "Because it works",
    source: "user",
    createdAt: now(),
    updatedAt: now(),
    status: "active",
    scope: "local",
    revision: 0,
    ...overrides,
  };
}

/** A simple hypothesis for testing. */
export function sampleHypothesis(overrides?: Partial<Hypothesis>): Hypothesis {
  return {
    id: generateId("hy"),
    content: "Test hypothesis",
    status: "testing",
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

/** A simple learning entry for testing. */
export function sampleLearning(overrides?: Partial<LearningEntry>): LearningEntry {
  return {
    id: generateId("le"),
    description: "Test learning entry",
    status: "captured",
    capturedAt: now(),
    ...overrides,
  };
}
