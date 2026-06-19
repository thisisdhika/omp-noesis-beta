"use strict";

/**
 * Unit tests for eviction strategies (eviction-strategy.ts).
 *
 * Pure-function tests for evictStale and evictOverCap.
 */

import { describe, it, expect } from "bun:test";
import { evictStale, evictOverCap } from "../../../src/domains/learning/eviction-strategy.js";
import type { LearningEntry } from "../../../src/shared/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Timestamp `hoursAgo` in the past. */
function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

/** A minimal learning entry with required fields, status defaults to "captured". */
function entry(overrides: Partial<LearningEntry> & { id: string }): LearningEntry {
  return {
    description: "test entry",
    status: "captured",
    capturedAt: hoursAgo(1),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// evictStale
// ---------------------------------------------------------------------------

describe("evictStale", () => {
  it("removes unresolved entries older than the default threshold (720h)", () => {
    const entries: LearningEntry[] = [
      entry({ id: "le-old", description: "Old entry", capturedAt: hoursAgo(1000) }),
      entry({ id: "le-recent", description: "Recent entry", capturedAt: hoursAgo(1) }),
    ];

    const result = evictStale(entries);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("le-recent");
  });

  it("keeps resolved entries regardless of age", () => {
    const entries: LearningEntry[] = [
      entry({ id: "le-old-resolved", description: "Old but resolved", status: "resolved", capturedAt: hoursAgo(5000) }),
    ];

    const result = evictStale(entries, 1);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("le-old-resolved");
  });

  it("evicts diagnosed entries when stale (only resolved survives)", () => {
    const entries: LearningEntry[] = [
      entry({ id: "le-diagnosed", description: "Diagnosed but stale", status: "diagnosed", capturedAt: hoursAgo(5000) }),
    ];

    const result = evictStale(entries, 1);
    expect(result).toHaveLength(0);
  });

  it("respects a custom staleHours parameter", () => {
    const entries: LearningEntry[] = [
      entry({ id: "le-recent", description: "Recent entry", capturedAt: hoursAgo(2) }),
      entry({ id: "le-old", description: "Old entry", capturedAt: hoursAgo(10) }),
    ];

    const result = evictStale(entries, 5);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("le-recent");
  });

  it("returns all entries when none are stale", () => {
    const entries: LearningEntry[] = [
      entry({ id: "le-1", description: "Entry 1", capturedAt: hoursAgo(1) }),
      entry({ id: "le-2", description: "Entry 2", capturedAt: hoursAgo(2) }),
    ];

    const result = evictStale(entries);
    expect(result).toHaveLength(2);
  });

  it("returns empty array when all entries are stale and unresolved", () => {
    const entries: LearningEntry[] = [
      entry({ id: "le-1", description: "Stale 1", capturedAt: hoursAgo(5000) }),
      entry({ id: "le-2", description: "Stale 2", capturedAt: hoursAgo(6000) }),
    ];

    const result = evictStale(entries, 1);
    expect(result).toHaveLength(0);
  });

  it("returns empty array when given an empty array", () => {
    const result = evictStale([], 100);
    expect(result).toEqual([]);
  });

  it("does not mutate the original array", () => {
    const entries: LearningEntry[] = [
      entry({ id: "le-stale", description: "Stale", capturedAt: hoursAgo(5000) }),
      entry({ id: "le-fresh", description: "Fresh", capturedAt: hoursAgo(1) }),
    ];
    const snapshot = [...entries];

    evictStale(entries, 1);

    expect(entries).toEqual(snapshot);
  });

  it("uses default staleHours (720) when not provided", () => {
    // 700 hours old — within default threshold (720h), so kept
    const entries: LearningEntry[] = [
      entry({ id: "le-borderline", description: "Borderline", capturedAt: hoursAgo(700) }),
    ];

    const result = evictStale(entries);
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// evictOverCap
// ---------------------------------------------------------------------------

describe("evictOverCap", () => {
  it("returns a copy when entries are under capacity", () => {
    const entries: LearningEntry[] = [
      entry({ id: "le-1", description: "Entry 1" }),
      entry({ id: "le-2", description: "Entry 2" }),
    ];

    const result = evictOverCap(entries, 5);
    expect(result).toHaveLength(2);
    expect(result).not.toBe(entries); // different reference
  });

  it("returns a copy when entries are exactly at capacity", () => {
    const entries: LearningEntry[] = [
      entry({ id: "le-1", description: "Entry 1", capturedAt: hoursAgo(10) }),
      entry({ id: "le-2", description: "Entry 2", capturedAt: hoursAgo(5) }),
      entry({ id: "le-3", description: "Entry 3", capturedAt: hoursAgo(1) }),
    ];

    const result = evictOverCap(entries, 3);
    expect(result).toHaveLength(3);
    expect(result).not.toBe(entries);
  });

  it("drops the oldest entries when over capacity", () => {
    const entries: LearningEntry[] = [
      entry({ id: "le-old", description: "Oldest", capturedAt: hoursAgo(100) }),
      entry({ id: "le-mid", description: "Middle", capturedAt: hoursAgo(10) }),
      entry({ id: "le-new", description: "Newest", capturedAt: hoursAgo(1) }),
    ];

    const result = evictOverCap(entries, 2);
    expect(result).toHaveLength(2);
    // The oldest (le-old) should be dropped
    expect(result.find((e) => e.id === "le-old")).toBeUndefined();
    expect(result.find((e) => e.id === "le-mid")).toBeDefined();
    expect(result.find((e) => e.id === "le-new")).toBeDefined();
  });

  it("returns empty array when given empty array", () => {
    const result = evictOverCap([], 10);
    expect(result).toEqual([]);
  });

  it("keeps the newest entry when capacity is 1", () => {
    const entries: LearningEntry[] = [
      entry({ id: "le-old", description: "Old", capturedAt: hoursAgo(100) }),
      entry({ id: "le-new", description: "New", capturedAt: hoursAgo(1) }),
    ];

    const result = evictOverCap(entries, 1);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("le-new");
  });

  it("does not mutate the original array", () => {
    const entries: LearningEntry[] = [
      entry({ id: "le-a", description: "A", capturedAt: hoursAgo(100) }),
      entry({ id: "le-b", description: "B", capturedAt: hoursAgo(50) }),
      entry({ id: "le-c", description: "C", capturedAt: hoursAgo(1) }),
    ];
    const snapshot = [...entries];

    evictOverCap(entries, 2);

    expect(entries).toEqual(snapshot);
  });

  it("handles all entries with identical capturedAt (ties broken by sort stability)", () => {
    const sameTime = hoursAgo(10);
    const entries: LearningEntry[] = [
      entry({ id: "le-1", description: "First", capturedAt: sameTime }),
      entry({ id: "le-2", description: "Second", capturedAt: sameTime }),
      entry({ id: "le-3", description: "Third", capturedAt: sameTime }),
    ];

    // Cap of 2 drops 1 — should drop first in sort order (le-1)
    const result = evictOverCap(entries, 2);
    expect(result).toHaveLength(2);
    expect(result.find((e) => e.id === "le-1")).toBeUndefined();
  });

  it("drops multiple entries when far over capacity", () => {
    const entries: LearningEntry[] = [
      entry({ id: "le-1", description: "Oldest", capturedAt: hoursAgo(100) }),
      entry({ id: "le-2", description: "Old", capturedAt: hoursAgo(80) }),
      entry({ id: "le-3", description: "Middle", capturedAt: hoursAgo(60) }),
      entry({ id: "le-4", description: "Recent", capturedAt: hoursAgo(40) }),
      entry({ id: "le-5", description: "Newest", capturedAt: hoursAgo(20) }),
    ];

    const result = evictOverCap(entries, 2);
    expect(result).toHaveLength(2);
    // Only 2 newest should remain
    expect(result.find((e) => e.id === "le-4")).toBeDefined();
    expect(result.find((e) => e.id === "le-5")).toBeDefined();
    expect(result.find((e) => e.id === "le-1")).toBeUndefined();
    expect(result.find((e) => e.id === "le-2")).toBeUndefined();
    expect(result.find((e) => e.id === "le-3")).toBeUndefined();
  });
});
