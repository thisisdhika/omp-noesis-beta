import { describe, it, expect } from "vitest";
import { translateGraphConfidence, applyStalePenalty, isPreambleEligible } from "../../src/domains/belief/confidence-strategy.js";
import type { BeliefFact } from "../../src/schema.js";

describe("confidence-strategy contracts", () => {
  describe("translateGraphConfidence", () => {
    it("EXTRACTED returns 1.0", () => {
      expect(translateGraphConfidence("EXTRACTED")).toBe(1.0);
    });

    it("INFERRED with valid tier value returns that value", () => {
      expect(translateGraphConfidence("INFERRED", 0.55)).toBe(0.55);
      expect(translateGraphConfidence("INFERRED", 0.65)).toBe(0.65);
      expect(translateGraphConfidence("INFERRED", 0.75)).toBe(0.75);
      expect(translateGraphConfidence("INFERRED", 0.85)).toBe(0.85);
      expect(translateGraphConfidence("INFERRED", 0.95)).toBe(0.95);
    });

    it("INFERRED with invalid value returns null", () => {
      expect(translateGraphConfidence("INFERRED", 0.5)).toBeNull();
      expect(translateGraphConfidence("INFERRED", 0.7)).toBeNull();
      expect(translateGraphConfidence("INFERRED", 1.0)).toBeNull();
      expect(translateGraphConfidence("INFERRED", undefined)).toBeNull();
    });

    it("AMBIGUOUS returns null", () => {
      expect(translateGraphConfidence("AMBIGUOUS")).toBeNull();
      expect(translateGraphConfidence("AMBIGUOUS", 0.8)).toBeNull();
    });

    it("unknown label returns null", () => {
      expect(translateGraphConfidence("UNKNOWN")).toBeNull();
      expect(translateGraphConfidence("")).toBeNull();
    });
  });

  describe("applyStalePenalty", () => {
    it("high confidence tiers are mapped down", () => {
      expect(applyStalePenalty(1.0)).toBe(1.0);
      expect(applyStalePenalty(0.95)).toBe(0.85);
      expect(applyStalePenalty(0.85)).toBe(0.75);
      expect(applyStalePenalty(0.75)).toBe(0.65);
      expect(applyStalePenalty(0.65)).toBe(0.55);
      expect(applyStalePenalty(0.55)).toBe(0.55);
    });

    it("below lowest tier maps to 0.55", () => {
      expect(applyStalePenalty(0.5)).toBe(0.55);
      expect(applyStalePenalty(0.0)).toBe(0.55);
    });

    it("boundary: 1.0 returns 1.0", () => {
      expect(applyStalePenalty(1.0)).toBe(1.0);
    });
  });

  describe("isPreambleEligible", () => {
    const activeHigh: BeliefFact = {
      id: "bf-1",
      content: "test",
      confidence: 0.9,
      source: "execution",
      status: "active",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };

    it("active fact with confidence >= 0.75 is eligible", () => {
      expect(isPreambleEligible(activeHigh)).toBe(true);
    });

    it("active fact with confidence < 0.75 is not eligible", () => {
      const low: BeliefFact = { ...activeHigh, confidence: 0.5 };
      expect(isPreambleEligible(low)).toBe(false);
    });

    it("superseded fact is not eligible regardless of confidence", () => {
      const superseded: BeliefFact = { ...activeHigh, status: "superseded" };
      expect(isPreambleEligible(superseded)).toBe(false);
    });

    it("archived fact is not eligible", () => {
      const archived: BeliefFact = { ...activeHigh, status: "archived" };
      expect(isPreambleEligible(archived)).toBe(false);
    });

    it("boundary: confidence exactly 0.75 is eligible", () => {
      const boundary: BeliefFact = { ...activeHigh, confidence: 0.75 };
      expect(isPreambleEligible(boundary)).toBe(true);
    });

    it("boundary: confidence 0.74 is not eligible", () => {
      const below: BeliefFact = { ...activeHigh, confidence: 0.74 };
      expect(isPreambleEligible(below)).toBe(false);
    });
  });
});
