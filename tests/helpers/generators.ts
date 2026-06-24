"use strict";

/**
 * fast-check generators for Noesis property-based tests.
 * Version: 1.0.0
 */

import fc from "fast-check";
import type { BeliefFact, BeliefDecision, NoesisState } from "../../src/shared/schema.js";
import { EMPTY_STATE } from "../../src/shared/schema.js";
import { now } from "../../src/shared/time.js";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const SOURCES = ["graph", "execution", "user", "inference", "omp-memory", "obsidian-import"] as const;
const STATUSES = ["active", "superseded", "archived"] as const;
const EPISTEMIC_STATUSES = ["certain", "probable", "speculative", "deprecated", "contradicted"] as const;

/** Arbitrary ISO-8601 date string in a stable range. */
function isoDate(): fc.Arbitrary<string> {
  return fc
    .date({ min: new Date("2023-01-01"), max: new Date("2026-12-31") })
    .map((d) => d.toISOString());
}

/** Arbitrary belief-fact id (matches /^bf-[a-z0-9-]+$/). */
function beliefFactId(): fc.Arbitrary<string> {
  return fc.uuid().map((s) => `bf-${s}`);
}

/** Arbitrary belief-decision id (matches /^bd-[a-z0-9-]+$/). */
function beliefDecisionId(): fc.Arbitrary<string> {
  return fc.uuid().map((s) => `bd-${s}`);
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generate a single belief fact — matches full BeliefFactSchema. */
export function beliefFact(): fc.Arbitrary<BeliefFact> {
  return fc.record({
    id: beliefFactId(),
    content: fc.string({ minLength: 1, maxLength: 200 }),
    confidence: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    source: fc.constantFrom(...SOURCES),
    createdAt: isoDate(),
    updatedAt: isoDate(),
    status: fc.constantFrom(...STATUSES),
    supersededBy: fc.option(beliefFactId(), { nil: undefined }),
    tags: fc.option(
      fc.uniqueArray(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 5 }),
      { nil: undefined },
    ),
    communityScope: fc.option(fc.string({ maxLength: 40 }), { nil: undefined }),
    evidence: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
    epistemicStatus: fc.constantFrom(...EPISTEMIC_STATUSES),
    grounding: fc.option(
      fc.array(
        fc.record({
          graphNodeId: fc.string({ minLength: 1, maxLength: 40 }),
          relation: fc.string({ minLength: 1, maxLength: 20 }),
          extractedAt: isoDate(),
        }),
        { minLength: 0, maxLength: 10 },
      ),
      { nil: undefined },
    ),
  }) as fc.Arbitrary<BeliefFact>;
}

/** Generate a single belief decision. */
export function beliefDecision(): fc.Arbitrary<BeliefDecision> {
  return fc.record({
    id: beliefDecisionId(),
    content: fc.string({ minLength: 1, maxLength: 200 }),
    rationale: fc.string({ minLength: 1, maxLength: 200 }),
    alternatives: fc.option(
      fc.uniqueArray(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 3 }),
      { nil: undefined },
    ),
    source: fc.constantFrom(...SOURCES),
    createdAt: isoDate(),
    updatedAt: isoDate(),
    status: fc.constantFrom(...STATUSES),
    supersededBy: fc.option(beliefDecisionId(), { nil: undefined }),
    tags: fc.option(
      fc.uniqueArray(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 5 }),
      { nil: undefined },
    ),
  }) as fc.Arbitrary<BeliefDecision>;
}

/** Generate a NoesisState with a random number of beliefs. */
export function noesisState(): fc.Arbitrary<NoesisState> {
  return fc
    .tuple(
      fc.array(beliefFact(), { minLength: 0, maxLength: 10 }),
      fc.array(beliefDecision(), { minLength: 0, maxLength: 5 }),
    )
    .map(([facts, decisions]) => ({
      ...structuredClone(EMPTY_STATE),
      lastPersisted: now(),
      belief: { facts, decisions },
    }));
}

/** Pick a random belief-fact id from a state, if any exist. */
export function beliefIdFromState(state: NoesisState): fc.Arbitrary<string> {
  return fc.constantFrom(...state.belief.facts.map((f) => f.id));
}

/** Generate parameters suitable for addFact(). */
export function addFactParams(): fc.Arbitrary<{
  content: string;
  confidence: number;
  source: (typeof SOURCES)[number];
  tags?: string[];
  contradicts?: string[];
}> {
  return fc.record({
    content: fc.string({ minLength: 1, maxLength: 200 }),
    confidence: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    source: fc.constantFrom(...SOURCES),
    tags: fc.option(
      fc.uniqueArray(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 5 }),
      { nil: undefined },
    ),
    contradicts: fc.option(fc.uniqueArray(beliefFactId(), { minLength: 1, maxLength: 3 }), {
      nil: undefined,
    }),
  });
}
