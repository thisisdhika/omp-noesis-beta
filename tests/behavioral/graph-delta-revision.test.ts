"use strict";

/**
 * Graph Delta & Belief Revision Tests
 * Tests the graphify → belief revision pipeline: delta computation,
 * orphan detection, epistemic status demotion, and the reconcile use case.
 */

import { describe, it, expect } from "bun:test";
import { cloneState, sampleFact } from "../helpers/fixtures.js";
import { computeGraphDelta, loadGraphSnapshot, saveGraphSnapshot } from "../../src/infrastructure/graphify-delta.js";
import type { GraphDelta } from "../../src/infrastructure/graphify-delta.js";
import { findOrphanedBeliefs, demoteStatus, invalidateOrphanedBeliefs } from "../../src/domains/belief/grounding-strategy.js";
import type { EpistemicStatus, BeliefFact } from "../../src/domains/belief/schema.js";
import { now } from "../../src/shared/time.js";
import { generateId } from "../../src/shared/schema.js";

// ============================================================================
// HELPERS
// ============================================================================

function groundedFact(overrides: Partial<BeliefFact> & { groundingNode: string }): BeliefFact {
  return {
    ...sampleFact({ epistemicStatus: "speculative" }),
    grounding: [{
      graphNodeId: overrides.groundingNode,
      relation: "derived_from",
      extractedAt: now(),
    }],
    ...overrides,
  } as BeliefFact;
}

// ============================================================================
// GRAPH DELTA
// ============================================================================

describe("computeGraphDelta", () => {
  it("detects additions when nodes appear", () => {
    const prev: string[] = [];
    const curr = ["n1", "n2"];

    const delta = computeGraphDelta(prev, curr);

    expect(delta.added).toEqual(["n1", "n2"]);
    expect(delta.removed).toEqual([]);
    expect(delta.snapshotId).toMatch(/^snap-/);
    expect(delta.computedAt).toBeTruthy();
  });

  it("detects removals when nodes disappear", () => {
    const prev = ["n1", "n2", "n3"];
    const curr = ["n1"];

    const delta = computeGraphDelta(prev, curr);

    expect(delta.added).toEqual([]);
    expect(delta.removed).toEqual(["n2", "n3"]);
  });

  it("detects both additions and removals", () => {
    const prev = ["n1", "n2"];
    const curr = ["n2", "n3"];

    const delta = computeGraphDelta(prev, curr);

    expect(delta.added).toEqual(["n3"]);
    expect(delta.removed).toEqual(["n1"]);
  });

  it("returns empty delta when nothing changed", () => {
    const nodes = ["n1", "n2", "n3"];

    const delta = computeGraphDelta(nodes, nodes);

    expect(delta.added).toEqual([]);
    expect(delta.removed).toEqual([]);
  });

  it("handles duplicate IDs by collapsing them", () => {
    const prev = ["n1", "n1"];
    const curr = ["n1", "n2"];

    const delta = computeGraphDelta(prev, curr);

    expect(delta.added).toEqual(["n2"]);
    expect(delta.removed).toEqual([]);
  });
});

// ============================================================================
// SNAPSHOT PERSISTENCE
// ============================================================================

describe("graph snapshot persistence", () => {
  it("saveGraphSnapshot stores nodes on state", () => {
    const state: { _lastGraphSnapshot?: string[] } = {};
    saveGraphSnapshot(state, ["n1", "n2"]);

    expect(state._lastGraphSnapshot).toEqual(["n1", "n2"]);
  });

  it("loadGraphSnapshot returns null when no snapshot saved", () => {
    const state: { _lastGraphSnapshot?: string[] } = {};

    const result = loadGraphSnapshot(state);

    expect(result).toBeNull();
  });

  it("loadGraphSnapshot returns saved nodes", () => {
    const state: { _lastGraphSnapshot?: string[] } = { _lastGraphSnapshot: ["n1", "n2"] };

    const result = loadGraphSnapshot(state);

    expect(result).toEqual(["n1", "n2"]);
  });

  it("loadGraphSnapshot returns a copy (not reference)", () => {
    const nodes = ["n1", "n2"];
    const state: { _lastGraphSnapshot?: string[] } = { _lastGraphSnapshot: nodes };

    const result = loadGraphSnapshot(state)!;
    result.push("n3");

    expect(state._lastGraphSnapshot).toEqual(["n1", "n2"]);
  });
});

// ============================================================================
// EPISTEMIC STATUS DEMOTION
// ============================================================================

describe("demoteStatus", () => {
  const cases: [EpistemicStatus, EpistemicStatus][] = [
    ["certain", "probable"],
    ["probable", "speculative"],
    ["speculative", "speculative"],
    ["deprecated", "deprecated"],
    ["contradicted", "contradicted"],
  ];

  for (const [input, expected] of cases) {
    it(`demotes ${input} → ${expected}`, () => {
      expect(demoteStatus(input)).toBe(expected);
    });
  }
});

// ============================================================================
// ORPHAN DETECTION
// ============================================================================

