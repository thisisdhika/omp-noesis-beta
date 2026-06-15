"use strict";

/**
 * Integration test: Graphify client, parser, and engine.
 */
import { describe, it, expect } from "bun:test";
import { parseQueryOutput } from "../../src/infrastructure/graphify-parser.js";
import { enrichFindings, toBeliefCandidates } from "../../src/infrastructure/graphify-engine.js";
import type { GraphFinding } from "../../src/schema.js";

describe("Graphify Integration", () => {
  describe("graphify-parser", () => {
    it("parses valid JSON with results array", () => {
      const raw = JSON.stringify({
        results: [
          {
            query: "What is StateManager?",
            nodes: ["StateManager", "NoesisState"],
            relations: ["manages"],
            confidence: "EXTRACTED",
          },
        ],
      });
      const findings = parseQueryOutput(raw);
      expect(findings.length).toBe(1);
      expect(findings[0]!.query).toBe("What is StateManager?");
      expect(findings[0]!.nodes).toEqual(["StateManager", "NoesisState"]);
      expect(findings[0]!.confidence).toBe("EXTRACTED");
    });

    it("parses valid JSON with edges key (legacy)", () => {
      const raw = JSON.stringify({
        results: [
          {
            query: "test",
            nodes: ["A", "B"],
            edges: ["A->B"],
            confidence: "INFERRED",
          },
        ],
      });
      const findings = parseQueryOutput(raw);
      expect(findings.length).toBe(1);
      expect(findings[0]!.relations).toEqual(["A->B"]);
      expect(findings[0]!.confidence).toBe("INFERRED");
    });

    it("parses valid JSON with links key (legacy)", () => {
      const raw = JSON.stringify({
        results: [
          {
            query: "test",
            nodes: ["X"],
            links: ["X->Y"],
            confidence: "AMBIGUOUS",
          },
        ],
      });
      const findings = parseQueryOutput(raw);
      expect(findings.length).toBe(1);
      expect(findings[0]!.relations).toEqual(["X->Y"]);
      expect(findings[0]!.confidence).toBe("AMBIGUOUS");
    });

    it("returns empty array for invalid JSON", () => {
      const findings = parseQueryOutput("not json at all");
      expect(findings).toEqual([]);
    });

    it("returns empty array for empty string", () => {
      const findings = parseQueryOutput("");
      expect(findings).toEqual([]);
    });

    it("stamps timestamp on each finding", () => {
      const raw = JSON.stringify({
        results: [{ query: "test", nodes: ["A"], relations: [], confidence: "EXTRACTED" }],
      });
      const findings = parseQueryOutput(raw);
      expect(findings[0]!.timestamp).toBeDefined();
      expect(() => new Date(findings[0]!.timestamp)).not.toThrow();
    });
  });

  describe("graphify-engine", () => {
    const sampleFindings: GraphFinding[] = [
      {
        query: "How does caching work?",
        nodes: ["Cache", "Store"],
        relations: ["uses"],
        confidence: "EXTRACTED",
        inferredConfidence: 0.9,
        timestamp: new Date().toISOString(),
      },
      {
        query: "What triggers eviction?",
        nodes: ["Eviction", "Timer"],
        relations: ["triggers"],
        confidence: "INFERRED",
        timestamp: new Date().toISOString(),
      },
    ];

    it("enrichFindings adds inferredConfidence", () => {
      const enriched = enrichFindings([
        {
          query: "test",
          nodes: ["A"],
          relations: [],
          confidence: "EXTRACTED",
          timestamp: new Date().toISOString(),
        },
      ]);
      expect(enriched[0]!.inferredConfidence).toBeDefined();
      // EXTRACTED maps to 0.9
      expect(enriched[0]!.inferredConfidence).toBe(0.9);
    });

    it("toBeliefCandidates converts findings above threshold", () => {
      const candidates = toBeliefCandidates(sampleFindings, 0.7);
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0]!.source).toBe("graph");
      expect(candidates[0]!.content).toBe("How does caching work?");
    });

    it("toBeliefCandidates filters below threshold", () => {
      const candidates = toBeliefCandidates(sampleFindings, 0.95);
      expect(candidates.length).toBe(0);
    });
  });

  describe("checkGraphifyCLI", () => {
    it("returns installed status without throwing", async () => {
      const { checkGraphifyCLI } = await import("../../src/infrastructure/graphify-setup.js");
      const result = await checkGraphifyCLI();
      expect(result).toHaveProperty("installed");
      expect(typeof result.installed).toBe("boolean");
    });
  });
});
