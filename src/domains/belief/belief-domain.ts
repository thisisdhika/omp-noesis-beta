"use strict";

/**
 * Belief Domain — AGM-informed belief management for omp-noesis.
 * Version: 0.1.0
 *
 * Provides fact/decision CRUD, confidence-aware retrieval, learning-to-belief
 * resolution, and AGM K*2–K*6 supersession revision.
 *
 * All functions mutate `state` in place (pure synchronous transforms).
 * The supersession edge is immutable — once a fact is superseded, it cannot
 * be reactivated.
 */

import type { NoesisState } from "../../shared/schema.js";
import type { BeliefFact, BeliefDecision, BeliefSource } from "./schema.js";
import { CAPS, generateId } from "../../shared/schema-base.js";
import { now } from "../../shared/time.js";
import { supersede } from "./revision-strategy.js";

/**
 * Create a new belief fact and add it to state.
 * If `contradicts` is provided, existing facts/decisions with those ids
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
    contradicts?: string[];
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

  if (params.contradicts !== undefined && params.contradicts.length > 0) {
    supersede(state, fact.id, params.contradicts);
  }

  state.belief.facts.push(fact);
  return fact;
}

/**
 * Create a new belief decision and add it to state.
 * If `contradicts` is provided, existing facts/decisions are superseded.
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
    contradicts?: string[];
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

  if (params.contradicts !== undefined && params.contradicts.length > 0) {
    supersede(state, decision.id, params.contradicts);
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


