"use strict";

/**
 * Confidence Strategy — numeric confidence mapping and staleness penalty.
 * Version: 1.0.0
 *
 * Maps graph confidence levels to numeric values.
 *
 * @module confidence-strategy
 */

import type { GraphFinding } from "../attention/schema.js";

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
      base = finding.inferredConfidence !== undefined ? finding.inferredConfidence : 0.7;
      break;
    }
    case "AMBIGUOUS": {
      base = 0.55;
      break;
    }
  }

  if (finding.confidence !== "INFERRED" && finding.inferredConfidence !== undefined) {
    base = Math.max(base, finding.inferredConfidence);
  }

  return base;
}

/**
 * Apply a stale-penalty deduction for evidence committed from a stale graph.
 *
 * When `staleHours > 24` (graph modification is more than 24 hours old),
 * reduces the confidence value by 0.10, floored at 0.55.
 * Confidences at or below 0.55 are returned unchanged.
 * Null/undefined `staleHours` (unknown or missing graph) applies no penalty.
 *
 * This is called at commit time (believe-tool), not at render time, so the
 * stored belief already reflects the penalty and display code shows the raw
 * stored value without a second subtraction.
 *
 * @param confidence - Numeric confidence to penalize [0.55 … 1.0]
 * @param staleHours - Age of the graph in hours, or null/undefined if unknown
 * @returns Penalized confidence, never below 0.55
 */
export function applyStalePenalty(
  confidence: number,
  staleHours: number | null | undefined,
): number {
  // ponytail: no penalty for missing/unknown age or fresh graph
  if (staleHours === null || staleHours === undefined) return confidence;
  if (staleHours <= 24) return confidence;
  // ponytail: -0.10 for stale graph, floor at 0.55
  return Math.max(0.55, confidence - 0.10);
}
