"use strict";

import { describe, it, expect } from "bun:test";
import { cloneState } from "../helpers/fixtures.js";
import { now } from "../../src/shared/time.js";
import { shouldReview, getPendingReviews } from "../../src/domains/belief/review-strategy.js";
import type { BeliefFact } from "../../src/shared/schema.js";

function makeFact(overrides: Partial<BeliefFact> & { id: string; content: string }): BeliefFact {
  return {
    confidence: 0.9,
    source: "graph",
    createdAt: now(),
    updatedAt: now(),
    status: "active",
    epistemicStatus: "certain",
    reviewRequired: false,
    scope: "local" as const,
    revision: 0,
    ...overrides,
  };
}

describe("human-in-the-loop review gating", () => {
  describe("shouldReview", () => {
    it("returns true for certain+high confidence non-execution fact", () => {
      const fact = makeFact({
        id: "bf-1",
        content: "High confidence belief",
        confidence: 0.9,
        source: "graph",
        epistemicStatus: "certain",
      });
      expect(shouldReview(fact)).toBe(true);
    });

    it("returns true for probable+high confidence non-execution fact", () => {
      const fact = makeFact({
        id: "bf-2",
        content: "Probable high confidence",
        confidence: 0.92,
        source: "user",
        epistemicStatus: "probable",
      });
      expect(shouldReview(fact)).toBe(true);
    });

    it("returns false for speculative epistemic status", () => {
      const fact = makeFact({
        id: "bf-3",
        content: "Speculative belief",
        confidence: 0.95,
        source: "graph",
        epistemicStatus: "speculative",
      });
      expect(shouldReview(fact)).toBe(false);
    });

    it("returns false for execution source regardless of confidence", () => {
      const fact = makeFact({
        id: "bf-4",
        content: "Execution belief",
        confidence: 0.95,
        source: "execution",
        epistemicStatus: "certain",
      });
      expect(shouldReview(fact)).toBe(false);
    });

    it("returns false for confidence below threshold", () => {
      const fact = makeFact({
        id: "bf-5",
        content: "Low confidence belief",
        confidence: 0.7,
        source: "graph",
        epistemicStatus: "certain",
      });
      expect(shouldReview(fact)).toBe(false);
    });

    it("returns false for non-active (archived) facts", () => {
      const fact = makeFact({
        id: "bf-6",
        content: "Archived belief",
        confidence: 0.9,
        source: "graph",
        epistemicStatus: "certain",
        status: "archived",
      });
      expect(shouldReview(fact)).toBe(false);
    });

    it("returns false for deprecated epistemic status", () => {
      const fact = makeFact({
        id: "bf-7",
        content: "Deprecated belief",
        confidence: 0.95,
        source: "graph",
        epistemicStatus: "deprecated",
      });
      expect(shouldReview(fact)).toBe(false);
    });

    it("returns false for contradicted epistemic status", () => {
      const fact = makeFact({
        id: "bf-8",
        content: "Contradicted belief",
        confidence: 0.95,
        source: "graph",
        epistemicStatus: "contradicted",
      });
      expect(shouldReview(fact)).toBe(false);
    });
  });

  describe("getPendingReviews", () => {
    it("returns active facts flagged with reviewRequired", () => {
      const state = cloneState();
      const fact = makeFact({
        id: "bf-p1",
        content: "Needs review",
        confidence: 0.9,
        source: "graph",
        epistemicStatus: "certain",
        reviewRequired: true,
      });
      state.belief.facts.push(fact);

      const pending = getPendingReviews(state);
      expect(pending).toHaveLength(1);
      expect(pending[0]!.id).toBe("bf-p1");
    });

    it("excludes facts not flagged for review", () => {
      const state = cloneState();
      state.belief.facts.push(
        makeFact({
          id: "bf-p2",
          content: "Not flagged",
          confidence: 0.9,
          source: "graph",
          epistemicStatus: "certain",
          reviewRequired: false,
        }),
      );

      expect(getPendingReviews(state)).toHaveLength(0);
    });

    it("excludes archived facts even if flagged", () => {
      const state = cloneState();
      state.belief.facts.push(
        makeFact({
          id: "bf-p3",
          content: "Archived flagged",
          confidence: 0.9,
          source: "graph",
          epistemicStatus: "certain",
          reviewRequired: true,
          status: "archived",
        }),
      );

      expect(getPendingReviews(state)).toHaveLength(0);
    });

    it("returns multiple pending reviews", () => {
      const state = cloneState();
      state.belief.facts.push(
        makeFact({
          id: "bf-p4",
          content: "Pending one",
          confidence: 0.9,
          source: "graph",
          epistemicStatus: "certain",
          reviewRequired: true,
        }),
        makeFact({
          id: "bf-p5",
          content: "Pending two",
          confidence: 0.95,
          source: "user",
          epistemicStatus: "probable",
          reviewRequired: true,
        }),
      );

      expect(getPendingReviews(state)).toHaveLength(2);
    });
  });
});
