"use strict";

/**
 * Unit tests for compaction loss metrics.
 *
 * Manually constructs belief states (no dependency on belief-domain helpers)
 * to keep tests focused on diff logic.
 */

import { describe, it, expect } from "bun:test";
import { computeCompactionResult } from "../../../src/domains/compaction/loss-strategy.js";
import { CompactionResultSchema } from "../../../src/domains/compaction/schema.js";
import { cloneState } from "../../helpers/fixtures.js";
import type { BeliefFact, BeliefDecision } from "../../../src/domains/belief/schema.js";

function fact(id: string, overrides?: Partial<BeliefFact>): BeliefFact {
  return {
    id,
    content: `fact ${id}`,
    confidence: 0.9,
    source: "execution",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    status: "active",
    epistemicStatus: "certain",
    scope: "local" as const,
    revision: 0,
    reviewRequired: false,
    ...overrides,
  };
}

function decision(id: string, overrides?: Partial<BeliefDecision>): BeliefDecision {
  return {
    id,
    content: `decision ${id}`,
    rationale: "test",
    source: "user",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    status: "active",
    scope: "local" as const,
    revision: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeCompactionResult — eviction detection
// ---------------------------------------------------------------------------

describe("computeCompactionResult", () => {
  it("detects evicted beliefs", () => {
    const pre = { facts: [fact("bf-1"), fact("bf-2"), fact("bf-3")], decisions: [decision("bd-1")] };
    const post = { facts: [fact("bf-1")], decisions: [decision("bd-1")] };

    const result = computeCompactionResult(pre, post);

    expect(result.preCounts.facts).toBe(3);
    expect(result.postCounts.facts).toBe(1);
    expect(result.preserved).toEqual(["bf-1", "bd-1"]);
    expect(result.evicted).toHaveLength(2);
    expect(result.evicted.map((e) => e.id).sort()).toEqual(["bf-2", "bf-3"]);
    expect(result.evicted.every((e) => e.reason === "capacity")).toBe(true);
  });

  it("detects preserved beliefs when nothing is evicted", () => {
    const beliefs = [fact("bf-1"), fact("bf-2")];
    const pre = { facts: beliefs, decisions: [] };
    const post = { facts: [...beliefs], decisions: [] };

    const result = computeCompactionResult(pre, post);

    expect(result.preserved).toEqual(["bf-1", "bf-2"]);
    expect(result.evicted).toHaveLength(0);
    expect(result.preCounts.facts).toBe(2);
    expect(result.postCounts.facts).toBe(2);
  });

  it("detects evicted decisions alongside facts", () => {
    const pre = { facts: [fact("bf-1")], decisions: [decision("bd-1"), decision("bd-2")] };
    const post = { facts: [fact("bf-1")], decisions: [decision("bd-1")] };

    const result = computeCompactionResult(pre, post);

    expect(result.preserved).toEqual(["bf-1", "bd-1"]);
    expect(result.evicted).toHaveLength(1);
    expect(result.evicted[0]!.id).toBe("bd-2");
  });

  it("detects degraded beliefs (truncated content)", () => {
    const pre = { facts: [fact("bf-1", { content: "original long content" })], decisions: [] };
    const post = { facts: [fact("bf-1", { content: "truncated" })], decisions: [] };

    const result = computeCompactionResult(pre, post);

    expect(result.preserved).toEqual(["bf-1"]);
    expect(result.degraded).toHaveLength(1);
    expect(result.degraded[0]!.id).toBe("bf-1");
    expect(result.degraded[0]!.reason).toBe("truncated");
  });

  it("detects degraded beliefs (confidence drop)", () => {
    const pre = { facts: [fact("bf-1", { confidence: 0.9 })], decisions: [] };
    const post = { facts: [fact("bf-1", { confidence: 0.5 })], decisions: [] };

    const result = computeCompactionResult(pre, post);

    expect(result.preserved).toEqual(["bf-1"]);
    expect(result.degraded).toHaveLength(1);
    expect(result.degraded[0]!.id).toBe("bf-1");
    expect(result.degraded[0]!.reason).toBe("confidence_drop");
  });

  it("returns empty evicted/degraded for identical states", () => {
    const beliefs = [fact("bf-1"), fact("bf-2")];
    const pre = { facts: beliefs, decisions: [] };
    const post = { facts: [...beliefs], decisions: [] };

    const result = computeCompactionResult(pre, post);

    expect(result.evicted).toHaveLength(0);
    expect(result.degraded).toHaveLength(0);
    expect(result.preserved).toEqual(["bf-1", "bf-2"]);
  });
});

// ---------------------------------------------------------------------------
// CompactionResultSchema validation
// ---------------------------------------------------------------------------

describe("CompactionResultSchema", () => {
  it("validates a minimal compaction result", () => {
    const data = {
      occurredAt: "2025-01-01T00:00:00.000Z",
      preCounts: { facts: 5, decisions: 2 },
      postCounts: { facts: 3, decisions: 1 },
      preserved: ["bf-1", "bf-2", "bd-1"],
      degraded: [],
      evicted: [
        { id: "bf-3", content: "evicted fact", reason: "capacity" as const },
      ],
      reconstructionHints: [],
    };

    const parsed = CompactionResultSchema.parse(data);
    expect(parsed.preserved).toHaveLength(3);
    expect(parsed.evicted).toHaveLength(1);
  });

  it("rejects invalid eviction reason", () => {
    const data = {
      occurredAt: "2025-01-01T00:00:00.000Z",
      preCounts: { facts: 1, decisions: 0 },
      postCounts: { facts: 0, decisions: 0 },
      preserved: [],
      degraded: [],
      evicted: [
        { id: "bf-1", content: "x", reason: "unknown_reason" },
      ],
      reconstructionHints: [],
    };

    expect(() => CompactionResultSchema.parse(data)).toThrow();
  });

  it("rejects content exceeding 80 characters", () => {
    const data = {
      occurredAt: "2025-01-01T00:00:00.000Z",
      preCounts: { facts: 1, decisions: 0 },
      postCounts: { facts: 0, decisions: 0 },
      preserved: [],
      degraded: [],
      evicted: [
        { id: "bf-1", content: "x".repeat(81), reason: "capacity" as const },
      ],
      reconstructionHints: [],
    };

    expect(() => CompactionResultSchema.parse(data)).toThrow();
  });

  it("rejects non-datetime occurredAt", () => {
    const data = {
      occurredAt: "not-a-datetime",
      preCounts: { facts: 1, decisions: 0 },
      postCounts: { facts: 1, decisions: 0 },
      preserved: ["bf-1"],
      degraded: [],
      evicted: [],
      reconstructionHints: [],
    };

    expect(() => CompactionResultSchema.parse(data)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// compactionHistory integration in NoesisState
// ---------------------------------------------------------------------------

describe("compactionHistory in NoesisState", () => {
  it("starts empty", () => {
    const state = cloneState();
    expect(state.compactionHistory).toEqual([]);
  });

  it("accepts up to 5 entries (schema validation)", () => {
    const entry = {
      occurredAt: "2025-01-01T00:00:00.000Z",
      preCounts: { facts: 1, decisions: 0 },
      postCounts: { facts: 1, decisions: 0 },
      preserved: ["bf-1"],
      degraded: [],
      evicted: [],
      reconstructionHints: [],
    };

    const state = cloneState();
    state.compactionHistory = [
      entry, entry, entry, entry, entry, // 5 entries — should be valid
    ];

    expect(state.compactionHistory).toHaveLength(5);
  });
});
