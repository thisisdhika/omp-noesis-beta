"use strict";

/**
 * omp-noesis: Human-in-the-Loop Review Strategy
 *
 * Determines when beliefs should be flagged for human review.
 * Gates: high confidence + high epistemic status + non-execution source.
 */

import type { BeliefFact, BeliefSource, EpistemicStatus, NoesisState } from "../../shared/schema.js";

/**
 * Thresholds that trigger a review gate on newly created beliefs.
 */
export const REVIEW_THRESHOLDS = {
  minConfidence: 0.85,
  minEpistemicStatus: ["certain", "probable"] as EpistemicStatus[],
  excludeSources: ["execution"] as BeliefSource[],
} as const;

/**
 * Determine whether a belief should be flagged for human review.
 * Returns true only when all gates pass: active status, confidence above threshold,
 * epistemic status is certain or probable, and source is not in the exclude list.
 */
export function shouldReview(belief: BeliefFact): boolean {
  if (belief.status !== "active") return false;
  if (belief.confidence < REVIEW_THRESHOLDS.minConfidence) return false;
  if (!REVIEW_THRESHOLDS.minEpistemicStatus.includes(belief.epistemicStatus)) return false;
  if (REVIEW_THRESHOLDS.excludeSources.includes(belief.source)) return false;
  return true;
}

/**
 * Get all active beliefs that have been flagged for human review.
 */
export function getPendingReviews(state: NoesisState): BeliefFact[] {
  return state.belief.facts.filter(
    (fact) => fact.reviewRequired === true && fact.status === "active",
  );
}
