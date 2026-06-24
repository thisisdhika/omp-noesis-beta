"use strict";

/**
 * omp-noesis: Sandbox Domain
 *
 * Pure functions for speculative sandbox lifecycle:
 * create, explore, merge, discard.
 */

import type { NoesisState } from "../../shared/schema.js";
import type { BeliefFact, BeliefDecision, BeliefSource } from "../belief/schema.js";
import type { Hypothesis } from "../inference/schema.js";
import type { Sandbox } from "./schema.js";
import { generateId } from "../../shared/schema-base.js";

export interface CreateSandboxParams {
  name: string;
  description?: string;
}

export interface ExploreSandboxParams {
  content: string;
  confidence: number;
  source: BeliefSource;
  tags?: string[];
  evidence?: string;
}

/**
 * Create a sandbox from a snapshot of current belief state.
 * Captures facts, decisions, and hypotheses at creation time.
 */
export function createSandbox(state: NoesisState, params: CreateSandboxParams): Sandbox {
  const now = new Date().toISOString();
  return {
    id: generateId("sb"),
    name: params.name,
    description: params.description,
    status: "active",
    createdAt: now,
    // Snapshot current belief + inference state
    facts: [...state.belief.facts],
    decisions: [...state.belief.decisions],
    hypotheses: [...state.inference.hypotheses],
  };
}

/**
 * Add a belief fact within a sandbox's isolated state (not main state).
 * Returns the new fact; does NOT mutate the sandbox itself — caller applies.
 */
export function exploreInSandbox(sandbox: Sandbox, params: ExploreSandboxParams): BeliefFact {
  const now = new Date().toISOString();
  return {
    id: generateId("bf"),
    content: params.content,
    confidence: params.confidence,
    source: params.source,
    createdAt: now,
    updatedAt: now,
    status: "active",
    epistemicStatus: "speculative",
    reviewRequired: false,
    scope: "local",
    revision: 0,
    tags: params.tags,
    evidence: params.evidence,
  };
}

/**
 * Merge sandbox back into main state: promote facts and decisions,
 * mark sandbox as merged. Returns counts of promoted items.
 */
export function mergeSandbox(sandbox: Sandbox, state: NoesisState): { promotedFacts: number; promotedDecisions: number } {
  const promotedFactIds: string[] = [];
  const promotedDecisionIds: string[] = [];

  // Promote active facts (avoid duplicates by checking content)
  for (const fact of sandbox.facts) {
    if (fact.status !== "active") continue;
    const dup = state.belief.facts.find(f => f.content === fact.content);
    if (dup) continue;
    state.belief.facts.push(fact);
    promotedFactIds.push(fact.id);
  }

  // Promote active decisions
  for (const decision of sandbox.decisions) {
    if (decision.status !== "active") continue;
    const dup = state.belief.decisions.find(d => d.content === decision.content);
    if (dup) continue;
    state.belief.decisions.push(decision);
    promotedDecisionIds.push(decision.id);
  }

  // Mark sandbox as merged
  sandbox.status = "merged";
  sandbox.mergedAt = new Date().toISOString();
  sandbox.promotedFactIds = promotedFactIds;
  sandbox.promotedDecisionIds = promotedDecisionIds;

  return { promotedFacts: promotedFactIds.length, promotedDecisions: promotedDecisionIds.length };
}

/**
 * Discard sandbox: mark as discarded without promoting any data.
 */
export function discardSandbox(sandbox: Sandbox): void {
  sandbox.status = "discarded";
}

/**
 * Get active (non-merged, non-discarded) sandboxes.
 */
export function getActiveSandboxes(state: NoesisState): Sandbox[] {
  return state.sandbox.sandboxes.filter(s => s.status === "active");
}
