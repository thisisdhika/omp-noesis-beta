"use strict";

/**
 * omp-noesis: Attention Domain
 * Version: 1.0.0
 *
 * Manages the agent's current focus, priority, graph queries,
 * file references, and graph findings.
 *
 * All functions mutate the NoesisState directly (sync only).
 */

import type { NoesisState } from "../../shared/schema.js";
import type { GraphFinding } from "./schema.js";
import { CAPS } from "../../shared/schema-base.js";
import { now } from "../../shared/time.js";

/**
 * Set or update the agent's current focus string.
 * Truncated to CAPS.focusLength characters if needed.
 */
export function setFocus(
  state: NoesisState,
  focus: string,
  priority?: "critical" | "high" | "normal" | "low",
): void {
  state.attention.focus = focus.slice(0, CAPS.focusLength);
  if (priority !== undefined) {
    state.attention.priority = priority;
  }
  state.attention.updatedAt = now();
}

/**
 * Replace the graph queries array.
 * Capped at CAPS.graphQueries entries (keeps first N).
 */
export function setGraphQueries(state: NoesisState, queries: string[]): void {
  state.attention.graphQueries = queries.slice(0, CAPS.graphQueries);
  state.attention.updatedAt = now();
}

/**
 * Append findings to the graph findings array.
 * Duplicates (by query string) are skipped.
 */
export function storeGraphFindings(
  state: NoesisState,
  findings: GraphFinding[],
): void {
  const existingQueries = new Set(
    state.attention.graphFindings.map((f) => f.query),
  );
  for (const finding of findings) {
    if (!existingQueries.has(finding.query)) {
      state.attention.graphFindings.push(finding);
      existingQueries.add(finding.query);
    }
  }
  state.attention.updatedAt = now();
}

/**
 * Clear all graph findings.
 */
export function clearGraphFindings(state: NoesisState): void {
  state.attention.graphFindings = [];
  state.attention.updatedAt = now();
}

/**
 * Replace the file path references array.
 * Capped at CAPS.files entries (keeps first N).
 */
export function setFiles(state: NoesisState, files: string[]): void {
  state.attention.files = files.slice(0, CAPS.files);
  state.attention.updatedAt = now();
}

/**
 * Add graph findings to the pending evidence inbox.
 * Each entry expires after 3 turns via decayPendingEvidence.
 */
export function addPendingEvidence(
  state: NoesisState,
  findings: GraphFinding[],
  query: string,
  currentTurn: number,
): void {
  state.attention.pendingEvidence.push({
    findings,
    query,
    turnAdded: currentTurn,
    turnsRemaining: 3,
  });
  state.attention.updatedAt = now();
}

/**
 * Decrement the turns-remaining counter on all pending evidence entries
 * and remove those that have expired.
 */
export function decayPendingEvidence(state: NoesisState): void {
  state.attention.pendingEvidence = state.attention.pendingEvidence
    .map(e => ({ ...e, turnsRemaining: e.turnsRemaining - 1 }))
    .filter(e => e.turnsRemaining > 0);
  state.attention.updatedAt = now();
}
