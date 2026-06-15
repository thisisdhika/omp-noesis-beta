"use strict";

import type { NoesisState } from "../../src/schema.ts";

// ---------------------------------------------------------------------------
// AssertionError
// ---------------------------------------------------------------------------

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertionError";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBeliefIds(
  facts: NoesisState["belief"]["facts"],
  decisions: NoesisState["belief"]["decisions"],
): string {
  const all = [...facts, ...decisions];
  return all.length === 0
    ? "(none)"
    : all.map(b => `${b.id} ${b.content} (${b.status})`).join("; ");
}

function formatLearningIds(
  successes: NoesisState["learning"]["successes"],
  failures: NoesisState["learning"]["failures"],
): string {
  const all = [...successes, ...failures];
  return all.length === 0
    ? "(none)"
    : all.map(e => `${e.id} ${e.description} (${e.status})`).join("; ");
}

function formatStepDescriptions(
  steps: NoesisState["commitment"]["workflow"]["steps"],
): string {
  return steps.map(s => JSON.stringify(s.description)).join(", ");
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

/**
 * Asserts that at least one belief entry (fact or decision) matches all
 * provided optional filters. `fact` is matched against the `content` field
 * (case-insensitive substring).
 */
export function assertHasBelief(
  state: NoesisState,
  opts: { id?: string; fact?: string; status?: string; source?: string },
): void {
  const norm = (s: string) => s.toLowerCase();
  const all = [...state.belief.facts, ...state.belief.decisions];

  for (const entry of all) {
    let ok = true;

    if (opts.id && entry.id !== opts.id) ok = false;
    if (opts.fact && !norm(entry.content).includes(norm(opts.fact))) ok = false;
    if (opts.status && entry.status !== opts.status) ok = false;
    if (opts.source && entry.source !== opts.source) ok = false;

    if (ok) return;
  }

  throw new AssertionError(
    `expected belief matching filters ${JSON.stringify(opts)}, ` +
      `found [${formatBeliefIds(state.belief.facts, state.belief.decisions)}]`,
  );
}

/**
 * Asserts that at least one learning entry (success or failure) matches all
 * provided optional filters. `symptom` is matched against the `description`
 * field (case-insensitive substring).
 */
export function assertHasLearning(
  state: NoesisState,
  opts: { id?: string; symptom?: string; status?: string },
): void {
  const norm = (s: string) => s.toLowerCase();
  const all = [...state.learning.failures, ...state.learning.successes];

  for (const entry of all) {
    let ok = true;

    if (opts.id && entry.id !== opts.id) ok = false;
    if (opts.symptom && !norm(entry.description).includes(norm(opts.symptom))) ok = false;
    if (opts.status && entry.status !== opts.status) ok = false;

    if (ok) return;
  }

  throw new AssertionError(
    `expected learning matching filters ${JSON.stringify(opts)}, ` +
      `found [${formatLearningIds(state.learning.successes, state.learning.failures)}]`,
  );
}

/**
 * Asserts that the active workflow matches all provided optional filters.
 * `description` is matched against the `goal` or any step's `description`
 * (case-insensitive substring).
 */
export function assertHasWorkflow(
  state: NoesisState,
  opts: { id?: string; description?: string; status?: string },
): void {
  const norm = (s: string) => s.toLowerCase();
  const wf = state.commitment.workflow;

  if (opts.id && wf.id !== opts.id) {
    throw new AssertionError(
      `expected workflow id "${opts.id}", got "${wf.id}"`,
    );
  }

  if (opts.status && wf.status !== opts.status) {
    throw new AssertionError(
      `expected workflow status "${opts.status}", got "${wf.status}"`,
    );
  }

  if (opts.description) {
    const desc = opts.description;
    const goalMatch = norm(wf.goal).includes(norm(desc));
    const stepMatch = wf.steps.some(s =>
      norm(s.description ?? "").includes(norm(desc)),
    );
    if (!goalMatch && !stepMatch) {
      throw new AssertionError(
        `expected workflow goal or step description containing "${desc}", ` +
          `goal is ${JSON.stringify(wf.goal)}, ` +
          `steps are [${formatStepDescriptions(wf.steps)}]`,
      );
    }
  }
}

/**
 * Asserts that the attention focus string contains the given pattern.
 */
export function assertAttentionHasFocus(
  state: NoesisState,
  pattern: string,
): void {
  const focus = state.attention.focus;
  if (!focus || !focus.toLowerCase().includes(pattern.toLowerCase())) {
    throw new AssertionError(
      `expected attention focus to contain "${pattern}", got ${JSON.stringify(focus)}`,
    );
  }
}

/**
 * Asserts that the total number of belief entries (facts + decisions) is at
 * least `min`.
 */
export function assertBeliefCount(state: NoesisState, min: number): void {
  const count = state.belief.facts.length + state.belief.decisions.length;
  if (count < min) {
    throw new AssertionError(
      `expected at least ${min} belief entries, found ${count} ` +
        `(facts=${state.belief.facts.length}, decisions=${state.belief.decisions.length})`,
    );
  }
}

/**
 * Asserts that the total number of learning entries (successes + failures) is
 * at least `min`.
 */
export function assertLearningCount(state: NoesisState, min: number): void {
  const count = state.learning.failures.length + state.learning.successes.length;
  if (count < min) {
    throw new AssertionError(
      `expected at least ${min} learning entries, found ${count} ` +
        `(failures=${state.learning.failures.length}, successes=${state.learning.successes.length})`,
    );
  }
}

// ---------------------------------------------------------------------------
// Structural assertions (model-agnostic — no content matching)
// ---------------------------------------------------------------------------

/**
 * Asserts that at least one fact belief exists, optionally with given status.
 * Does NOT check content — safe for non-deterministic LLM output.
 */
export function assertFactExists(
  state: NoesisState,
  status?: string,
): void {
  const match = status
    ? state.belief.facts.some(f => f.status === status)
    : state.belief.facts.length > 0;
  if (!match) {
    throw new AssertionError(
      `expected at least one fact belief${status ? ` with status "${status}"` : ""}, ` +
        `found ${state.belief.facts.length} facts`,
    );
  }
}

/**
 * Asserts that at least one decision belief exists.
 * Does NOT check content.
 */
export function assertDecisionExists(state: NoesisState): void {
  if (state.belief.decisions.length === 0) {
    throw new AssertionError(
      `expected at least one decision belief, found 0`,
    );
  }
}

/**
 * Asserts that at least one hypothesis exists, optionally with given status.
 */
export function assertHypothesisExists(
  state: NoesisState,
  status?: string,
): void {
  const match = status
    ? state.inference.hypotheses.some(h => h.status === status)
    : state.inference.hypotheses.length > 0;
  if (!match) {
    throw new AssertionError(
      `expected at least one hypothesis${status ? ` with status "${status}"` : ""}, ` +
        `found ${state.inference.hypotheses.length}`,
    );
  }
}

/**
 * Asserts that a workflow is active (non-null goal) with optional status.
 */
export function assertWorkflowExists(
  state: NoesisState,
  status?: string,
): void {
  const wf = state.commitment.workflow;
  if (!wf.goal) {
    throw new AssertionError("expected an active workflow, found none");
  }
  if (status && wf.status !== status) {
    throw new AssertionError(
      `expected workflow status "${status}", got "${wf.status}"`,
    );
  }
}

/**
 * Asserts that attention focus is set (non-empty string).
 */
export function assertAttentionSet(state: NoesisState): void {
  if (!state.attention.focus || state.attention.focus.trim().length === 0) {
    throw new AssertionError("expected attention focus to be set");
  }
}
