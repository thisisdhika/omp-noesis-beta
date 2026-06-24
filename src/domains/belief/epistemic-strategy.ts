"use strict";

/**
 * omp-noesis: Epistemic Status Strategy
 *
 * Classifies and manages epistemic status tags beyond binary belief.
 * Maps confidence + source onto a 5-level epistemic ladder and handles
 * demotion under contradiction.
 */

import type { BeliefFact, EpistemicStatus, BeliefSource } from "./schema.js";

/**
 * Classify a fact's epistemic status from its confidence and source.
 *
 * Rules (ordered by priority):
 * - graph + confidence >= 0.9 → certain
 * - graph + confidence >= 0.7 → probable
 * - user + confidence >= 0.9 → certain
 * - user + confidence >= 0.7 → probable
 * - execution → certain (direct observation)
 * - inference + confidence >= 0.75 → probable
 * - default → speculative
 */
export function classifyEpistemicStatus(params: {
  confidence: number;
  source: BeliefSource;
  evidence?: string;
}): EpistemicStatus {
  const { confidence, source } = params;

  if (source === "execution") return "certain";

  if (source === "graph") {
    if (confidence >= 0.9) return "certain";
    if (confidence >= 0.7) return "probable";
  }

  if (source === "user") {
    if (confidence >= 0.9) return "certain";
    if (confidence >= 0.7) return "probable";
  }

  if (source === "inference") {
    if (confidence >= 0.75) return "probable";
  }

  return "speculative";
}

/**
 * Demote a fact's epistemic status when contradicted.
 *
 * - certain → probable
 * - probable → speculative
 * - anything else → unchanged
 */
export function demoteOnContradiction(fact: BeliefFact): EpistemicStatus {
  switch (fact.epistemicStatus) {
    case "certain":
      return "probable";
    case "probable":
      return "speculative";
    default:
      return fact.epistemicStatus;
  }
}
