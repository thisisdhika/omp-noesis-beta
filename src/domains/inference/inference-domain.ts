"use strict";

/**
 * Inference Domain: Hypothesis management and reasoning tracking.
 * Version: 1.0.0
 *
 * Provides functions for the hypothesis lifecycle (create, confirm, refute,
 * update) and reasoning step recording within the omp-noesis cognitive
 * architecture.
 */

import type { NoesisState } from "../../shared/schema.js";
import type { Hypothesis, HypothesisStatus, ReasoningStep } from "./schema.js";
import type { BeliefFact } from "../belief/schema.js";
import { CAPS, generateId } from "../../shared/schema-base.js";
import { now } from "../../shared/time.js";

// ============================================================================
// Hypotheses
// ============================================================================

/**
 * Create a new hypothesis in "testing" status and add it to state.
 *
 * @param state  Mutable Noesis state.
 * @param params  Content, optional evidence, and optional tags.
 * @returns The newly created Hypothesis.
 */
export function addHypothesis(
  state: NoesisState,
  params: { content: string; evidence?: string; tags?: string[] },
): Hypothesis {
  const hypothesis: Hypothesis = {
    id: generateId("hy"),
    content: params.content,
    status: "testing",
    evidence: params.evidence,
    tags: params.tags,
    createdAt: now(),
    updatedAt: now(),
  };
  state.inference.hypotheses.push(hypothesis);
  return hypothesis;
}

/**
 * Update an existing hypothesis by id. Only the provided fields are changed.
 *
 * @param state   Mutable Noesis state.
 * @param id      Hypothesis id to update.
 * @param updates  Partial fields to apply.
 * @returns The updated Hypothesis, or `null` if not found.
 */
export function updateHypothesis(
  state: NoesisState,
  id: string,
  updates: { status?: HypothesisStatus; evidence?: string; relatedBeliefId?: string },
): Hypothesis | null {
  const hypothesis = state.inference.hypotheses.find((h) => h.id === id);
  if (!hypothesis) return null;

  if (updates.status !== undefined) hypothesis.status = updates.status;
  if (updates.evidence !== undefined) hypothesis.evidence = updates.evidence;
  if (updates.relatedBeliefId !== undefined) hypothesis.relatedBeliefId = updates.relatedBeliefId;

  hypothesis.updatedAt = now();
  return hypothesis;
}

/**
 * Mark a hypothesis as confirmed and optionally promote it to a belief fact.
 *
 * When `autoPromote` is not `false`, a new `BeliefFact` is created from the
 * hypothesis content with confidence 0.85 and source "inference", and the
 * hypothesis' `relatedBeliefId` is set to the new fact's id.
 *
 * @param state        Mutable Noesis state.
 * @param id           Hypothesis id to confirm.
 * @param autoPromote  Whether to auto-promote to belief (default `true`).
 * @returns `{ hypothesis, beliefFact? }` or `null` if the hypothesis was not found.
 */
export function confirmHypothesis(
  state: NoesisState,
  id: string,
  autoPromote?: boolean,
): { hypothesis: Hypothesis; beliefFact?: BeliefFact } | null {
  const hypothesis = state.inference.hypotheses.find((h) => h.id === id);
  if (!hypothesis) return null;

  hypothesis.status = "confirmed";
  hypothesis.updatedAt = now();

  let beliefFact: BeliefFact | undefined;

  if (autoPromote !== false) {
    beliefFact = {
      id: generateId("bf"),
      content: hypothesis.content,
      confidence: 0.85,
      source: "inference",
      createdAt: now(),
      updatedAt: now(),
      status: "active",
      tags: hypothesis.tags,
      evidence: hypothesis.evidence,
    };
    hypothesis.relatedBeliefId = beliefFact.id;
  }

  return { hypothesis, beliefFact };
}

/**
 * Mark a hypothesis as refuted.
 *
 * @param state  Mutable Noesis state.
 * @param id     Hypothesis id to refute.
 * @returns The refuted Hypothesis, or `null` if not found.
 */
export function refuteHypothesis(
  state: NoesisState,
  id: string,
): Hypothesis | null {
  const hypothesis = state.inference.hypotheses.find((h) => h.id === id);
  if (!hypothesis) return null;

  hypothesis.status = "refuted";
  hypothesis.updatedAt = now();
  return hypothesis;
}

// ============================================================================
// Reasoning
// ============================================================================

/**
 * Add a reasoning step to the inference log.
 *
 * @param state      Mutable Noesis state.
 * @param content    The reasoning text.
 * @param relatesTo  Optional hypothesis or entity this step refers to.
 * @returns The newly created ReasoningStep.
 */
export function addReasoning(
  state: NoesisState,
  content: string,
  relatesTo?: string,
): ReasoningStep {
  const step: ReasoningStep = {
    id: generateId("rs"),
    content,
    relatesTo,
    createdAt: now(),
  };
  state.inference.reasoning.push(step);
  return step;
}
