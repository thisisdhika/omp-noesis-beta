"use strict";

/**
 * Belief Domain — AGM-informed belief management for omp-noesis.
 *
 * Manages the lifecycle of facts and decisions: creation, retrieval,
 * and resolution-triggered fact generation from learning entries.
 * Revision (supersession) is delegated to revision-strategy.ts to
 * enforce the K*2–K*6 AGM contract.
 *
 * @module belief-domain
 */

import type {
  NoesisState,
  BeliefFact,
  BeliefDecision,
  BeliefSource,
  Hypothesis,
} from "../../schema.js";
import { CAPS, generateId } from "../../schema.js";
import { now } from "../../shared/time.js";
import { supersede } from "./revision-strategy.js";

/**
 * Create a new belief fact and add it to state.
 * If `contradictsIds` is provided, existing facts/decisions with those ids
 * are superseded via AGM revision.
 *
 * @param state - The Noesis state to mutate.
 * @param params - Fact parameters.
 * @returns The newly created BeliefFact.
 */
export function addFact(
  state: NoesisState,
  params: {
    content: string;
    confidence: number;
    source: BeliefSource;
    tags?: string[];
    evidence?: string;
    contradictsIds?: string[];
  },
): BeliefFact {
  const timestamp = now();
  const fact: BeliefFact = {
    id: generateId("bf"),
    content: params.content,
    confidence: params.confidence,
    source: params.source,
    createdAt: timestamp,
    updatedAt: timestamp,
    status: "active",
  };

  if (params.tags !== undefined) {
    fact.tags = params.tags;
  }

  if (params.evidence !== undefined) {
    fact.evidence = params.evidence;
  }

  if (params.contradictsIds !== undefined && params.contradictsIds.length > 0) {
    supersede(state, fact.id, params.contradictsIds);
  }

  state.belief.facts.push(fact);
  return fact;
}

/**
 * Create a new belief decision and add it to state.
 * If `contradictsIds` is provided, existing facts/decisions are superseded.
 *
 * @param state - The Noesis state to mutate.
 * @param params - Decision parameters.
 * @returns The newly created BeliefDecision.
 */
export function addDecision(
  state: NoesisState,
  params: {
    content: string;
    rationale: string;
    alternatives?: string[];
    source: BeliefSource;
    tags?: string[];
    contradictsIds?: string[];
  },
): BeliefDecision {
  const timestamp = now();
  const decision: BeliefDecision = {
    id: generateId("bd"),
    content: params.content,
    rationale: params.rationale,
    alternatives: params.alternatives,
    source: params.source,
    createdAt: timestamp,
    updatedAt: timestamp,
    status: "active",
  };

  if (params.tags !== undefined) {
    decision.tags = params.tags;
  }

  if (params.contradictsIds !== undefined && params.contradictsIds.length > 0) {
    supersede(state, decision.id, params.contradictsIds);
  }

  state.belief.decisions.push(decision);
  return decision;
}

/**
 * Return all active facts, optionally filtered by minimum confidence
 * and/or overlapping tags.
 *
 * @param state - The Noesis state.
 * @param minConfidence - Optional minimum confidence threshold.
 * @param tagFilter - Optional set of tags; only facts with at least one
 *   matching tag are returned.
 * @returns Array of matching active BeliefFacts.
 */
export function getActiveFacts(
  state: NoesisState,
  minConfidence?: number,
  tagFilter?: string[],
): BeliefFact[] {
  return state.belief.facts.filter((fact) => {
    if (fact.status !== "active") return false;
    if (minConfidence !== undefined && fact.confidence < minConfidence) return false;
    if (tagFilter !== undefined && tagFilter.length > 0) {
      if (fact.tags === undefined || fact.tags.length === 0) return false;
      if (!tagFilter.some((tag) => fact.tags!.includes(tag))) return false;
    }
    return true;
  });
}

/**
 * Return all active decisions, optionally filtered by overlapping tags.
 *
 * @param state - The Noesis state.
 * @param tagFilter - Optional set of tags; only decisions with at least one
 *   matching tag are returned.
 * @returns Array of matching active BeliefDecisions.
 */
export function getActiveDecisions(
  state: NoesisState,
  tagFilter?: string[],
): BeliefDecision[] {
  return state.belief.decisions.filter((decision) => {
    if (decision.status !== "active") return false;
    if (tagFilter !== undefined && tagFilter.length > 0) {
      if (decision.tags === undefined || decision.tags.length === 0) return false;
      if (!tagFilter.some((tag) => decision.tags!.includes(tag))) return false;
    }
    return true;
  });
}

/**
 * Resolve a learning entry into a belief fact.
 * Searches both learning successes and failures for the given id.
 *
 * @param state - The Noesis state.
 * @param learningId - The id of the learning entry to resolve.
 * @param rootCause - Root cause analysis text.
 * @param fix - Fix description text.
 * @returns The newly created BeliefFact.
 * @throws If no learning entry with the given id is found.
 */
export function resolveLearning(
  state: NoesisState,
  learningId: string,
  rootCause: string,
  fix: string,
): BeliefFact {
  const entry =
    state.learning.successes.find((e) => e.id === learningId) ??
    state.learning.failures.find((e) => e.id === learningId);

  if (entry === undefined) {
    throw new Error(`Learning entry not found: ${learningId}`);
  }

  const parts: string[] = [entry.description];
  if (rootCause.length > 0) {
    parts.push(`Root cause: ${rootCause}`);
  }
  if (fix.length > 0) {
    parts.push(`Fix: ${fix}`);
  }

  return addFact(state, {
    content: parts.join("\n"),
    confidence: 0.85,
    source: "inference",
    tags: ["learning-resolved"],
  });
}

/**
 * Detect hypotheses (and decisions) that depend on superseded beliefs.
 *
 * When a belief fact is superseded, any hypothesis with `relatedBeliefId`
 * pointing to it is now contested — its evidence may be invalid. This function
 * scans every superseded fact and returns human-readable warnings for each
 * dependent hypothesis found.
 *
 * NOTE: BeliefDecision has no `relatedBeliefId` field, so decisions cannot
 * currently cite other beliefs as evidence. Decision-to-decision propagation
 * is a known limitation.
 *
 * @param state - The Noesis state.
 * @returns Array of warning strings like "Belief 'X' superseded (bf-abc); hypothesis 'Y' (hy-def) may need review"
 */
export function getContestedWarnings(state: NoesisState): string[] {
  const supersededIds = new Set(
    state.belief.facts
      .filter((f) => f.status === "superseded")
      .map((f) => f.id),
  );

  const warnings: string[] = [];

  for (const supersededId of supersededIds) {
    const dependents = state.inference.hypotheses.filter(
      (h) => h.relatedBeliefId === supersededId,
    );

    for (const hyp of dependents) {
      const fact = state.belief.facts.find((f) => f.id === supersededId);
      /* istanbul ignore next — fact always found since we mapped it above */
      if (fact === undefined) continue;

      const factContent =
        fact.content.length > 40
          ? fact.content.slice(0, 40) + "..."
          : fact.content;
      const hypContent =
        hyp.content.length > 40
          ? hyp.content.slice(0, 40) + "..."
          : hyp.content;

      warnings.push(
        `Belief '${factContent}' superseded (${supersededId}); hypothesis '${hypContent}' (${hyp.id}) may need review`,
      );
    }
  }

  return warnings;
}
