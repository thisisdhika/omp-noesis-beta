"use strict";

/**
 * Unit tests for graphify-parser edge cases — uncovered confidence fallback,
 * object edges/links, findings shape, and degenerate inputs.
 */

import { describe, it, expect } from "bun:test";
import { parseQueryOutput } from "../../../src/infrastructure/graphify-parser.js";

// ============================================================================
// Tests
// ============================================================================

describe("graphify-parser edge cases", () => {
  describe("toGraphConfidence fallback (via parseQueryOutput)", () => {
    it("should return AMBIGUOUS for unrecognized confidence string", () => {
      const findings = parseQueryOutput(
        JSON.stringify({
          results: [{ nodes: ["A"], query: "q", confidence: "UNKNOWN" }],
        }),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.confidence).toBe("AMBIGUOUS");
    });

    it("should return AMBIGUOUS when confidence field is missing", () => {
      const findings = parseQueryOutput(
        JSON.stringify({
          results: [{ nodes: ["A"], query: "q" }],
        }),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.confidence).toBe("AMBIGUOUS");
    });

    it("should return AMBIGUOUS when confidence is null", () => {
      const findings = parseQueryOutput(
        JSON.stringify({
          results: [{ nodes: ["A"], query: "q", confidence: null }],
        }),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.confidence).toBe("AMBIGUOUS");
    });
  });

  describe("extractRelations edge cases (via parseQueryOutput)", () => {
    it("should handle edges as objects with source/target", () => {
      const findings = parseQueryOutput(
        JSON.stringify({
          results: [
            {
              nodes: ["A", "B"],
              query: "q",
              confidence: "EXTRACTED",
              edges: [
                { source: "A", target: "B" },
                { source: "C" },
                { target: "D" },
                "direct-edge",
              ],
            },
          ],
        }),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.relations).toEqual(["A→B", "C→?", "?→D", "direct-edge"]);
    });

    it("should handle links as objects with source/target", () => {
      const findings = parseQueryOutput(
        JSON.stringify({
          results: [
            {
              nodes: ["X", "Y"],
              query: "q",
              confidence: "EXTRACTED",
              links: [
                { source: "X", target: "Y" },
                { source: "Z" },
                "bare-link",
              ],
            },
          ],
        }),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.relations).toEqual(["X→Y", "Z→?", "bare-link"]);
    });

    it("should handle relations as string array", () => {
      const findings = parseQueryOutput(
        JSON.stringify({
          results: [
            {
              nodes: ["A"],
              query: "q",
              confidence: "EXTRACTED",
              relations: ["A→B", "B→C"],
            },
          ],
        }),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.relations).toEqual(["A→B", "B→C"]);
    });

    it("should return empty relations when no edges, links, or relations present", () => {
      const findings = parseQueryOutput(
        JSON.stringify({
          results: [{ nodes: ["A"], query: "q", confidence: "EXTRACTED" }],
        }),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.relations).toEqual([]);
    });

    it("should return empty nodes when nodes field is missing", () => {
      const findings = parseQueryOutput(
        JSON.stringify({
          results: [{ query: "q", confidence: "EXTRACTED" }],
        }),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.nodes).toEqual([]);
    });
  });

  describe("parseQueryOutput with findings shape", () => {
    it("should parse findings array with top-level query as fallback", () => {
      const findings = parseQueryOutput(
        JSON.stringify({
          query: "top-query",
          findings: [
            { nodes: ["A", "B"], confidence: "EXTRACTED" },
            { nodes: ["C"], confidence: "INFERRED", query: "override" },
          ],
        }),
      );
      expect(findings).toHaveLength(2);
      expect(findings[0]!.query).toBe("top-query");
      expect(findings[1]!.query).toBe("override");
    });

    it("should handle findings with null top-level query", () => {
      const findings = parseQueryOutput(
        JSON.stringify({
          query: null,
          findings: [{ nodes: ["A"], confidence: "EXTRACTED" }],
        }),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.query).toBe("");
    });

    it("should filter out non-object items in findings array", () => {
      const findings = parseQueryOutput(
        JSON.stringify({
          findings: [
            { nodes: ["A"], confidence: "EXTRACTED" },
            null,
            "string",
            42,
          ],
        }),
      );
      expect(findings).toHaveLength(1);
    });

    it("should handle empty findings array", () => {
      const findings = parseQueryOutput(
        JSON.stringify({ query: "q", findings: [] }),
      );
      expect(findings).toHaveLength(0);
    });
  });

  describe("parseQueryOutput optional fields", () => {
    it("should extract inferredConfidence when present and valid", () => {
      const findings = parseQueryOutput(
        JSON.stringify({
          findings: [{ nodes: ["A"], confidence: "INFERRED", inferredConfidence: 0.85 }],
        }),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.inferredConfidence).toBe(0.85);
    });

    it("should omit inferredConfidence when out of range", () => {
      const findings = parseQueryOutput(
        JSON.stringify({
          findings: [{ nodes: ["A"], confidence: "INFERRED", inferredConfidence: 0.3 }],
        }),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.inferredConfidence).toBeUndefined();
    });

    it("should extract community when present", () => {
      const findings = parseQueryOutput(
        JSON.stringify({
          findings: [{ nodes: ["A"], confidence: "EXTRACTED", community: "auth-module" }],
        }),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.community).toBe("auth-module");
    });

    it("should extract godNodes when present", () => {
      const findings = parseQueryOutput(
        JSON.stringify({
          findings: [{ nodes: ["A"], confidence: "EXTRACTED", godNodes: ["config.ts", "index.ts"] }],
        }),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.godNodes).toEqual(["config.ts", "index.ts"]);
    });

    it("should filter non-string godNodes", () => {
      const findings = parseQueryOutput(
        JSON.stringify({
          findings: [{ nodes: ["A"], confidence: "EXTRACTED", godNodes: ["config.ts", null, 42] }],
        }),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.godNodes).toEqual(["config.ts"]);
    });

    it("should extract surprisingConnections when present", () => {
      const findings = parseQueryOutput(
        JSON.stringify({
          findings: [{ nodes: ["A"], confidence: "INFERRED", surprisingConnections: ["deploy.ts"] }],
        }),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.surprisingConnections).toEqual(["deploy.ts"]);
    });

    it("should extract rawOutput when present", () => {
      const findings = parseQueryOutput(
        JSON.stringify({
          findings: [{ nodes: ["A"], confidence: "EXTRACTED", rawOutput: "raw text" }],
        }),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.rawOutput).toBe("raw text");
    });

    it("should omit all optional fields when not present", () => {
      const findings = parseQueryOutput(
        JSON.stringify({
          findings: [{ nodes: ["A"], confidence: "EXTRACTED" }],
        }),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.inferredConfidence).toBeUndefined();
      expect(findings[0]!.community).toBeUndefined();
      expect(findings[0]!.godNodes).toBeUndefined();
      expect(findings[0]!.surprisingConnections).toBeUndefined();
      expect(findings[0]!.rawOutput).toBeUndefined();
    });
  });

  describe("parseQueryOutput degenerate inputs", () => {
    it("should return empty array when results is not an array", () => {
      const findings = parseQueryOutput(
        JSON.stringify({ results: "not-an-array" }),
      );
      expect(findings).toHaveLength(0);
    });

    it("should return empty array when neither results nor findings is an array", () => {
      const findings = parseQueryOutput(
        JSON.stringify({}),
      );
      expect(findings).toHaveLength(0);
    });

    it("should return empty array for empty results", () => {
      const findings = parseQueryOutput(
        JSON.stringify({ results: [] }),
      );
      expect(findings).toHaveLength(0);
    });

    it("should filter out non-object items in results array", () => {
      const findings = parseQueryOutput(
        JSON.stringify({
          results: [
            { nodes: ["A"], query: "a", confidence: "EXTRACTED" },
            null,
            "string",
            42,
            { nodes: ["B"], query: "b", confidence: "INFERRED" },
          ],
        }),
      );
      expect(findings).toHaveLength(2);
    });

    it("should return empty array for non-object parsed JSON", () => {
      expect(parseQueryOutput("null")).toHaveLength(0);
      expect(parseQueryOutput('"string"')).toHaveLength(0);
      expect(parseQueryOutput("42")).toHaveLength(0);
      expect(parseQueryOutput("true")).toHaveLength(0);
    });

    it("should return empty array for malformed JSON", () => {
      expect(parseQueryOutput("not json{{{")).toHaveLength(0);
    });

    it("should return empty array for empty string", () => {
      expect(parseQueryOutput("")).toHaveLength(0);
    });
  });
});
