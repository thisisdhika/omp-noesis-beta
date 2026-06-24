"use strict";

/**
 * omp-noesis: Compaction Loss Strategy
 * Version: 1.0.0
 *
 * Computes CompactionResult by diffing pre/post state snapshots.
 */

import type { BeliefFact, BeliefDecision } from "../belief/schema.js";
import type { CompactionResult } from "./schema.js";

/**
 * Compute a CompactionResult by comparing pre-compaction and post-compaction
 * state snapshots.
 *
 * Preserved: belief IDs present in both snapshots.
 * Evicted:   IDs present only in preState.
 * Degraded:  IDs in both but with changed content or dropped confidence.
 *
 * All evicted items default to "capacity" reason since the caller knows
 * best why each item was dropped. Callers may also override eviction
 * reasons after the fact.
 */
export function computeCompactionResult(
  preState: { facts: BeliefFact[]; decisions: BeliefDecision[] },
  postState: { facts: BeliefFact[]; decisions: BeliefDecision[] },
): CompactionResult {
  const preIds = new Set([
    ...preState.facts.map((f) => f.id),
    ...preState.decisions.map((d) => d.id),
  ]);
  const postIds = new Set([
    ...postState.facts.map((f) => f.id),
    ...postState.decisions.map((d) => d.id),
  ]);

  const preserved = [...preIds].filter((id) => postIds.has(id));
  const evictedIds = [...preIds].filter((id) => !postIds.has(id));

  const preFacts = new Map(preState.facts.map((f) => [f.id, f]));
  const postFacts = new Map(postState.facts.map((f) => [f.id, f]));
  const preDecisions = new Map(preState.decisions.map((d) => [d.id, d]));
  const postDecisions = new Map(postState.decisions.map((d) => [d.id, d]));

  const degraded: CompactionResult["degraded"] = [];
  for (const id of preserved) {
    const preFact = preFacts.get(id);
    const postFact = postFacts.get(id);
    const preDec = preDecisions.get(id);
    const postDec = postDecisions.get(id);

    if (preFact && postFact) {
      if (preFact.content !== postFact.content) {
        degraded.push({ id, content: postFact.content.slice(0, 80), reason: "truncated" });
      } else if (postFact.confidence < preFact.confidence) {
        degraded.push({ id, content: postFact.content.slice(0, 80), reason: "confidence_drop" });
      }
    } else if (preDec && postDec) {
      if (preDec.content !== postDec.content) {
        degraded.push({ id, content: postDec.content.slice(0, 80), reason: "truncated" });
      }
    }
  }

  const evicted: CompactionResult["evicted"] = evictedIds.map((id) => {
    const fact = preFacts.get(id);
    const dec = preDecisions.get(id);
    const belief = (fact ?? dec)!;
    return { id, content: belief.content.slice(0, 80), reason: "capacity" };
  });

  return {
    occurredAt: new Date().toISOString(),
    preCounts: { facts: preState.facts.length, decisions: preState.decisions.length },
    postCounts: { facts: postState.facts.length, decisions: postState.decisions.length },
    preserved,
    degraded,
    evicted,
    reconstructionHints: [],
  };
}
