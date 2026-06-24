"use strict";

/**
 * Property-based tests for eviction invariants.
 *
 * Invariants:
 * 1. Never evict all entries: evictOverCap always keeps at least
 *    min(originalLength, cap) entries.
 * 2. Stale eviction never removes resolved learning entries.
 * 3. Capacity eviction preserves the newest entries (most recent capturedAt).
 *
 * Version: 1.0.0
 */

import fc from "fast-check";
import { describe, it, expect } from "bun:test";
import { evictOverCap, evictStale } from "../../src/domains/learning/eviction-strategy.js";
import type { LearningEntry } from "../../src/domains/learning/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate an arbitrary LearningEntry for eviction tests. */
function learningEntry(): fc.Arbitrary<LearningEntry> {
  return fc.record({
    id: fc.uuid().map((s) => `le-${s}`),
    type: fc.constantFrom("inference", "hypothesis", "observation"),
    content: fc.string({ minLength: 1, maxLength: 100 }),
    status: fc.constantFrom("resolved", "unresolved"),
    capturedAt: fc
      .date({ min: new Date("2020-01-01"), max: new Date("2026-12-31") })
      .map((d) => d.toISOString()),
    tags: fc.option(
      fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }),
      { nil: undefined },
    ),
    turnCaptured: fc.nat({ max: 1000 }),
    confidence: fc.option(
      fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
      { nil: undefined },
    ),
  }) as unknown as fc.Arbitrary<LearningEntry>;
}

/** Arbitrary non-negative integer cap, 0–100. */
const capArb = fc.nat({ max: 100 });

// ---------------------------------------------------------------------------
// Invariant 1: Never evict all entries
// ---------------------------------------------------------------------------

describe("never evict last entry", () => {
  it("evictOverCap keeps at least min(originalLength, cap) entries", () => {
    fc.assert(
      fc.property(fc.array(learningEntry(), { minLength: 0, maxLength: 50 }), capArb, (entries, cap) => {
        const result = evictOverCap(entries, cap);
        const expected = Math.min(entries.length, cap);
        expect(result.length).toBe(expected);
        // All result entries must have been in the original array
        for (const entry of result) {
          expect(entries.find((e) => e.id === entry.id)).toBeDefined();
        }
      }),
      { numRuns: 200 },
    );
  });

  it("evictOverCap never returns a negative-length or empty result when entries exist and cap > 0", () => {
    fc.assert(
      fc.property(
        fc.array(learningEntry(), { minLength: 1, maxLength: 30 }),
        fc.integer({ min: 1, max: 30 }),
        (entries, cap) => {
          const result = evictOverCap(entries, cap);
          expect(result.length).toBeGreaterThanOrEqual(1);
          expect(result.length).toBeLessThanOrEqual(Math.min(entries.length, cap));
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Invariant 2: Stale eviction preserves resolved entries
// ---------------------------------------------------------------------------

describe("stale eviction preserves resolved entries", () => {
  it("evictStale never removes entries with status 'resolved'", () => {
    fc.assert(
      fc.property(
        fc.array(learningEntry(), { minLength: 0, maxLength: 30 }),
        fc.nat({ max: 720 }),
        (entries, staleHours) => {
          const resolvedCount = entries.filter((e) => e.status === "resolved").length;
          const result = evictStale(entries, staleHours);
          const resultResolved = result.filter((e) => e.status === "resolved").length;
          // All resolved entries must survive
          expect(resultResolved).toBe(resolvedCount);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("evictStale returns a subset of the input (never invents entries)", () => {
    fc.assert(
      fc.property(
        fc.array(learningEntry(), { minLength: 0, maxLength: 30 }),
        fc.nat({ max: 720 }),
        (entries, staleHours) => {
          const result = evictStale(entries, staleHours);
          for (const entry of result) {
            expect(entries.find((e) => e.id === entry.id)).toBeDefined();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Invariant 3: Capacity eviction preserves newest entries
// ---------------------------------------------------------------------------

describe("capacity eviction preserves newest entries", () => {
  it("evictOverCap keeps the entries with the most recent capturedAt dates", () => {
    fc.assert(
      fc.property(
        fc.array(learningEntry(), { minLength: 5, maxLength: 30 }).map((entries) =>
          entries.map((e, i) => ({ ...e, id: `le-${i}` })),
        ),
        fc.integer({ min: 1, max: 10 }),
        (entries, cap) => {
          const result = evictOverCap(entries, cap);

          // Sort by capturedAt desc, then id as tiebreaker for equal timestamps
          const sorted = [...entries].sort((a, b) => {
            const ts = Date.parse(b.capturedAt) - Date.parse(a.capturedAt);
            if (ts !== 0) return ts;
            return a.id.localeCompare(b.id);
          });
          const expectedNewest = sorted.slice(0, cap).map((e) => e.id).sort();

          const resultIds = result.map((e) => e.id).sort();
          expect(resultIds).toEqual(expectedNewest);
        },
      ),
      { numRuns: 100 },
    );
  });
});
