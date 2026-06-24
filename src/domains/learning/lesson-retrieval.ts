"use strict";

/**
 * omp-noesis: Lesson Retrieval
 * Version: 1.0.0
 *
 * Retrieval and prevention gating for typed lesson entries.
 * matchSituation — keyword-overlap similarity matching on retrievalKeys.
 * shouldApply — gate auto-application of prevention based on confidence.
 */

import type { LearningEntry } from "./schema.js";

/**
 * Simple keyword-overlap similarity matching on retrievalKeys.
 * Returns lessons that share at least one retrieval key with currentKeys.
 * Results are sorted by matched-key count descending (best match first).
 */
export function matchSituation(
  lessons: LearningEntry[],
  currentKeys: string[],
): LearningEntry[] {
  if (currentKeys.length === 0) return [];

  const normalised = currentKeys.map(k => k.toLowerCase().trim());
  const scored = lessons
    .filter(l => l.retrievalKeys && l.retrievalKeys.length > 0)
    .map(l => {
      const lessonKeys = l.retrievalKeys!.map(k => k.toLowerCase().trim());
      const matches = lessonKeys.filter(k => normalised.includes(k)).length;
      return { entry: l, matches };
    })
    .filter(s => s.matches > 0)
    .sort((a, b) => b.matches - a.matches);

  return scored.map(s => s.entry);
}

/**
 * Determine if prevention should auto-apply based on confidence.
 * Returns true when confidence >= 0.7 and autoApplied is true.
 */
export function shouldApply(prevention: { beliefStatement: string; autoApplied: boolean; confidence: number }): boolean {
  return prevention.autoApplied && prevention.confidence >= 0.7;
}
