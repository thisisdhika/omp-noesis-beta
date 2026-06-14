import type { LearningEntry } from "../../schema.js";

/**
 * Rank learning entries by score = recency × relevance × failureMul × resolvedMul.
 *
 * - recency: newest entry = 1.0, decaying linearly over 1 week to 0.1.
 *             Missing/invalid capturedAt defaults to 0.1.
 *              different non-null → 0.5;
 *              no skillScope → 0.0
 * - failureMul: entry has rootCause → 2.0; else 1.0
 * - resolvedMul: both rootCause AND fix populated → 2.0; else 1.0
 *
 * Returns entries sorted descending by score. The input array is never mutated.
 */
export function rankLearning(
  entries: LearningEntry[],
  currentSkillScope?: string,
): LearningEntry[] {
  const now = Date.now();
  const scored = entries.map((entry) => {
    const ageMs = now - new Date(entry.capturedAt).getTime();
    const ageHours = Number.isFinite(ageMs) ? ageMs / (1000 * 60 * 60) : Infinity;
    const recency = Math.max(1.0 - ageHours / 168, 0.1); // 1 week = 168 hours

    let relevance: number;
    if (entry.skillScope === currentSkillScope) {
      relevance = 1.0;
    } else if (entry.skillScope !== undefined) {
      relevance = 0.5;
    } else {
      relevance = 0.0;
    }

    const failureMul = entry.rootCause !== undefined ? 2.0 : 1.0;
    const resolvedMul =
      entry.rootCause !== undefined && entry.fix !== undefined ? 2.0 : 1.0;

    const score = recency * relevance * failureMul * resolvedMul;
    return { entry, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.entry);
}
