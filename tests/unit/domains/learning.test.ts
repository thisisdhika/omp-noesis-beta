"use strict";

/**
 * Unit tests for the Learning Domain (learning-domain.ts).
 *
 * Tests addLearning, resolveLearning, getRankedLearning, getFailures,
 * and evictStale — including success/failure routing, cap enforcement,
 * eviction, and edge cases around missing IDs.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  addLearning,
  resolveLearning,
  getRankedLearning,
  getFailures,
} from "../../../src/domains/learning/learning-domain.js";
import { evictStale } from "../../../src/domains/learning/eviction-strategy.js";
import type { NoesisState, LearningEntry } from "../../../src/shared/schema.js";
import { EMPTY_STATE, CAPS } from "../../../src/shared/schema.js";
import { freshState } from "../../helpers/fixtures.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


function oldTimestamp(hoursAgo: number): string {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// addLearning
// ---------------------------------------------------------------------------

describe("addLearning", () => {
  it("routes to successes when isSuccess is true", () => {
    const state = freshState();
    const entry = addLearning(state, {
      description: "Fixed a race condition with atomic writes",
      skillScope: "persistence",
      toolName: "writeAtomic",
      isSuccess: true,
    });

    expect(entry.id).toMatch(/^le-/);
    expect(entry.description).toBe("Fixed a race condition with atomic writes");
    expect(entry.skillScope).toBe("persistence");
    expect(entry.toolName).toBe("writeAtomic");
    expect(entry.status).toBe("captured");

    expect(state.learning.successes).toHaveLength(1);
    expect(state.learning.failures).toHaveLength(0);
    expect(state.learning.summary.successCount).toBe(1);
  });

  it("routes to failures when isSuccess is false (default)", () => {
    const state = freshState();
    const entry = addLearning(state, {
      description: "Failed to reproduce the bug",
      isSuccess: false,
    });

    expect(state.learning.failures).toHaveLength(1);
    expect(state.learning.successes).toHaveLength(0);
    expect(state.learning.summary.failureCount).toBe(1);
  });

  it("defaults isSuccess to false", () => {
    const state = freshState();
    addLearning(state, { description: "Default failure" });

    expect(state.learning.failures).toHaveLength(1);
    expect(state.learning.successes).toHaveLength(0);
    expect(state.learning.summary.failureCount).toBe(1);
  });

  it("handles optional skillScope and toolName omitted", () => {
    const state = freshState();
    const entry = addLearning(state, { description: "Minimal entry" });

    expect(entry.skillScope).toBeUndefined();
    expect(entry.toolName).toBeUndefined();
  });

  it("calls evictOverCap for successes array", () => {
    const state = freshState();
    // Fill successes to the cap
    for (let i = 0; i < CAPS.learningEntries; i++) {
      addLearning(state, { description: `Success ${i}`, isSuccess: true });
    }
    expect(state.learning.successes).toHaveLength(CAPS.learningEntries);

    // Adding one more should evict the oldest
    addLearning(state, { description: "Newest success", isSuccess: true });
    expect(state.learning.successes).toHaveLength(CAPS.learningEntries);
    // The newest entry should be present
    expect(state.learning.successes.some((e) => e.description === "Newest success")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveLearning
// ---------------------------------------------------------------------------

describe("resolveLearning", () => {
  it("sets resolved status, rootCause, and fix on a learning entry", () => {
    const state = freshState();
    const entry = addLearning(state, {
      description: "Timeout during socket write",
      isSuccess: false,
    });

    const resolved = resolveLearning(state, entry.id, "Buffer full", "Increase buffer size");

    expect(resolved).not.toBeNull();
    expect(resolved!.status).toBe("resolved");
    expect(resolved!.rootCause).toBe("Buffer full");
    expect(resolved!.fix).toBe("Increase buffer size");
    expect(resolved!.resolvedAt).toBeDefined();

    expect(state.learning.summary.resolvedCount).toBe(1);
  });

  it("returns null for a non-existent learning entry", () => {
    const state = freshState();
    expect(resolveLearning(state, "ghost-id", "rc", "fix")).toBeNull();
  });

  it("finds entries in both successes and failures arrays", () => {
    const state = freshState();
    const entry = addLearning(state, {
      description: "A success entry",
      isSuccess: true,
    });

    const resolved = resolveLearning(state, entry.id, "Good practice", "Document it");
    expect(resolved).not.toBeNull();
    expect(resolved!.status).toBe("resolved");
    expect(state.learning.successes[0]!.status).toBe("resolved");
  });
});

// ---------------------------------------------------------------------------
// getRankedLearning
// ---------------------------------------------------------------------------

describe("getRankedLearning", () => {
  it("returns top-ranked entries from both successes and failures", () => {
    const state = freshState();
    addLearning(state, { description: "Failure 1", isSuccess: false });
    addLearning(state, { description: "Success 1", isSuccess: true });

    const ranked = getRankedLearning(state, 5);
    expect(ranked).toHaveLength(2);
  });

  it("respects the limit parameter", () => {
    const state = freshState();
    for (let i = 0; i < 10; i++) {
      addLearning(state, { description: `Entry ${i}` });
    }

    const ranked = getRankedLearning(state, 3);
    expect(ranked).toHaveLength(3);
  });

  it("filters by skillScope when provided", () => {
    const state = freshState();
    addLearning(state, { description: "Persistence failure", skillScope: "persistence", isSuccess: false });
    addLearning(state, { description: "Networking failure", skillScope: "networking", isSuccess: false });

    const ranked = getRankedLearning(state, 5, "persistence");
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.description).toBe("Persistence failure");
  });

  it("defaults limit to 5", () => {
    const state = freshState();
    for (let i = 0; i < 10; i++) {
      addLearning(state, { description: `Entry ${i}` });
    }

    const ranked = getRankedLearning(state);
    expect(ranked).toHaveLength(5);
  });

  it("returns empty array from empty state", () => {
    const state = freshState();
    expect(getRankedLearning(state)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getFailures
// ---------------------------------------------------------------------------

describe("getFailures", () => {
  it("returns unresolved failures", () => {
    const state = freshState();
    addLearning(state, { description: "Unresolved failure", isSuccess: false });
    addLearning(state, { description: "Unresolved too", isSuccess: false });

    const failures = getFailures(state);
    expect(failures).toHaveLength(2);
  });

  it("excludes resolved failures", () => {
    const state = freshState();
    const entry = addLearning(state, { description: "Will be resolved", isSuccess: false });
    resolveLearning(state, entry.id, "X", "Y");

    // After resolution, getFailures should exclude it
    expect(getFailures(state)).toHaveLength(0);
  });

  it("does not return successes", () => {
    const state = freshState();
    addLearning(state, { description: "Success entry", isSuccess: true });
    addLearning(state, { description: "Failure entry", isSuccess: false });

    const failures = getFailures(state);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.description).toBe("Failure entry");
  });

  it("returns empty array when no failures exist", () => {
    const state = freshState();
    expect(getFailures(state)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// evictStale
// ---------------------------------------------------------------------------

describe("evictStale", () => {
  it("removes unresolved entries older than staleHours", () => {
    const entries: LearningEntry[] = [
      {
        id: "le-old",
        description: "Old unresolved",
        status: "captured",
        capturedAt: oldTimestamp(1000), // older than 720h default
      },
      {
        id: "le-recent",
        description: "Recent unresolved",
        status: "captured",
        capturedAt: oldTimestamp(1), // within 720h
      },
    ];

    const result = evictStale(entries);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("le-recent");
  });

  it("keeps resolved entries regardless of age", () => {
    const entries: LearningEntry[] = [
      {
        id: "le-old-resolved",
        description: "Old but resolved",
        status: "resolved",
        capturedAt: oldTimestamp(5000),
      },
    ];

    const result = evictStale(entries, 1); // 1 hour staleness
    expect(result).toHaveLength(1);
  });

  it("respects custom staleHours parameter", () => {
    const entries: LearningEntry[] = [
      {
        id: "le-recent",
        description: "Recent entry",
        status: "captured",
        capturedAt: oldTimestamp(2), // 2 hours old
      },
      {
        id: "le-old",
        description: "Old entry",
        status: "captured",
        capturedAt: oldTimestamp(10), // 10 hours old
      },
    ];

    // 5 hours threshold — old gets evicted, recent stays
    const result = evictStale(entries, 5);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("le-recent");
  });

  it("returns all entries when none are stale", () => {
    const entries: LearningEntry[] = [
      {
        id: "le-1",
        description: "Fresh entry",
        status: "captured",
        capturedAt: oldTimestamp(1),
      },
    ];

    const result = evictStale(entries);
    expect(result).toHaveLength(1);
  });
});
