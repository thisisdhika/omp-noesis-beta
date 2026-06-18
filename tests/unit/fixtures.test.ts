"use strict";

/**
 * Unit tests for test helper fixtures — verifies every exported function
 * produces the expected shape and data types.
 */

import { describe, it, expect } from "bun:test";
import {
  cleanPersistedState,
  cloneState,
  freshState,
  populatedState,
  sampleFact,
  sampleDecision,
  sampleHypothesis,
  sampleLearning,
  OLD_TIMESTAMP,
  RECENT_TIMESTAMP,
} from "../helpers/fixtures.js";

describe("fixtures", () => {
  describe("cloneState", () => {
    it("should return a deep clone of EMPTY_STATE", () => {
      const state = cloneState();
      expect(state).toBeDefined();
      expect(state.attention.focus).toBe("");
      expect(state.belief.facts).toBeEmpty();
      expect(state.belief.decisions).toBeEmpty();
    });

    it("should return a new object each call", () => {
      const a = cloneState();
      const b = cloneState();
      expect(a).not.toBe(b);
    });
  });

  describe("freshState", () => {
    it("should return cloned EMPTY_STATE (alias for cloneState)", () => {
      const state = freshState();
      expect(state).toBeDefined();
      expect(state.attention.focus).toBe("");
    });
  });

  describe("cleanPersistedState", () => {
    it("should silently handle non-existent state file", () => {
      // No .omp/noesis/state.json exists in temp — should no-op without throwing
      expect(() => cleanPersistedState()).not.toThrow();
    });
  });

  describe("populatedState", () => {
    it("should return state with a belief fact", () => {
      const state = populatedState();
      expect(state.belief.facts.length).toBeGreaterThan(0);
      expect(state.belief.facts[0]!.content).toContain("TypeScript");
    });

    it("should return state with a belief decision", () => {
      const state = populatedState();
      expect(state.belief.decisions.length).toBeGreaterThan(0);
      expect(state.belief.decisions[0]!.content).toContain("Zod");
    });

    it("should return state with a hypothesis", () => {
      const state = populatedState();
      expect(state.inference.hypotheses.length).toBeGreaterThan(0);
    });

    it("should return state with a workflow", () => {
      const state = populatedState();
      expect(state.commitment.workflow.goal).toBe("Implement cognitive substrate");
      expect(state.commitment.workflow.steps.length).toBe(2);
    });

    it("should return state with a learning entry", () => {
      const state = populatedState();
      expect(state.learning.failures.length).toBeGreaterThan(0);
    });

    it("should return a new object each call", () => {
      const a = populatedState();
      const b = populatedState();
      expect(a).not.toBe(b);
    });
  });

  describe("sampleFact", () => {
    it("should return a belief fact with default values", () => {
      const fact = sampleFact();
      expect(fact.id).toStartWith("bf-");
      expect(fact.content).toBe("Test fact");
      expect(fact.confidence).toBe(0.8);
      expect(fact.source).toBe("execution");
      expect(fact.status).toBe("active");
    });

    it("should merge provided overrides", () => {
      const fact = sampleFact({ content: "Custom content", confidence: 0.95 });
      expect(fact.content).toBe("Custom content");
      expect(fact.confidence).toBe(0.95);
    });
  });

  describe("sampleDecision", () => {
    it("should return a belief decision with default values", () => {
      const decision = sampleDecision();
      expect(decision.id).toStartWith("bd-");
      expect(decision.content).toBe("Test decision");
      expect(decision.rationale).toBe("Because it works");
      expect(decision.source).toBe("user");
    });

    it("should merge provided overrides", () => {
      const decision = sampleDecision({ content: "Custom" });
      expect(decision.content).toBe("Custom");
    });
  });

  describe("sampleHypothesis", () => {
    it("should return a hypothesis with default values", () => {
      const hypothesis = sampleHypothesis();
      expect(hypothesis.id).toStartWith("hy-");
      expect(hypothesis.content).toBe("Test hypothesis");
      expect(hypothesis.status).toBe("testing");
    });

    it("should merge provided overrides", () => {
      const hypothesis = sampleHypothesis({ content: "Custom hypothesis", status: "confirmed" });
      expect(hypothesis.content).toBe("Custom hypothesis");
      expect(hypothesis.status).toBe("confirmed");
    });
  });

  describe("sampleLearning", () => {
    it("should return a learning entry with default values", () => {
      const learning = sampleLearning();
      expect(learning.id).toStartWith("le-");
      expect(learning.description).toBe("Test learning entry");
      expect(learning.status).toBe("captured");
    });

    it("should merge provided overrides", () => {
      const learning = sampleLearning({ description: "Custom learning", status: "resolved" });
      expect(learning.description).toBe("Custom learning");
      expect(learning.status).toBe("resolved");
    });
  });

  describe("constants", () => {
    it("should export OLD_TIMESTAMP", () => {
      expect(OLD_TIMESTAMP).toBe("2020-01-01T00:00:00.000Z");
    });

    it("should export RECENT_TIMESTAMP", () => {
      expect(RECENT_TIMESTAMP).toBe("2099-01-01T00:00:00.000Z");
    });
  });
});
