"use strict";

/**
 * Property-based tests for AGM belief revision postulates.
 *
 * K*1  Closure: belief set is deductively closed (schema-valid).
 * K*2  Consistency: revision preserves consistency.
 * K*3  Inclusion: new belief is included in revised set.
 * K*4  Preservation: beliefs not contradicted by new evidence are retained.
 * K*5–6 Supersession immutability: superseded entries cannot be reactivated.
 *
 * Version: 1.0.0
 */

import fc from "fast-check";
import { describe, it, expect } from "bun:test";
import { cloneState } from "../helpers/fixtures.js";
import { addFact, getActiveFacts } from "../../src/domains/belief/belief-domain.js";
import { NoesisStateSchema } from "../../src/shared/schema.js";
import { addFactParams, noesisState, beliefIdFromState } from "../helpers/generators.js";

// ---------------------------------------------------------------------------
// K*1 + K*2: Consistency & Schema Validity
// ---------------------------------------------------------------------------

describe("AGM K*1–K*2: consistency", () => {
  it("every state remains schema-valid after adding any random fact", () => {
    fc.assert(
      fc.property(noesisState(), addFactParams(), (state, params) => {
        // Remove contradicts since it references nonexistent ids from random gen
        const safe = { ...params, contradicts: undefined };
        addFact(state, safe);
        // K*1 + K*2: result is schema-valid (closed & consistent)
        const parsed = NoesisStateSchema.safeParse(state);
        expect(parsed.success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// K*3: Inclusion
// ---------------------------------------------------------------------------

describe("AGM K*3: inclusion", () => {
  it("a newly added fact appears in getActiveFacts", () => {
    fc.assert(
      fc.property(addFactParams(), (params) => {
        const state = cloneState();
        const fact = addFact(state, { ...params, contradicts: undefined });
        const active = getActiveFacts(state);
        expect(active.find((f) => f.id === fact.id)).toBeDefined();
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// K*4: Preservation
// ---------------------------------------------------------------------------

describe("AGM K*4: preservation", () => {
  it("adding a fact that does not contradict existing ones leaves prior facts active", () => {
    fc.assert(
      fc.property(addFactParams(), addFactParams(), (a, b) => {
        const state = cloneState();
        const factA = addFact(state, { ...a, contradicts: undefined });

        // Add B with no relation to A
        addFact(state, { ...b, contradicts: undefined });

        // A should still be active
        const refreshed = state.belief.facts.find((f) => f.id === factA.id)!;
        expect(refreshed.status).toBe("active");
      }),
      { numRuns: 100 },
    );
  });

  it("only facts explicitly listed in contradicts get superseded", () => {
    fc.assert(
      fc.property(addFactParams(), addFactParams(), (a, b) => {
        const state = cloneState();
        const factA = addFact(state, { ...a, contradicts: undefined });

        // B contradicts a random id that is NOT factA's id
        addFact(state, {
          ...b,
          contradicts: ["bf-nonexistent-" + crypto.randomUUID().slice(0, 8)],
        });

        const refreshed = state.belief.facts.find((f) => f.id === factA.id)!;
        expect(refreshed.status).toBe("active");
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// K*5–K*6: Supersession immutability
// ---------------------------------------------------------------------------

describe("AGM K*5–K*6: supersession immutability", () => {
  it("a superseded fact cannot be reactivated — no new fact targets it via contradicts", () => {
    fc.assert(
      fc.property(addFactParams(), addFactParams(), addFactParams(), (a, b, c) => {
        const state = cloneState();
        const factA = addFact(state, { ...a, contradicts: undefined });

        // B supersedes A
        addFact(state, { ...b, contradicts: [factA.id] });

        const before = state.belief.facts.filter((f) => f.status === "superseded").length;

        // C also tries to supersede A (already superseded) — should no-op for A
        addFact(state, { ...c, contradicts: [factA.id] });

        const after = state.belief.facts.filter((f) => f.status === "superseded").length;
        // Only B's supersession should have increased the count
        expect(after - before).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it("superseded facts are excluded from getActiveFacts", () => {
    fc.assert(
      fc.property(addFactParams(), addFactParams(), (a, b) => {
        const state = cloneState();
        const factA = addFact(state, { ...a, contradicts: undefined });

        // B supersedes A
        addFact(state, { ...b, contradicts: [factA.id] });

        const active = getActiveFacts(state);
        expect(active.find((f) => f.id === factA.id)).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });
});
