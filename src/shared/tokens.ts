"use strict";

/**
 * Rough token estimator. ~4 chars per token is the standard heuristic.
 */

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
