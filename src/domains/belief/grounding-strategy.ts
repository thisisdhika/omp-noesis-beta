"use strict";

/**
 * omp-noesis: Grounding Strategy
 * Version: 1.0.0
 *
 * Finds belief facts whose graph grounding references have been removed
 * or invalidated, and demotes their epistemic status and confidence.
 *
 * @module domains/belief/grounding-strategy
 */

import type { BeliefFact, EpistemicStatus } from "./schema.js";
import type { GraphDelta } from "../../infrastructure/graphify-delta.js";
import { now } from "../../shared/time.js";

// ============================================================================
// ORPHAN DETECTION
// ============================================================================

/**
 * Return the subset of belief facts whose `grounding` array references a
 * graph node ID that appears in `delta.removed`.
 * Beliefs with no grounding are not orphaned.
 */
export function findOrphanedBeliefs(
  beliefs: BeliefFact[],
  delta: GraphDelta,
): BeliefFact[] {
  const removed = new Set(delta.removed);
  return beliefs.filter(
    (b) => b.grounding?.some((g) => removed.has(g.graphNodeId)),
  );
}

// ============================================================================
// STATUS DEMOTION
// ============================================================================

/**
 * Demote an epistemic status one step down the certainty ladder:
 *   certain    → probable
 *   probable   → speculative
 *   speculative → speculative  (already at floor)
 *   deprecated → deprecated    (already marked)
 *   contradicted → contradicted (already marked)
 */
export function demoteStatus(status: EpistemicStatus): EpistemicStatus {
  switch (status) {
    case "certain":   return "probable";
    case "probable":  return "speculative";
    default:          return status; // speculative, deprecated, contradicted stay
  }
}

// ============================================================================
// BULK INVALIDATION
// ============================================================================

/**
 * For each belief fact that has lost graph grounding:
 *   - Demote epistemic status one step (certain→probable, probable→speculative)
 *   - Lower confidence by 0.15, clamped to a minimum of 0.55
 *   - Append a warning to the evidence field noting the lost grounding
 *
 * @param state — mutable cognitive state (the belief layer is modified in-place)
 * @param delta — graph delta describing removed nodes
 * @returns the number of beliefs that were invalidated
 */
export function invalidateOrphanedBeliefs(
  state: { belief: { facts: BeliefFact[] } },
  delta: GraphDelta,
): number {
  if (delta.removed.length === 0) return 0;

  const removedSet = new Set(delta.removed);
  let count = 0;

  for (const fact of state.belief.facts) {
    const hasOrphanedGrounding = fact.grounding?.some(
      (g) => removedSet.has(g.graphNodeId),
    );
    if (!hasOrphanedGrounding) continue;

    fact.epistemicStatus = demoteStatus(fact.epistemicStatus);
    fact.confidence = Math.max(0.55, fact.confidence - 0.15);

    const warning = `Grounding graph node removed: ${delta.removed.join(", ")}`;
    fact.evidence = fact.evidence
      ? `${fact.evidence}\n${warning}`
      : warning;

    fact.updatedAt = now();
    count++;
  }

  return count;
}
