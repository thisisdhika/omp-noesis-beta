import { rankLearning } from "./ranking-strategy.js";
import type { LearningEntry } from "../../schema.js";

/**
 * Evict excess learning entries, keeping at most `max`.
 *
 * When over capacity, entries are sorted by score ascending (lowest first).
 * Among equal scores, successes are placed before failures so that failures
 * are preferentially retained (failure-biased retention).
 */
export function evictLearning(
  entries: LearningEntry[],
  max: number,
): LearningEntry[] {
  if (entries.length <= max) return entries;

  // rankLearning sorts descending by score. Reverse to ascending for eviction.
  const ranked = rankLearning(entries);
  const ascending = ranked.reverse();

  // Apply tiebreaker: among equal scores, successes before failures.
  // With ascending sort, this means successes appear first and get evicted first.
  ascending.sort((a, b) => {
    const aIsFailure = a.rootCause !== undefined ? 1 : 0;
    const bIsFailure = b.rootCause !== undefined ? 1 : 0;
    return aIsFailure - bIsFailure;
  });

  // Keep the highest-scored entries (end of ascending-sorted array).
  return ascending.slice(-max);
}
