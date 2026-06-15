"use strict";

/**
 * State cleanup utilities: evict stale entries and enforce capacity caps.
 *
 * Used by the preamble builder before rendering to keep state size within
 * cognitive budget limits.
 *
 * @module rendering/state-cleanup
 */

import type { NoesisState } from "../schema.js";
import { CAPS } from "../schema.js";
import { isStaleHours } from "../shared/time.js";
import {
  evictStale as evictStaleLearning,
  evictOverCap as evictOverCapLearning,
} from "../domains/learning/eviction-strategy.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 30 days in hours — threshold for archived/abandoned entries. */
const STALE_THRESHOLD_HOURS = 720;

// ---------------------------------------------------------------------------
// evictStale
// ---------------------------------------------------------------------------

/**
 * Remove stale (archived/abandoned beyond threshold) entries from all layers.
 *
 * - Belief facts: "archived" facts older than 30 days.
 * - Belief decisions: "archived" decisions older than 30 days.
 * - Hypotheses: "abandoned" hypotheses older than 30 days.
 * - Learning entries: delegates to `evictStaleLearning` on both successes and
 *   failures (handles only unresolved entries, preserving resolved ones).
 *
 * @param state  The cognitive state to clean (mutated in place).
 * @returns      Number of entries evicted.
 */
export function evictStale(state: NoesisState): number {
  let count = 0;

  // --- Belief facts: remove archived facts older than 30 days -----------
  const factsBefore = state.belief.facts.length;
  state.belief.facts = state.belief.facts.filter((f) => {
    if (f.status === "archived" && isStaleHours(f.createdAt, STALE_THRESHOLD_HOURS)) {
      return false;
    }
    return true;
  });
  count += factsBefore - state.belief.facts.length;

  // --- Belief decisions: remove archived decisions older than 30 days ---
  const decisionsBefore = state.belief.decisions.length;
  state.belief.decisions = state.belief.decisions.filter((d) => {
    if (d.status === "archived" && isStaleHours(d.createdAt, STALE_THRESHOLD_HOURS)) {
      return false;
    }
    return true;
  });
  count += decisionsBefore - state.belief.decisions.length;

  // --- Hypotheses: remove abandoned hypotheses older than 30 days -------
  const hyBefore = state.inference.hypotheses.length;
  state.inference.hypotheses = state.inference.hypotheses.filter((h) => {
    if (h.status === "abandoned" && isStaleHours(h.createdAt, STALE_THRESHOLD_HOURS)) {
      return false;
    }
    return true;
  });
  count += hyBefore - state.inference.hypotheses.length;

  // --- Learning entries: delegate to learning eviction strategy ---------
  const successesBefore = state.learning.successes.length;
  state.learning.successes = evictStaleLearning(state.learning.successes, STALE_THRESHOLD_HOURS);
  count += successesBefore - state.learning.successes.length;

  const failuresBefore = state.learning.failures.length;
  state.learning.failures = evictStaleLearning(state.learning.failures, STALE_THRESHOLD_HOURS);
  count += failuresBefore - state.learning.failures.length;

  return count;
}

// ---------------------------------------------------------------------------
// evictOverCap
// ---------------------------------------------------------------------------

/**
 * Enforce capacity caps across all layers, dropping oldest entries first.
 *
 * - GraphFindings: keep most recent {@link CAPS.graphQueries} (5) by timestamp.
 * - Workflow steps: keep first {@link CAPS.workflowSteps} (20).
 * - Actions: keep first {@link CAPS.actions} (50).
 * - Learning successes/failures: delegate to {@link evictOverCapLearning}
 *   capped at {@link CAPS.learningEntries} (100) each.
 *
 * @param state  The cognitive state to trim (mutated in place).
 * @returns      Number of entries evicted.
 */
export function evictOverCap(state: NoesisState): number {
  let count = 0;

  // --- GraphFindings: keep most recent 5 by timestamp -------------------
  if (state.attention.graphFindings.length > CAPS.graphQueries) {
    const before = state.attention.graphFindings.length;
    // Sort descending by timestamp (newest first), keep first CAPS.graphQueries
    const sorted = [...state.attention.graphFindings].sort(
      (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
    );
    state.attention.graphFindings = sorted.slice(0, CAPS.graphQueries);
    count += before - state.attention.graphFindings.length;
  }

  // --- Workflow steps: keep first CAPS.workflowSteps --------------------
  if (state.commitment.workflow.steps.length > CAPS.workflowSteps) {
    const before = state.commitment.workflow.steps.length;
    state.commitment.workflow.steps = state.commitment.workflow.steps.slice(0, CAPS.workflowSteps);
    count += before - state.commitment.workflow.steps.length;
  }

  // --- Actions: keep first CAPS.actions ---------------------------------
  if (state.commitment.actions.length > CAPS.actions) {
    const before = state.commitment.actions.length;
    state.commitment.actions = state.commitment.actions.slice(0, CAPS.actions);
    count += before - state.commitment.actions.length;
  }

  // --- Learning successes: delegate to evictOverCapLearning -------------
  if (state.learning.successes.length > CAPS.learningEntries) {
    const before = state.learning.successes.length;
    state.learning.successes = evictOverCapLearning(state.learning.successes, CAPS.learningEntries);
    count += before - state.learning.successes.length;
  }

  // --- Learning failures: delegate to evictOverCapLearning ---------------
  if (state.learning.failures.length > CAPS.learningEntries) {
    const before = state.learning.failures.length;
    state.learning.failures = evictOverCapLearning(state.learning.failures, CAPS.learningEntries);
    count += before - state.learning.failures.length;
  }

  return count;
}

// ---------------------------------------------------------------------------
// fullCleanup
// ---------------------------------------------------------------------------

/**
 * Run full state cleanup: stale eviction followed by capacity cap enforcement.
 *
 * @param state  The cognitive state to clean (mutated in place).
 * @returns      Total number of entries evicted across both passes.
 */
export function fullCleanup(state: NoesisState): number {
  const stale = evictStale(state);
  const cap = evictOverCap(state);
  return stale + cap;
}
