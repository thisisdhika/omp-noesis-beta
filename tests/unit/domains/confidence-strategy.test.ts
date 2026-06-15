"use strict";

/**
 * omp-noesis: Confidence Strategy Unit Tests
 *
 * Tests for mapGraphConfidence and applyStalePenalty.
 */

import { describe, it, expect } from "bun:test";
import { mapGraphConfidence, applyStalePenalty } from "../../../src/domains/belief/confidence-strategy.js";
import type { GraphFinding, BeliefFact } from "../../../src/schema.js";
import { now } from "../../../src/shared/time.js";
import { OLD_TIMESTAMP } from "../../helpers/fixtures.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


function makeFinding(overrides?: Partial<GraphFinding>): GraphFinding {
  return {
    query: "test query",
    nodes: [],
    relations: [],
    confidence: "EXTRACTED",
    timestamp: "2025-01-01T00:00:00.000Z",
    ...overrides,
  } as GraphFinding;
}

function makeFact(overrides?: Partial<BeliefFact>): BeliefFact {
  const ts = now();
  return {
    id: "bf-test-001",
    content: "test fact",
    confidence: 0.8,
    source: "graph",
    createdAt: ts,
    updatedAt: ts,
    status: "active",
    ...overrides,
  } as BeliefFact;
}

// ---------------------------------------------------------------------------
// mapGraphConfidence
// ---------------------------------------------------------------------------

describe("mapGraphConfidence", () => {
  it("maps EXTRACTED to 1.0", () => {
    const finding = makeFinding({ confidence: "EXTRACTED" });
    expect(mapGraphConfidence(finding)).toBe(1.0);
  });

  it("maps INFERRED to 0.7", () => {
    const finding = makeFinding({ confidence: "INFERRED" });
    expect(mapGraphConfidence(finding)).toBe(0.7);
  });

  it("maps AMBIGUOUS to 0.55", () => {
    const finding = makeFinding({ confidence: "AMBIGUOUS" });
    expect(mapGraphConfidence(finding)).toBe(0.55);
  });

  it("uses Math.max when inferredConfidence is higher than mapping", () => {
    const finding = makeFinding({ confidence: "INFERRED", inferredConfidence: 0.9 });
    expect(mapGraphConfidence(finding)).toBe(0.9);
  });

  it("keeps mapping value when inferredConfidence is lower", () => {
    const finding = makeFinding({ confidence: "EXTRACTED", inferredConfidence: 0.6 });
    expect(mapGraphConfidence(finding)).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// applyStalePenalty
// ---------------------------------------------------------------------------

describe("applyStalePenalty", () => {
  it("returns confidence unchanged when staleHours is undefined", () => {
    const fact = makeFact({ confidence: 0.7 });
    expect(applyStalePenalty(fact, undefined)).toBe(0.7);
  });

  it("applies no penalty when fact was updated recently", () => {
    const fact = makeFact({ confidence: 0.9, updatedAt: now() });
    // Use a generous staleHours so now() is within threshold
    expect(applyStalePenalty(fact, 720)).toBe(0.9);
  });

  it("reduces confidence by 0.10 when fact is older than staleHours", () => {
    const fact = makeFact({ confidence: 0.8, updatedAt: OLD_TIMESTAMP });
    expect(applyStalePenalty(fact, 1)).toBeCloseTo(0.70, 5);
  });

  it("floors stale penalty at 0.55", () => {
    const fact = makeFact({ confidence: 0, updatedAt: OLD_TIMESTAMP });
    expect(applyStalePenalty(fact, 1)).toBe(0.55);
  });

  it("clamps result to 1 when adjusted value exceeds max", () => {
    const fact = makeFact({ confidence: 1.2, updatedAt: OLD_TIMESTAMP });
    const result = applyStalePenalty(fact, 1);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });
});
