"use strict";

/**
 * Unit tests for the Ranking Strategy (ranking-strategy.ts).
 *
 * Covers rank(), computeRank(), and the getRecency edge cases at lines 56-57
 * (the 0.5 and 0.1 recency branches for entries aged 1-7 days and >7 days).
 */

import { describe, it, expect } from "bun:test";
import { rank, computeRank } from "../../../src/domains/learning/ranking-strategy.js";
import type { LearningEntry } from "../../../src/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function entry(overrides: Partial<LearningEntry> & { capturedAt: string }): LearningEntry {
  const { capturedAt, ...rest } = overrides;
  return {
    id: "test-entry",
    description: "Test learning entry",
    capturedAt,
    status: "captured",
    skillScope: "test",
    resolvedAt: undefined,
    ...rest,
  };
}

function hoursAgo(n: number): string {
  return new Date(Date.now() - n * 60 * 60 * 1000).toISOString();
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// computeRank
// ---------------------------------------------------------------------------

describe("computeRank", () => {
  it("returns 1.0 for a recent entry (≤ 24h) with default flags", () => {
    const e = entry({ capturedAt: hoursAgo(1) });
    expect(computeRank(e)).toBe(1.0);
  });

  it("returns 1.5 for a recent failure entry (failureMultiplier applied)", () => {
    const e = entry({ capturedAt: hoursAgo(1) });
    expect(computeRank(e, true)).toBe(1.5);
  });

  it("returns 2.0 for a recent resolved entry", () => {
    const e = entry({ capturedAt: hoursAgo(1), status: "resolved" });
    expect(computeRank(e)).toBe(2.0);
  });

  it("returns 3.0 for a recent resolved failure entry (both multipliers)", () => {
    const e = entry({ capturedAt: hoursAgo(1), status: "resolved" });
    expect(computeRank(e, true)).toBe(3.0);
  });

  it("returns 0.5 for an entry aged between 1 and 7 days", () => {
    // ~2 days old → hits line 56 (ageMs <= 7*msPerDay → 0.5)
    const e = entry({ capturedAt: daysAgo(2) });
    expect(computeRank(e)).toBe(0.5);
  });

  it("returns 0.1 for an entry older than 7 days", () => {
    // ~10 days old → hits line 57 (falls through to 0.1)
    const e = entry({ capturedAt: daysAgo(10) });
    expect(computeRank(e)).toBe(0.1);
  });

  it("returns 0.1 for an entry with an unparseable capturedAt", () => {
    const e = entry({ capturedAt: "not-a-timestamp" });
    expect(computeRank(e)).toBe(0.1);
  });

  it("returns 0.5 for a failure entry aged between 1 and 7 days", () => {
    const e = entry({ capturedAt: daysAgo(3) });
    expect(computeRank(e, true)).toBe(0.75);
  });

  it("returns 0.2 for a resolved entry older than 7 days", () => {
    const e = entry({ capturedAt: daysAgo(14), status: "resolved" });
    expect(computeRank(e)).toBe(0.2);
  });
});

// ---------------------------------------------------------------------------
// rank
// ---------------------------------------------------------------------------

describe("rank", () => {
  it("returns entries sorted by descending score", () => {
    const entries = [
      entry({ capturedAt: daysAgo(10) }),  // score 0.1
      entry({ capturedAt: hoursAgo(1) }),   // score 1.0
      entry({ capturedAt: daysAgo(2) }),    // score 0.5
    ];
    const ranked = rank(entries);
    expect(ranked).toHaveLength(3);
    expect(ranked[0]!.capturedAt).toBe(entries[1]!.capturedAt);
    expect(ranked[1]!.capturedAt).toBe(entries[2]!.capturedAt);
    expect(ranked[2]!.capturedAt).toBe(entries[0]!.capturedAt);
  });

  it("preserves relative order for entries with equal scores", () => {
    const now = hoursAgo(1);
    const entries = [
      entry({ id: "a", capturedAt: now }),
      entry({ id: "b", capturedAt: now }),
    ];
    const ranked = rank(entries);
    expect(ranked[0]!.id).toBe("a");
    expect(ranked[1]!.id).toBe("b");
  });

  it("applies custom isFailure predicate", () => {
    const entries = [
      entry({ id: "fail", capturedAt: hoursAgo(1) }),
      entry({ id: "ok", capturedAt: hoursAgo(1) }),
    ];
    const isFailure = (e: LearningEntry) => e.id === "fail";
    const ranked = rank(entries, isFailure);
    // Failure entry gets 1.5 vs 1.0 → sorted first
    expect(ranked[0]!.id).toBe("fail");
    expect(ranked[1]!.id).toBe("ok");
  });

  it("defaults isFailure to () => false when not provided", () => {
    const entries = [
      entry({ id: "a", capturedAt: hoursAgo(1) }),
    ];
    expect(() => rank(entries)).not.toThrow();
    expect(rank(entries)).toHaveLength(1);
  });

  it("returns empty array for empty input", () => {
    expect(rank([])).toEqual([]);
  });
});
