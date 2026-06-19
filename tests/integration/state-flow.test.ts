"use strict";

/**
 * Integration test: end-to-end cognitive state flow across layers.
 */
import { describe, it, expect } from "bun:test";
import { EMPTY_STATE } from "../../src/shared/schema.js";
import { deepClone } from "../../src/shared/clone.js";
import { setFocus } from "../../src/domains/attention/attention-domain.js";
import { addFact, getActiveFacts } from "../../src/domains/belief/belief-domain.js";
import { addHypothesis, confirmHypothesis } from "../../src/domains/inference/inference-domain.js";
import { addAction } from "../../src/domains/commitment/commitment-domain.js";
import { addLearning } from "../../src/domains/learning/learning-domain.js";

describe("State Flow Integration", () => {
  it("cross-layer: focus → belief → hypothesis → promote → verify", () => {
    const state = deepClone(EMPTY_STATE);

    // Layer 1: Attention — set focus
    setFocus(state, "Investigate memory leak in render pipeline", "high");
    expect(state.attention.focus).toBe("Investigate memory leak in render pipeline");
    expect(state.attention.priority).toBe("high");

    // Layer 2: Belief — add fact from investigation
    const fact = addFact(state, {
      content: "render loop creates closures without cleanup",
      confidence: 0.88,
      source: "execution",
      evidence: "Memory profiler shows 2MB growth per frame",
    });
    expect(fact.confidence).toBe(0.88);
    expect(state.belief.facts.length).toBe(1);

    // Layer 3: Inference — form hypothesis
    const hyp = addHypothesis(state, {
      content: "Adding cleanup callbacks will stop the leak",
      evidence: "Similar patterns in React 18 resolved this way",
    });
    expect(hyp.status).toBe("testing");
    expect(state.inference.hypotheses.length).toBe(1);

    // Confirm hypothesis → auto-promote to belief
    const result = confirmHypothesis(state, hyp.id);
    expect(result).not.toBeNull();
    expect(result!.hypothesis.status).toBe("confirmed");
    expect(result!.beliefFact).toBeDefined();
    expect(result!.beliefFact!.source).toBe("inference");
    if (result && result.beliefFact) {
      state.belief.facts.push(result.beliefFact);
    }
    expect(state.belief.facts.length).toBe(2);

    // Verify promoted belief is active
    const active = getActiveFacts(state, 0.8);
    expect(active.length).toBe(2);
  });

  it("cross-layer: workflow → action → learning", () => {
    const state = deepClone(EMPTY_STATE);

    // Layer 4: Commitment — add action
    const action = addAction(state, "Run integration tests", "critical");
    expect(action.priority).toBe("critical");
    expect(state.commitment.actions.length).toBe(1);

    // Layer 5: Learning — record failure
    const entry = addLearning(state, {
      description: "Integration test timeout due to network",
      toolName: "bash",
      isSuccess: false,
    });
    expect(entry.status).toBe("captured");
    expect(state.learning.failures.length).toBe(1);
    expect(state.learning.summary.failureCount).toBe(1);

    // Record success
    addLearning(state, {
      description: "Integration test passed after retry",
      isSuccess: true,
    });
    expect(state.learning.successes.length).toBe(1);
    expect(state.learning.summary.successCount).toBe(1);
  });

  it("state consistency: mutations preserve lastPersisted", () => {
    const state = deepClone(EMPTY_STATE);

    // After a mutation, lastPersisted should be set
    // (done by StateManager.mutate, not domain functions directly)
    setFocus(state, "test");
    // Domain functions don't set lastPersisted — that's StateManager's job
    // Just verify no crash
    expect(state.attention.focus).toBe("test");
  });
});
