"use strict";

/**
 * AGM Belief Revision Strategy — K*2–K*6 Supersession.
 *
 * Once a fact or decision is superseded, it CANNOT be reactivated.
 * This enforces the immutability of supersession edges required by
 * the K* revision contract.
 *
 * Only active entries are superseded; already superseded or archived
 * entries are left untouched.
 *
 * @module revision-strategy
 */

import type { NoesisState } from "../../schema.js";

/**
 * Supersede a set of existing facts and/or decisions, marking them as
 * superseded by the given new id.
 *
 * K*2–K*6 AGM contract:
 * - Each target is individually examined and superseded iff currently active.
 * - Recovery is rejected (no mechanism to restore a superseded entry).
 *
 * @param state - The Noesis state to mutate.
 * @param newId - Id of the new fact/decision that supersedes the targets.
 * @param targetIds - Ids of facts and/or decisions to supersede.
 */
export function supersede(
  state: NoesisState,
  newId: string,
  targetIds: string[],
): void {
  for (const targetId of targetIds) {
    // Search facts first
    const fact = state.belief.facts.find((f) => f.id === targetId);
    if (fact !== undefined && fact.status === "active") {
      fact.status = "superseded";
      fact.supersededBy = newId;
      fact.updatedAt = new Date().toISOString();
      continue;
    }

    // Fall through to decisions if not found or already inactive
    const decision = state.belief.decisions.find((d) => d.id === targetId);
    if (decision !== undefined && decision.status === "active") {
      decision.status = "superseded";
      decision.supersededBy = newId;
      decision.updatedAt = new Date().toISOString();
    }
  }
}
