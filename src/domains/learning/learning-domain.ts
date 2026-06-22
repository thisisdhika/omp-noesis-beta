"use strict";

/**
 * Learning domain — cognitive capture, diagnosis, and ranking.
 * Version: 1.0.0
 *
 * Provides the core API for recording agent learning (successes and failures),
 * resolving entries with root-cause analysis, ranking by actionability, and
 * querying unresolved failures.
 */

import type { NoesisState } from "../../shared/schema.js";
import type { LearningEntry, LearningStatus } from "./schema.js";
import { CAPS, generateId } from "../../shared/schema-base.js";
import { now } from "../../shared/time.js";
import { rank } from "./ranking-strategy.js";
import { evictStale, evictOverCap } from "./eviction-strategy.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Capture a new learning entry.
 *
 * Creates a `LearningEntry` with status "captured", appends it to the
 * successes or failures array based on `isSuccess`, updates the summary
 * counters, then caps each array to `CAPS.learningEntries` (100).
 *
 * @param state   Mutable NoesisState (learning layer is updated in place).
 * @param params  Entry payload: description (required), skillScope, toolName, isSuccess.
 * @returns       The newly created entry.
 */
export function addLearning(
  state: NoesisState,
  params: {
    description: string;
    skillScope?: string;
    toolName?: string;
    isSuccess?: boolean;
  },
): LearningEntry {
  const timestamp = now();
  const entry: LearningEntry = {
    id: generateId("le"),
    description: params.description,
    status: "captured",
    capturedAt: timestamp,
    ...(params.skillScope !== undefined && { skillScope: params.skillScope }),
    ...(params.toolName !== undefined && { toolName: params.toolName }),
  };

  const isSuccess = params.isSuccess ?? false;

  if (isSuccess) {
    state.learning.successes.push(entry);
    state.learning.summary.successCount += 1;
    state.learning.successes = evictOverCap(
      state.learning.successes,
      CAPS.learningEntries,
    );
  } else {
    state.learning.failures.push(entry);
    state.learning.summary.failureCount += 1;
    state.learning.failures = evictOverCap(
      state.learning.failures,
      CAPS.learningEntries,
    );
  }

  return entry;
}

/**
 * Resolve a learning entry by ID.
 *
 * Searches both the successes and failures arrays. When found, sets the
 * status to "resolved", records the root cause and fix, stamps the
 * resolution timestamp, and increments `resolvedCount` on the summary.
 *
 * @param state      Mutable NoesisState.
 * @param id         The entry ID (e.g. "le-<uuid>").
 * @param rootCause  Root-cause description.
 * @param fix        Fix description.
 * @returns          The resolved entry, or `null` if no entry with that ID exists.
 */
export function resolveLearning(
  state: NoesisState,
  id: string,
  rootCause: string,
  fix: string,
): LearningEntry | null {
  const entry = findEntry(state, id);
  if (entry === null) return null;

  entry.status = "resolved" as LearningStatus;
  entry.rootCause = rootCause;
  entry.fix = fix;
  entry.resolvedAt = now();

  state.learning.summary.resolvedCount += 1;

  return entry;
}

/**
 * Return the top-ranked learning entries, optionally scoped to a skill.
 *
 * Merges successes and failures into a single list, filters by `skillScope`
 * when provided, ranks by actionability score, and returns the top `limit`.
 *
 * @param state       NoesisState (read-only for this operation).
 * @param limit       Maximum entries to return (default 5).
 * @param skillScope  Optional skill name to filter by.
 * @returns           Ranked, capped array of learning entries.
 */
export function getRankedLearning(
  state: NoesisState,
  limit: number = 5,
  skillScope?: string,
): LearningEntry[] {
  const allEntries = [
    ...state.learning.successes,
    ...state.learning.failures,
  ];

  const filtered = skillScope
    ? allEntries.filter((e) => e.skillScope === skillScope)
    : allEntries;

  // Build a Set of failure IDs for the ranking predicate
  const failureIds = new Set(state.learning.failures.map((e) => e.id));

  const ranked = rank(filtered, (entry) => failureIds.has(entry.id));
  return ranked.slice(0, limit);
}

/**
 * Return all unresolved failures — entries in the failures array whose status
 * is not "resolved".
 *
 * These represent problems that have not yet been resolved, and are candidates
 * for agent attention.
 *
 * @param state  NoesisState (read-only).
 * @returns      Array of unresolved failure entries.
 */
export function getFailures(state: NoesisState): LearningEntry[] {
  return state.learning.failures.filter((e) => e.status !== "resolved");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Find a learning entry by ID across both successes and failures.
 */
function findEntry(state: NoesisState, id: string): LearningEntry | null {
  for (const entry of state.learning.successes) {
    if (entry.id === id) return entry;
  }
  for (const entry of state.learning.failures) {
    if (entry.id === id) return entry;
  }
  return null;
}
