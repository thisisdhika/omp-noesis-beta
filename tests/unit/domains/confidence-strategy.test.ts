"use strict";

/**
 * omp-noesis: Confidence Strategy Unit Tests
 *
 * Tests for mapGraphConfidence.
 */

import { describe, it, expect } from "bun:test";
import { mapGraphConfidence } from "../../../src/domains/belief/confidence-strategy.js";
import type { GraphFinding } from "../../../src/shared/schema.js";

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
