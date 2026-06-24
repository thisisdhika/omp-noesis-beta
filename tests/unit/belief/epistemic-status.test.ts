"use strict";

/**
 * Unit tests for Epistemic Status Tags (Recommendation 1).
 *
 * Tests classifyEpistemicStatus, demoteOnContradiction, and schema validation.
 */

import { describe, it, expect } from "bun:test";
import {
  classifyEpistemicStatus,
  demoteOnContradiction,
} from "../../../src/domains/belief/epistemic-strategy.js";
import {
  EpistemicStatusSchema,
  BeliefFactSchema,
  type BeliefFact,
} from "../../../src/domains/belief/schema.js";

// ---------------------------------------------------------------------------
// classifyEpistemicStatus — source × confidence combinations
// ---------------------------------------------------------------------------

describe("classifyEpistemicStatus", () => {
  describe("graph source", () => {
    it("returns certain when confidence >= 0.9", () => {
      expect(classifyEpistemicStatus({ confidence: 0.95, source: "graph" })).toBe("certain");
      expect(classifyEpistemicStatus({ confidence: 0.9, source: "graph" })).toBe("certain");
    });

    it("returns probable when confidence >= 0.7 and < 0.9", () => {
      expect(classifyEpistemicStatus({ confidence: 0.8, source: "graph" })).toBe("probable");
      expect(classifyEpistemicStatus({ confidence: 0.7, source: "graph" })).toBe("probable");
    });

    it("returns speculative when confidence < 0.7", () => {
      expect(classifyEpistemicStatus({ confidence: 0.69, source: "graph" })).toBe("speculative");
      expect(classifyEpistemicStatus({ confidence: 0.5, source: "graph" })).toBe("speculative");
    });
  });

  describe("user source", () => {
    it("returns certain when confidence >= 0.9", () => {
      expect(classifyEpistemicStatus({ confidence: 0.95, source: "user" })).toBe("certain");
    });

    it("returns probable when confidence >= 0.7 and < 0.9", () => {
      expect(classifyEpistemicStatus({ confidence: 0.8, source: "user" })).toBe("probable");
    });

    it("returns speculative when confidence < 0.7", () => {
      expect(classifyEpistemicStatus({ confidence: 0.6, source: "user" })).toBe("speculative");
    });
  });

  describe("execution source", () => {
    it("always returns certain regardless of confidence", () => {
      expect(classifyEpistemicStatus({ confidence: 1.0, source: "execution" })).toBe("certain");
      expect(classifyEpistemicStatus({ confidence: 0.5, source: "execution" })).toBe("certain");
      expect(classifyEpistemicStatus({ confidence: 0.1, source: "execution" })).toBe("certain");
    });
  });

  describe("inference source", () => {
    it("returns probable when confidence >= 0.75", () => {
      expect(classifyEpistemicStatus({ confidence: 0.9, source: "inference" })).toBe("probable");
      expect(classifyEpistemicStatus({ confidence: 0.75, source: "inference" })).toBe("probable");
    });

    it("returns speculative when confidence < 0.75", () => {
      expect(classifyEpistemicStatus({ confidence: 0.74, source: "inference" })).toBe("speculative");
      expect(classifyEpistemicStatus({ confidence: 0.5, source: "inference" })).toBe("speculative");
    });
  });

  describe("default fallback", () => {
    it("returns speculative for unknown source combinations", () => {
      // inference with very low confidence
      expect(classifyEpistemicStatus({ confidence: 0.1, source: "inference" })).toBe("speculative");
    });
  });
});

// ---------------------------------------------------------------------------
// demoteOnContradiction
// ---------------------------------------------------------------------------

describe("demoteOnContradiction", () => {
  function makeFact(epistemicStatus: string): BeliefFact {
    return {
      id: "bf-test-1",
      content: "test fact",
      confidence: 0.9,
      source: "user",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      status: "active",
      epistemicStatus,
    } as BeliefFact;
  }

  it("demotes certain to probable", () => {
    expect(demoteOnContradiction(makeFact("certain"))).toBe("probable");
  });

  it("demotes probable to speculative", () => {
    expect(demoteOnContradiction(makeFact("probable"))).toBe("speculative");
  });

  it("leaves speculative unchanged", () => {
    expect(demoteOnContradiction(makeFact("speculative"))).toBe("speculative");
  });

  it("leaves deprecated unchanged", () => {
    expect(demoteOnContradiction(makeFact("deprecated"))).toBe("deprecated");
  });

  it("leaves contradicted unchanged", () => {
    expect(demoteOnContradiction(makeFact("contradicted"))).toBe("contradicted");
  });
});

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe("EpistemicStatusSchema", () => {
  it("accepts all five valid statuses", () => {
    for (const status of ["certain", "probable", "speculative", "deprecated", "contradicted"] as const) {
      expect(EpistemicStatusSchema.parse(status)).toBe(status);
    }
  });

  it("rejects invalid statuses", () => {
    expect(() => EpistemicStatusSchema.parse("unknown")).toThrow();
    expect(() => EpistemicStatusSchema.parse("confirmed")).toThrow();
    expect(() => EpistemicStatusSchema.parse("")).toThrow();
  });
});

describe("BeliefFactSchema epistemicStatus field", () => {
  const validFact = {
    id: "bf-test-1",
    content: "test fact",
    confidence: 0.9,
    source: "user",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    status: "active",
  };

  it("defaults to speculative when not provided", () => {
    const parsed = BeliefFactSchema.parse(validFact);
    expect(parsed.epistemicStatus).toBe("speculative");
  });

  it("accepts explicit epistemicStatus", () => {
    const parsed = BeliefFactSchema.parse({ ...validFact, epistemicStatus: "certain" });
    expect(parsed.epistemicStatus).toBe("certain");
  });

  it("rejects invalid epistemicStatus", () => {
    expect(() =>
      BeliefFactSchema.parse({ ...validFact, epistemicStatus: "invalid" })
    ).toThrow();
  });

  it("accepts grounding with max 10 entries", () => {
    const grounding = Array.from({ length: 10 }, (_, i) => ({
      graphNodeId: `node-${i}`,
      relation: "references",
      extractedAt: "2025-01-01T00:00:00.000Z",
    }));
    const parsed = BeliefFactSchema.parse({ ...validFact, grounding });
    expect(parsed.grounding).toHaveLength(10);
  });

  it("rejects grounding with more than 10 entries", () => {
    const grounding = Array.from({ length: 11 }, (_, i) => ({
      graphNodeId: `node-${i}`,
      relation: "references",
      extractedAt: "2025-01-01T00:00:00.000Z",
    }));
    expect(() =>
      BeliefFactSchema.parse({ ...validFact, grounding })
    ).toThrow();
  });
});
