"use strict";

/**
 * Eviction strategies for learning entries.
 * Version: 0.1.0
 *
 * Two policies:
 * 1. Stale eviction — remove unresolved entries beyond a time threshold.
 * 2. Capacity eviction — when over cap, drop the oldest entries (capturedAt ASC).
 */

import type { LearningEntry } from "../../schema.js";
import { CAPS } from "../../schema.js";
import { isStaleHours } from "../../shared/time.js";

/**
 * Remove unresolved entries that are older than `staleHours`.
 *
 * Resolved entries (status === "resolved") are always kept regardless of age,
 * since they represent diagnosed knowledge worth retaining.
 *
 * @param entries     Full list of learning entries.
 * @param staleHours  Age threshold in hours (default 720 = 30 days).
 * @returns           Filtered array with stale unresolved entries removed.
 */
export function evictStale(entries: LearningEntry[], staleHours: number = CAPS.STALE_THRESHOLD_HOURS): LearningEntry[] {
  return entries.filter((e) => {
    // Never evict resolved entries
    if (e.status === "resolved") return true;
    // Evict if older than threshold
    return !isStaleHours(e.capturedAt, staleHours);
  });
}

/**
 * If the number of entries exceeds `cap`, remove the oldest entries (by capturedAt)
 * until the array length is within the cap.
 *
 * @param entries  Array of learning entries (not mutated).
 * @param cap      Maximum allowed entries.
 * @returns        Capped array; unchanged if already within limit.
 */
export function evictOverCap(entries: LearningEntry[], cap: number): LearningEntry[] {
  if (entries.length <= cap) return [...entries];

  // Sort by capturedAt ascending (oldest first) and drop the excess
  const sorted = [...entries].sort(
    (a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt),
  );
  return sorted.slice(sorted.length - cap);
}
