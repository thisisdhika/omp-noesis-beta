import { rankLearning } from "./ranking-strategy.js";
import { evictLearning } from "./eviction-strategy.js";
import { generateId } from "../../shared/ids.js";
import { nowISO } from "../../shared/time.js";
import { truncate } from "../../shared/text.js";
import type { LearningEntry, LearningSummary } from "../../schema.js";

/**
 * Capture a tool execution result as a learning entry.
 *
 * Pure: takes the current entries array, appends the new entry, and returns
 * both the created entry and the updated array. The caller (StateManager)
 * applies the mutation.
 *
 * @param entries   Current learning entries.
 * @param toolName  Name of the tool that produced this result.
 * @param description Human-readable description (truncated to 500 chars).
 * @param isError   `true` for failures (severity 3), `false` for successes (severity 1).
 * @param skillScope Optional skill scope string for relevance ranking.
 */
export function captureResult(
  entries: LearningEntry[],
  toolName: string,
  description: string,
  isError: boolean,
  skillScope?: string,
): { created: LearningEntry; newEntries: LearningEntry[] } {
  const entry: LearningEntry = {
    id: generateId("le"),
    description: truncate(description, 500),
    skillScope,
    toolName,
    capturedAt: nowISO(),
    severity: isError ? 3 : 1,
  };
  return { created: entry, newEntries: [...entries, entry] };
}
export function summarizeLearning(
  failures: LearningEntry[],
  successes: LearningEntry[],
): LearningSummary {
  const combined = [...failures, ...successes];
  return {
    successCount: successes.length,
    failureCount: failures.length,
    resolvedCount: combined.filter(
      (entry) => entry.rootCause !== undefined && entry.fix !== undefined,
    ).length,
  };
}

/**
 * Apply retention policy: keep at most `maxEntries` entries, evicting
 * lowest-value entries first (failure-biased).
 *
 * Pure: returns the filtered entries without mutating state.
 */
export function applyRetentionPolicy(
  entries: LearningEntry[],
  maxEntries: number = 50,
): LearningEntry[] {
  return evictLearning(entries, maxEntries);
}

/**
 * Return the top `count` learning entries ranked by relevance and value,
 * optionally filtered to entries relevant to `skillScope`.
 *
 * Pure: returns a new array without mutating state.
 */
export function getTopLearning(
  entries: LearningEntry[],
  count: number,
  skillScope?: string,
): LearningEntry[] {
  const ranked = rankLearning(entries, skillScope);
  return ranked.slice(0, count);
}
