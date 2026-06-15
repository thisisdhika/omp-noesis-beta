"use strict";

import { describe, it, expect } from "bun:test";
import type { NoesisState } from "../../src/schema.js";
import { EMPTY_STATE } from "../../src/schema.js";
import { addLearning, resolveLearning, getRankedLearning, getFailures } from "../../src/domains/learning/learning-domain.js";

describe("learning loop — failure capture and resolution", () => {
  it("should capture a failure learning entry with status 'captured'", () => {
    const state = structuredClone(EMPTY_STATE) as NoesisState;

    const entry = addLearning(state, {
      description: "Connection timeout when calling graphQL endpoint",
      toolName: "graphQuery",
      isSuccess: false,
    });

    expect(entry.status).toBe("captured");
    expect(entry.id).toMatch(/^le-/);
    expect(entry.description).toBe("Connection timeout when calling graphQL endpoint");
    expect(state.learning.failures).toHaveLength(1);
    expect(state.learning.summary.failureCount).toBe(1);
  });

  it("should resolve a failure entry and record root cause and fix", () => {
    const state = structuredClone(EMPTY_STATE) as NoesisState;

    const entry = addLearning(state, {
      description: "State persistence crash on concurrent write",
      toolName: "writeAtomic",
      isSuccess: false,
    });

    const resolved = resolveLearning(state, entry.id, "Missing file lock", "Added advisory file locking");

    expect(resolved).not.toBeNull();
    expect(resolved!.status).toBe("resolved");
    expect(resolved!.rootCause).toBe("Missing file lock");
    expect(resolved!.fix).toBe("Added advisory file locking");
    expect(resolved!.resolvedAt).toBeDefined();
    expect(state.learning.summary.resolvedCount).toBe(1);
  });

  it("should keep the resolved entry in the failures array with updated status", () => {
    const state = structuredClone(EMPTY_STATE) as NoesisState;

    const entry = addLearning(state, {
      description: "Flaky test due to async race condition",
      toolName: "testRunner",
      isSuccess: false,
    });

    resolveLearning(state, entry.id, "Missing await in test setup", "Added await before assertions");
    const failures = getFailures(state);

    // Resolved entries are still in failures array but filtered out by getFailures
    expect(state.learning.failures).toHaveLength(1);
    expect(state.learning.failures[0]!.status).toBe("resolved");
    expect(failures).toHaveLength(0);
  });

  it("should return null when resolving a non-existent entry", () => {
    const state = structuredClone(EMPTY_STATE) as NoesisState;
    const result = resolveLearning(state, "le-nonexistent", "N/A", "N/A");

    expect(result).toBeNull();
  });

  it("should rank failure entries higher than success entries", () => {
    const state = structuredClone(EMPTY_STATE) as NoesisState;

    // Add two entries with same capturedAt semantics — use addLearning for both
    const success = addLearning(state, {
      description: "Successfully implemented caching layer",
      isSuccess: true,
    });
    const failure = addLearning(state, {
      description: "Memory leak in cache invalidation",
      isSuccess: false,
    });

    // getRankedLearning merges and ranks by score: failures get 1.5x multiplier
    const ranked = getRankedLearning(state, 5);

    // Failure should rank first (higher score due to failureMultiplier)
    expect(ranked[0]!.id).toBe(failure.id);
    expect(ranked[1]!.id).toBe(success.id);
  });

  it("should capture a success learning entry", () => {
    const state = structuredClone(EMPTY_STATE) as NoesisState;

    const entry = addLearning(state, {
      description: "Optimized database query reduced latency by 60%",
      skillScope: "performance",
      isSuccess: true,
    });

    expect(entry.status).toBe("captured");
    expect(state.learning.successes).toHaveLength(1);
    expect(state.learning.summary.successCount).toBe(1);
  });
});