describe("findOrphanedBeliefs", () => {
  it("finds beliefs whose grounding references a removed node", () => {
    const beliefs: BeliefFact[] = [
      groundedFact({ content: "A", groundingNode: "n1" }),
      groundedFact({ content: "B", groundingNode: "n2" }),
    ];

    const delta: GraphDelta = {
      added: [],
      removed: ["n1"],
      snapshotId: "snap-1",
      computedAt: now(),
    };

    const orphaned = findOrphanedBeliefs(beliefs, delta);

    expect(orphaned).toHaveLength(1);
    expect(orphaned[0]!.content).toBe("A");
  });

  it("finds multiple orphaned beliefs", () => {
    const beliefs: BeliefFact[] = [
      groundedFact({ content: "A", groundingNode: "n1" }),
      groundedFact({ content: "B", groundingNode: "n2" }),
      groundedFact({ content: "C", groundingNode: "n3" }),
    ];

    const delta: GraphDelta = {
      added: ["n4"],
      removed: ["n1", "n3"],
      snapshotId: "snap-1",
      computedAt: now(),
    };

    const orphaned = findOrphanedBeliefs(beliefs, delta);

    expect(orphaned).toHaveLength(2);
    expect(orphaned.map((b) => b.content).sort()).toEqual(["A", "C"]);
  });

  it("returns empty when no beliefs have grounding in removed nodes", () => {
    const beliefs: BeliefFact[] = [
      groundedFact({ content: "A", groundingNode: "n1" }),
    ];

    const delta: GraphDelta = {
      added: [],
      removed: ["n2"],
      snapshotId: "snap-1",
      computedAt: now(),
    };

    const orphaned = findOrphanedBeliefs(beliefs, delta);

    expect(orphaned).toHaveLength(0);
  });

  it("returns empty when beliefs have no grounding at all", () => {
    const beliefs: BeliefFact[] = [sampleFact()];

    const delta: GraphDelta = {
      added: [],
      removed: ["n1"],
      snapshotId: "snap-1",
      computedAt: now(),
    };

    const orphaned = findOrphanedBeliefs(beliefs, delta);

    expect(orphaned).toHaveLength(0);
  });

  it("returns empty for empty delta removals", () => {
    const beliefs: BeliefFact[] = [
      groundedFact({ content: "A", groundingNode: "n1" }),
    ];

    const delta: GraphDelta = {
      added: ["n2"],
      removed: [],
      snapshotId: "snap-1",
      computedAt: now(),
    };

    const orphaned = findOrphanedBeliefs(beliefs, delta);

    expect(orphaned).toHaveLength(0);
  });
});

// ============================================================================
// BULK INVALIDATION
// ============================================================================

describe("invalidateOrphanedBeliefs", () => {
  it("demotes epistemicStatus and reduces confidence for orphaned beliefs", () => {
    const state = cloneState();
    state.belief.facts.push(
      groundedFact({ id: generateId("bf"), content: "A", confidence: 0.9, epistemicStatus: "certain", groundingNode: "n1" }),
      groundedFact({ id: generateId("bf"), content: "B", confidence: 0.8, epistemicStatus: "probable", groundingNode: "n2" }),
    );

    const delta: GraphDelta = {
      added: [],
      removed: ["n1"],
      snapshotId: "snap-1",
      computedAt: now(),
    };

    const count = invalidateOrphanedBeliefs(state, delta);

    expect(count).toBe(1);
    expect(state.belief.facts[0]!.epistemicStatus).toBe("probable");
    expect(state.belief.facts[0]!.confidence).toBeCloseTo(0.75);
    expect(state.belief.facts[0]!.evidence).toContain("Grounding graph node removed");
  });

  it("clamps confidence at 0.55 minimum", () => {
    const state = cloneState();
    state.belief.facts.push(
      groundedFact({ id: generateId("bf"), content: "Low conf", confidence: 0.5, epistemicStatus: "probable", groundingNode: "n1" }),
    );

    const delta: GraphDelta = {
      added: [],
      removed: ["n1"],
      snapshotId: "snap-1",
      computedAt: now(),
    };

    invalidateOrphanedBeliefs(state, delta);

    // 0.5 - 0.15 = 0.35, clamped to 0.55
    expect(state.belief.facts[0]!.confidence).toBeCloseTo(0.55);
  });

  it("appends warning to existing evidence", () => {
    const state = cloneState();
    state.belief.facts.push(
      groundedFact({
        id: generateId("bf"),
        content: "With evidence",
        evidence: "Original evidence",
        confidence: 0.9,
        epistemicStatus: "certain",
        groundingNode: "n1",
      }),
    );

    const delta: GraphDelta = {
      added: [],
      removed: ["n1"],
      snapshotId: "snap-1",
      computedAt: now(),
    };

    invalidateOrphanedBeliefs(state, delta);

    expect(state.belief.facts[0]!.evidence).toContain("Original evidence");
    expect(state.belief.facts[0]!.evidence).toContain("Grounding graph node removed");
  });

  it("returns 0 when delta has no removals", () => {
    const state = cloneState();
    state.belief.facts.push(
      groundedFact({ id: generateId("bf"), content: "A", groundingNode: "n1" }),
    );

    const delta: GraphDelta = {
      added: ["n2"],
      removed: [],
      snapshotId: "snap-1",
      computedAt: now(),
    };

    const count = invalidateOrphanedBeliefs(state, delta);

    expect(count).toBe(0);
    expect(state.belief.facts[0]!.epistemicStatus).toBe("speculative");
    expect(state.belief.facts[0]!.confidence).toBeCloseTo(0.8);
  });
});
