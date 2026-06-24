"use strict";

/**
 * omp-noesis: Resolve Provenance Use Case
 * Version: 1.0.0
 *
 * resolveProvenance — trace a belief fact or decision through its
 * supersession chain: find the origin, what superseded it, and what
 * it supersedes.
 */

import type { NoesisState } from "../../shared/schema.js";
import type { BeliefSource } from "../../domains/belief/schema.js";

export interface ProvenanceNode {
  beliefId: string;
  content: string;
  source: BeliefSource;
  evidence?: string;
  supersededBy?: string;
  supersedes: string[];
  createdAt: string;
}

/**
 * Trace a belief fact or decision by ID and return its provenance node.
 * The node includes:
 *   - The belief's own metadata (content, source, evidence, etc.)
 *   - supersedes — IDs of items this belief directly replaced (scanning state)
 *   - supersededBy — ID of the item that replaced this one (if any)
 *
 * Returns null when no matching belief fact or decision exists.
 */
export function resolveProvenance(
  state: NoesisState,
  beliefId: string,
): ProvenanceNode | null {
  const fact = state.belief.facts.find((f) => f.id === beliefId);
  if (fact) {
    const supersedes = [
      ...state.belief.facts
        .filter((f) => f.supersededBy === beliefId)
        .map((f) => f.id),
      ...state.belief.decisions
        .filter((d) => d.supersededBy === beliefId)
        .map((d) => d.id),
    ];
    return {
      beliefId: fact.id,
      content: fact.content,
      source: fact.source,
      evidence: fact.evidence,
      supersededBy: fact.supersededBy,
      supersedes,
      createdAt: fact.createdAt,
    };
  }

  const decision = state.belief.decisions.find((d) => d.id === beliefId);
  if (decision) {
    const supersedes = [
      ...state.belief.facts
        .filter((f) => f.supersededBy === beliefId)
        .map((f) => f.id),
      ...state.belief.decisions
        .filter((d) => d.supersededBy === beliefId)
        .map((d) => d.id),
    ];
    return {
      beliefId: decision.id,
      content: decision.content,
      source: decision.source,
      supersededBy: decision.supersededBy,
      supersedes,
      createdAt: decision.createdAt,
    };
  }

  return null;
}
