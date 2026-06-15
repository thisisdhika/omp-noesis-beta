"use strict";

/**
 * Confidence Strategy — numeric confidence mapping and staleness penalty.
 *
 * Maps graph confidence levels to numeric values and applies a
 * time-based decay penalty for beliefs that have not been updated
 * beyond a configurable threshold.
 *
 * @module confidence-strategy
 */

import type { BeliefFact, GraphFinding } from "../../schema.js";
import { CAPS } from "../../schema.js";
import { isStaleHours } from "../../shared/time.js";

/**
 * Map a GraphFinding's confidence label to a numeric value.
 *
 * Mapping:
 *   EXTRACTED → 1.0
 *   INFERRED  → inferredConfidence if present, else 0.7
 *   AMBIGUOUS → 0.55
 *
 * For EXTRACTED and AMBIGUOUS, an optional `inferredConfidence` value
 * may raise the result via Math.max. For INFERRED, `inferredConfidence`
 * is used directly when present.
 *
 * @param finding - The graph finding to evaluate.
 * @returns Numeric confidence in [0.55, 0.95] (or higher if
 *   inferredConfidence exceeds the mapping).
 */
export function mapGraphConfidence(finding: GraphFinding): number {
  let base: number;

  switch (finding.confidence) {
    case "EXTRACTED": {
      base = 1.0;
      break;
    }
    case "INFERRED": {
      // Use inferredConfidence directly when present; fall back to 0.7
      base = finding.inferredConfidence !== undefined ? finding.inferredConfidence : 0.7;
      break;
    }
    case "AMBIGUOUS": {
      base = 0.55;
      break;
    }
  }

  // For non-INFERRED types, apply Math.max with inferredConfidence if present
  if (finding.confidence !== "INFERRED" && finding.inferredConfidence !== undefined) {
    base = Math.max(base, finding.inferredConfidence);
  }

  return base;
}

/**
 * Apply a staleness penalty to a belief fact's confidence.
 *
 * If `staleHours` is not provided, the confidence is returned unchanged.
 * Otherwise, if the fact's `updatedAt` is older than `staleHours` hours,
 * the confidence is reduced by 0.10 (floored at 0.55).
 *
 * The result is always clamped to [0, 1].
 *
 * @param fact - The belief fact to evaluate.
 * @param staleHours - Optional staleness threshold in hours.
 * @returns Adjusted confidence in [0, 1].
 */
export function applyStalePenalty(
  fact: BeliefFact,
  staleHours?: number,
): number {
  if (staleHours === undefined) {
    return fact.confidence;
  }

  let adjusted = fact.confidence;

  if (isStaleHours(fact.updatedAt, staleHours)) {
    adjusted = Math.max(0.55, adjusted - 0.10);
  }

  return Math.max(0, Math.min(1, adjusted));
}
