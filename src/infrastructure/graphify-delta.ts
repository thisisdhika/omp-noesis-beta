"use strict";

/**
 * omp-noesis: Graphify Delta
 * Version: 1.0.0
 *
 * Computes the difference between two sets of graph node IDs (snapshot-based),
 * and provides helpers to persist/load snapshots from the cognitive state.
 *
 * @module infrastructure/graphify-delta
 */


// ============================================================================
// TYPES
// ============================================================================

export interface GraphDelta {
  /** Node IDs present in the current graph but absent from the previous snapshot. */
  added: string[];
  /** Node IDs that were in the previous snapshot but are no longer present. */
  removed: string[];
  /** Timestamp-based snapshot identifier. */
  snapshotId: string;
  /** ISO-8601 timestamp of when this delta was computed. */
  computedAt: string;
}

// ============================================================================
// DELTA COMPUTATION
// ============================================================================

/**
 * Compare two arrays of graph node IDs (simple set difference) and produce
 * a GraphDelta describing what was added and removed.
 * Both inputs are treated as unordered sets (duplicates are collapsed).
 *
 * @param previousNodes — node IDs from the last saved snapshot (or empty for first run)
 * @param currentNodes  — node IDs from the current graph state
 */
export function computeGraphDelta(
  previousNodes: string[],
  currentNodes: string[],
): GraphDelta {
  const prev = new Set(previousNodes);
  const curr = new Set(currentNodes);

  const added: string[] = [];
  const removed: string[] = [];

  for (const id of curr) {
    if (!prev.has(id)) added.push(id);
  }

  for (const id of prev) {
    if (!curr.has(id)) removed.push(id);
  }

  return {
    added,
    removed,
    snapshotId: `snap-${Date.now()}`,
    computedAt: new Date().toISOString(),
  };
}

// ============================================================================
// SNAPSHOT PERSISTENCE
// ============================================================================

/**
 * Save the current set of graph node IDs into the state's _lastGraphSnapshot
 * field. Mutates the provided state object in-place.
 */
export function saveGraphSnapshot(
  state: { _lastGraphSnapshot?: string[] },
  nodes: string[],
): void {
  state._lastGraphSnapshot = [...nodes];
}

/**
 * Load the saved graph node IDs from the state, or return null if no
 * snapshot has been persisted yet.
 */
export function loadGraphSnapshot(
  state: Readonly<{ _lastGraphSnapshot?: string[] }>,
): string[] | null {
  return state._lastGraphSnapshot ? [...state._lastGraphSnapshot] : null;
}
