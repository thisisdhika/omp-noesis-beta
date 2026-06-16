"use strict";

/**
 * omp-noesis: Focus Resolver
 * Version: 0.1.0
 *
 * Resolves the agent's current focus and active file references
 * using a fallback chain against the cognitive state.
 *
 * All functions are pure — they read state without mutation.
 */

import type { NoesisState } from "../schema.js";

/**
 * Resolve the agent's current focus string using a fallback chain:
 *
 * 1. If `state.attention.focus` is non-empty, return it.
 * 2. If `state.commitment.workflow.goal` is non-empty, return the goal.
 * 3. If any workflow step has status "pending" or "active", return the
 *    first such step's description.
 * 4. Otherwise return the default: "Investigate the current task".
 *
 * Never returns undefined or null.
 */
export function resolveFocus(state: NoesisState): string {
  if (state.attention.focus.length > 0) {
    return state.attention.focus;
  }

  if (state.commitment.workflow.goal.length > 0) {
    return state.commitment.workflow.goal;
  }

  for (const step of state.commitment.workflow.steps) {
    if (step.status === "pending" || step.status === "active") {
      return step.description;
    }
  }

  return "Investigate the current task";
}

/**
 * Resolve the agent's active file references using a fallback chain:
 *
 * 1. If `state.attention.files` is non-empty, return the array.
 * 2. Otherwise return an empty array.
 *
 * Never returns undefined or null.
 */
export function resolveFiles(state: NoesisState): string[] {
  if (state.attention.files.length > 0) {
    return state.attention.files;
  }

  return [];
}
