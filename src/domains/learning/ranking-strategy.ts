"use strict";

/**
 * Ranking strategy for learning entries.
 *
 * Ranks entries by a composite score: recency × taskRelevance × failureMultiplier × resolvedFixMultiplier.
 * Used by the learning domain to surface the most actionable entries first.
 */

import type { LearningEntry } from "../../schema.js";

/**
 * Rank entries by descending score.
 * Entries with equal scores retain their relative order.
 */
export function rank(entries: LearningEntry[], isFailure?: (entry: LearningEntry) => boolean): LearningEntry[] {
  const failPredicate = isFailure ?? (() => false);
  return [...entries].sort((a, b) => {
    const scoreA = computeRank(a, failPredicate(a));
    const scoreB = computeRank(b, failPredicate(b));
    return scoreB - scoreA;
  });
}

/**
 * Compute a composite ranking score for a single learning entry.
 *
 * score = recency × taskRelevance × failureMultiplier × resolvedFixMultiplier
 *
 * @param entry    The learning entry to score.
 * @param isFailure  True if this entry lives in the failures array (default false).
 */
export function computeRank(entry: LearningEntry, isFailure: boolean = false): number {
  const recency = getRecency(entry.capturedAt);
  const taskRelevance = 1.0;
  const failureMultiplier = isFailure ? 1.5 : 1.0;
  const resolvedFixMultiplier = entry.status === "resolved" ? 2.0 : 1.0;
  return recency * taskRelevance * failureMultiplier * resolvedFixMultiplier;
}

/**
 * Determine recency factor based on age.
 *
 * - ≤ 24 hours → 1.0
 * - ≤ 7 days   → 0.5
 * - older      → 0.1
 */
function getRecency(capturedAt: string): number {
  const ageMs = Date.now() - Date.parse(capturedAt);
  if (Number.isNaN(ageMs)) return 0.1; // unparseable = stale

  const msPerHour = 60 * 60 * 1000;
  const msPerDay = 24 * msPerHour;

  if (ageMs <= msPerDay) return 1.0;
  if (ageMs <= 7 * msPerDay) return 0.5;
  return 0.1;
}
