"use strict";

/**
 * omp-noesis: Reconcile With Graph Use Case
 * Version: 1.0.0
 *
 * Compares the current graphify graph state against the last saved snapshot,
 * finds beliefs whose graph grounding has been removed, and demotes them.
 *
 * Flow:
 *  1. Load previous graph snapshot from cognitive state
 *  2. Collect current graph node IDs from attention.graphFindings
 *  3. Compute delta between previous and current node sets
 *  4. When removed nodes exist, find and invalidate orphaned beliefs
 *  5. Save the new snapshot and commit
 *
 * @module application/use-cases/reconcile-with-graph
 */

import type { IUnitOfWork } from "../../infrastructure/unit-of-work.js";
import { computeGraphDelta, loadGraphSnapshot, saveGraphSnapshot } from "../../infrastructure/graphify-delta.js";
import { findOrphanedBeliefs, demoteStatus } from "../../domains/belief/grounding-strategy.js";
import type { NoesisRuntime } from "../../runtime.js";
import { log } from "../../shared/logger.js";

// ============================================================================
// RESULT TYPE
// ============================================================================

export interface GraphDeltaResult {
  added: string[];
  removed: string[];
  snapshotId: string;
  computedAt: string;
}

export interface ReconcileResult {
  /** How many beliefs were demoted due to lost graph grounding. */
  revisionCount: number;
  /** How many beliefs were identified as orphaned. */
  orphanedCount: number;
  /** The computed delta, or null when no previous snapshot existed or graph state is empty. */
  delta: GraphDeltaResult | null;
}

// ============================================================================
// USE CASE
// ============================================================================

export class ReconcileWithGraphUseCase {
  constructor(private uow: IUnitOfWork) {}

  /**
   * Execute the reconcile pipeline.
   * Collects graph nodes from attention findings, computes delta against the
   * last snapshot, then invalidates any orphaned beliefs via the UoW and
   * persists the new snapshot.
   */
  async execute(runtime: NoesisRuntime): Promise<ReconcileResult> {
    const state = runtime.stateManager.read();

    // --- collect current graph node IDs from attention findings ---
    const currentNodes: string[] = [];
    for (const finding of state.attention.graphFindings) {
      for (const node of finding.nodes) {
        currentNodes.push(node);
      }
    }
    const uniqueCurrent = [...new Set(currentNodes)];

    // No graph data — skip reconciliation entirely
    if (uniqueCurrent.length === 0) {
      return { revisionCount: 0, orphanedCount: 0, delta: null };
    }

    // --- load previous snapshot ---
    const previousNodes = loadGraphSnapshot(state);

    // First run — save snapshot but no revision possible
    if (previousNodes === null) {
      const delta = computeGraphDelta([], uniqueCurrent);
      await runtime.stateManager.mutate((s) => {
        saveGraphSnapshot(s, uniqueCurrent);
      });
      return { revisionCount: 0, orphanedCount: 0, delta };
    }

    // --- compute delta ---
    const delta = computeGraphDelta(previousNodes, uniqueCurrent);

    // No graph changes — just update snapshot
    if (delta.removed.length === 0 && delta.added.length === 0) {
      await runtime.stateManager.mutate((s) => {
        saveGraphSnapshot(s, uniqueCurrent);
      });
      return { revisionCount: 0, orphanedCount: 0, delta };
    }

    // --- find and invalidate orphaned beliefs via UoW ---
    const allFacts = this.uow.belief.getAllFacts();
    const orphaned = findOrphanedBeliefs(allFacts, delta);

    for (const fact of orphaned) {
      const newStatus = demoteStatus(fact.epistemicStatus);
      const newConfidence = Math.max(0.55, fact.confidence - 0.15);
      const warning = `Grounding graph node removed: ${delta.removed.join(", ")}`;
      const newEvidence = fact.evidence
        ? `${fact.evidence}\n${warning}`
        : warning;

      this.uow.belief.updateFact(fact.id, {
        epistemicStatus: newStatus,
        confidence: newConfidence,
        evidence: newEvidence,
      });
    }

    if (orphaned.length > 0) {
      await this.uow.commit();
      log.debug(`[Noesis] Graph reconciliation invalidated ${orphaned.length} beliefs (${delta.removed.length} nodes removed)`);
    }

    // --- save new snapshot ---
    await runtime.stateManager.mutate((s) => {
      saveGraphSnapshot(s, uniqueCurrent);
    });

    return {
      revisionCount: orphaned.length,
      orphanedCount: orphaned.length,
      delta,
    };
  }
}
