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
