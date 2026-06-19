"use strict";

/**
 * Unit tests for the Ranking Strategy (ranking-strategy.ts).
 *
 * Covers rank() and computeRank() with position-based recency,
 * failure multiplier, resolved-fix multiplier, and task relevance.
 */

import { describe, it, expect } from "bun:test";
import { rank, computeRank } from "../../../src/domains/learning/ranking-strategy.js";
import type { LearningEntry } from "../../../src/shared/schema.js";

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
  it("returns 1.0 for a default entry with default recency", () => {
    const e = entry({ capturedAt: hoursAgo(1) });
    expect(computeRank(e)).toBe(1.0);
  });

  it("returns 2.0 for a failure entry (failureMultiplier applied)", () => {
    const e = entry({ capturedAt: hoursAgo(1) });
    expect(computeRank(e, true)).toBe(2.0);
  });

  it("returns 2.0 for an entry with rootCause and fix", () => {
    const e = entry({ capturedAt: hoursAgo(1), rootCause: "overflow bug", fix: "add bounds check" });
    expect(computeRank(e)).toBe(2.0);
  });

  it("returns 4.0 for a failure entry with rootCause and fix (both multipliers)", () => {
    const e = entry({ capturedAt: hoursAgo(1), rootCause: "overflow bug", fix: "add bounds check" });
    expect(computeRank(e, true)).toBe(4.0);
  });

  it("uses explicit recency when provided", () => {
    const e = entry({ capturedAt: hoursAgo(1) });
    expect(computeRank(e, false, 0.6)).toBe(0.6);
  });

  it("uses taskRelevance 1.0 when taskDomain matches toolName", () => {
    const e = entry({ capturedAt: hoursAgo(1), toolName: "graph" });
    expect(computeRank(e, false, 1.0, "graph")).toBe(1.0);
  });

  it("uses taskRelevance 0.5 when taskDomain differs from toolName", () => {
    const e = entry({ capturedAt: hoursAgo(1), toolName: "search" });
    expect(computeRank(e, false, 1.0, "graph")).toBe(0.5);
  });

  it("defaults taskRelevance to 1.0 when taskDomain is not provided", () => {
    const e = entry({ capturedAt: hoursAgo(1), toolName: "graph" });
    expect(computeRank(e)).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// rank
// ---------------------------------------------------------------------------

describe("rank", () => {
  it("returns entries sorted by descending score", () => {
    const entries = [
      entry({ capturedAt: daysAgo(10) }),  // position 2, recency 0.6
      entry({ capturedAt: hoursAgo(1) }),   // position 0, recency 1.0
      entry({ capturedAt: daysAgo(2) }),    // position 1, recency 0.8
    ];
    const ranked = rank(entries);
    expect(ranked).toHaveLength(3);
    expect(ranked[0]!.capturedAt).toBe(entries[1]!.capturedAt);
    expect(ranked[1]!.capturedAt).toBe(entries[2]!.capturedAt);
    expect(ranked[2]!.capturedAt).toBe(entries[0]!.capturedAt);
  });

  it("preserves relative order for entries with same capturedAt", () => {
    const nowTm = hoursAgo(1);
    const entries = [
      entry({ id: "a", capturedAt: nowTm }),
      entry({ id: "b", capturedAt: nowTm }),
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
    // Failure entry gets 1.0×1.0×2.0×1.0 = 2.0 vs 1.0 → sorted first
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
