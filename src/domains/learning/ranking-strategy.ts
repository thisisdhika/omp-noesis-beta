"use strict";

/**
 * Ranking strategy for learning entries.
 * Version: 0.1.0
 *
 * Ranks entries by a composite score: recency × taskRelevance × failureMultiplier × resolvedFixMultiplier.
 * Used by the learning domain to surface the most actionable entries first.
 */

import type { LearningEntry } from "../../schema.js";

/**
 * Rank entries by descending score.
 * Entries with equal scores retain their relative order.
 *
 * @param entries     The learning entries to rank.
 * @param isFailure   Optional predicate returning true for failure entries.
 * @param taskDomain  Optional domain for relevance scoring against entry.toolName.
 */
export function rank(entries: LearningEntry[], isFailure?: (entry: LearningEntry) => boolean, taskDomain?: string): LearningEntry[] {
  const failPredicate = isFailure ?? (() => false);

  // Determine position-based recency: sort by capturedAt descending,
  // then each entry gets recency = Math.max(0, 1.0 - index * 0.2)
  const sortedByTime = [...entries].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  const recencyMap = new Map<LearningEntry, number>();
  for (let i = 0; i < sortedByTime.length; i++) {
    recencyMap.set(sortedByTime[i]!, Math.max(0, 1.0 - i * 0.2));
  }

  return [...entries].sort((a, b) => {
    const scoreA = computeRank(a, failPredicate(a), recencyMap.get(a), taskDomain);
    const scoreB = computeRank(b, failPredicate(b), recencyMap.get(b), taskDomain);
    return scoreB - scoreA;
  });
}

/**
 * Compute a composite ranking score for a single learning entry.
 *
 * score = recency × taskRelevance × failureMultiplier × resolvedFixMultiplier
 *
 * @param entry       The learning entry to score.
 * @param isFailure   True if this entry lives in the failures array (default false).
 * @param recency     Position-based recency factor; defaults to 1.0 when called standalone.
 * @param taskDomain  Optional domain to compare against entry.toolName for relevance scoring.
 */
export function computeRank(
  entry: LearningEntry,
  isFailure: boolean = false,
  recency?: number,
  taskDomain?: string,
): number {
  const r = recency ?? 1.0;
  const taskRelevance = taskDomain !== undefined
    ? (entry.toolName && entry.toolName.startsWith(taskDomain) ? 1.0 : 0.5)
    : 1.0;
  const failureMultiplier = isFailure ? 2.0 : 1.0;
  const resolvedFixMultiplier = entry.rootCause && entry.fix ? 2.0 : 1.0;
  return r * taskRelevance * failureMultiplier * resolvedFixMultiplier;
}

