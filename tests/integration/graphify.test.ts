"use strict";

/**
 * Integration test: Graphify client, parser, and engine.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseQueryOutput } from "../../src/infrastructure/graphify-parser.js";
import { enrichFindings, toBeliefCandidates } from "../../src/infrastructure/graphify-engine.js";
import { detectCapability, query, build } from "../../src/infrastructure/graphify-client.js";
import { checkGraphifyCLI, runGraphifyBuild } from "../../src/infrastructure/graphify-setup.js";
import type { GraphFinding, CapabilityLevel } from "../../src/schema.js";
import { createTempDir } from "../helpers/temp-dir.js";

const VALID_CAPABILITIES: CapabilityLevel[] = ["FULL", "STALE", "NO_GRAPH", "DEGRADED"];

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

    it("handles finding with null fields gracefully", () => {
      const raw = JSON.stringify({
        results: [
          {
            query: null,
            nodes: null,
            relations: null,
            confidence: null,
          },
        ],
      });
      const findings = parseQueryOutput(raw);
      expect(findings.length).toBe(1);
      expect(findings[0]!.query).toBe("");
      expect(findings[0]!.nodes).toEqual([]);
      expect(findings[0]!.relations).toEqual([]);
      expect(findings[0]!.confidence).toBe("AMBIGUOUS");
    });

    it("handles finding with community scope", () => {
      // The parser reads community from raw JSON but does not pass it
      // through to the output finding. This test verifies the parser
      // gracefully handles the field without crashing.
      const raw = JSON.stringify({
        results: [
          {
            query: "test",
            nodes: ["A"],
            relations: [],
            community: "core-modules",
            confidence: "EXTRACTED",
          },
        ],
      });
      const findings = parseQueryOutput(raw);
      expect(findings.length).toBe(1);
      expect(findings[0]!.query).toBe("test");
      expect(findings[0]!.nodes).toEqual(["A"]);
    });

    it("handles mixed results (some valid, some invalid)", () => {
      const raw = JSON.stringify({
        results: [
          { query: "valid", nodes: ["A"], relations: [], confidence: "EXTRACTED" },
          null,
          "string instead of object",
          42,
          { query: "also valid", nodes: ["B"], relations: [], confidence: "INFERRED" },
        ],
      });
      const findings = parseQueryOutput(raw);
      expect(findings.length).toBe(2);
      expect(findings[0]!.query).toBe("valid");
      expect(findings[1]!.query).toBe("also valid");
    });

    it("handles output with extra whitespace", () => {
      const raw = `  \n  ${JSON.stringify({
        results: [
          { query: "whitespace", nodes: ["A"], relations: [], confidence: "EXTRACTED" },
        ],
      })}  \n  `;
      const findings = parseQueryOutput(raw);
      expect(findings.length).toBe(1);
      expect(findings[0]!.query).toBe("whitespace");
    });

    it("handles output with BOM character", () => {
      // JSON.parse rejects BOM-prefixed strings, so the parser returns empty.
      const raw = `\uFEFF${JSON.stringify({
        results: [
          { query: "bom-test", nodes: ["A"], relations: [], confidence: "EXTRACTED" },
        ],
      })}`;
      const findings = parseQueryOutput(raw);
      expect(findings).toEqual([]);
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

  describe("graphify-client", () => {
    // Build and query tests use a temp code-only project to avoid
    // requiring LLM API keys for doc-file semantic extraction.
    const projectRoot = process.cwd();
    let testDir: string;
    let testDirCleanup: () => void;

    beforeAll(() => {
      const temp = createTempDir();
      testDir = temp.path;
      testDirCleanup = temp.cleanup;

      // Copy source code and config into the temp project
      const srcDest = join(testDir, "src");
      mkdirSync(srcDest, { recursive: true });
      cpSync(join(projectRoot, "src"), srcDest, { recursive: true });
      cpSync(join(projectRoot, "tsconfig.json"), join(testDir, "tsconfig.json"));
      cpSync(join(projectRoot, "package.json"), join(testDir, "package.json"));
    });

    afterAll(() => {
      testDirCleanup();
    });

    it("detectCapability returns a valid CapabilityLevel", async () => {
      const capability = await detectCapability(projectRoot);
      expect(VALID_CAPABILITIES).toContain(capability);
    });

    it("build returns success when graphify CLI is available", async () => {
      const result = await build(testDir);
      expect(result.success).toBe(true);
    }, 180_000);

    it("query returns findings for a simple question", async () => {
      const findings = await query(testDir, "What modules are in this project?");
      expect(Array.isArray(findings)).toBe(true);
      for (const finding of findings) {
        expect(typeof finding.query).toBe("string");
        expect(Array.isArray(finding.nodes)).toBe(true);
        expect(typeof finding.confidence).toBe("string");
        expect(typeof finding.timestamp).toBe("string");
      }
    });
  });

  describe("graphify-setup", () => {
    const projectRoot = process.cwd();
    let testDir: string;
    let testDirCleanup: () => void;

    beforeAll(() => {
      const temp = createTempDir();
      testDir = temp.path;
      testDirCleanup = temp.cleanup;

      const srcDest = join(testDir, "src");
      mkdirSync(srcDest, { recursive: true });
      cpSync(join(projectRoot, "src"), srcDest, { recursive: true });
      cpSync(join(projectRoot, "tsconfig.json"), join(testDir, "tsconfig.json"));
      cpSync(join(projectRoot, "package.json"), join(testDir, "package.json"));
    });

    afterAll(() => {
      testDirCleanup();
    });

    it("checkGraphifyCLI returns installed=true", async () => {
      const result = await checkGraphifyCLI();
      expect(result.installed).toBe(true);
    });

    it("checkGraphifyCLI returns version string", async () => {
      const result = await checkGraphifyCLI();
      expect(result.version).toBeDefined();
      expect(result.version!.length).toBeGreaterThan(0);
    });

    it("runGraphifyBuild returns success for valid project", async () => {
      const result = await runGraphifyBuild(testDir);
      expect(result.success).toBe(true);
    }, 180_000);
  });

  describe("checkGraphifyCLI", () => {
    it("returns installed status without throwing", async () => {
      const result = await checkGraphifyCLI();
      expect(result).toHaveProperty("installed");
      expect(typeof result.installed).toBe("boolean");
    });
  });
});
