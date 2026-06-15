"use strict";

import { describe, it, expect } from "bun:test";
import { now, isStaleHours } from "../../../src/shared/time.js";

describe("now", () => {
  it("should return an ISO 8601 string", () => {
    const result = now();
    expect(result).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it("should return a value close to Date.now()", () => {
    const before = Date.now();
    const result = now();
    const after = Date.now();
    const resultMs = new Date(result).getTime();
    expect(resultMs).toBeGreaterThanOrEqual(before);
    expect(resultMs).toBeLessThanOrEqual(after);
  });
});

describe("isStaleHours", () => {
  it("should return false for a fresh timestamp (0 hours threshold)", () => {
    const fresh = now();
    expect(isStaleHours(fresh, 0)).toBe(false);
  });

  it("should return false for a very recent timestamp with a generous threshold", () => {
    const fresh = now();
    expect(isStaleHours(fresh, 24)).toBe(false);
  });

  it("should return true for an old timestamp", () => {
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
    expect(isStaleHours(old, 1)).toBe(true);
  });

  it("should return true for an unparseable timestamp", () => {
    expect(isStaleHours("not-a-date", 1)).toBe(true);
  });

  it("should return true for an empty string", () => {
    expect(isStaleHours("", 1)).toBe(true);
  });

  it("should return false for a timestamp just inside the threshold", () => {
    // 30 minutes ago, threshold of 1 hour => not stale
    const recent = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    expect(isStaleHours(recent, 1)).toBe(false);
  });
});
