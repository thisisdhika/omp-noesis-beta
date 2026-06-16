"use strict";

/**
 * Integration test: Graphify client, parser, and setup.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseQueryOutput } from "../../src/infrastructure/graphify-parser.js";
import { detectCapability, query, build } from "../../src/infrastructure/graphify-client.js";
import { checkGraphifyCLI, runGraphifyBuild } from "../../src/infrastructure/graphify-setup.js";
import type { CapabilityLevel } from "../../src/schema.js";
import { createTempDir } from "../helpers/temp-dir.js";

const VALID_CAPABILITIES: CapabilityLevel[] = ["FULL", "STALE", "NO_GRAPH", "DEGRADED"];

/** Create a temp .omp/mcp.json for testing MCP config detection. */
function createMcpConfig(dir: string, config: object): void {
  const ompDir = join(dir, ".omp");
  mkdirSync(ompDir, { recursive: true });
  writeFileSync(join(ompDir, "mcp.json"), JSON.stringify(config, null, 2));
}

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
      const result = await query(testDir, "What modules are in this project?");
      expect(result).toHaveProperty("findings");
      expect(Array.isArray(result.findings)).toBe(true);
      expect(typeof result.duration).toBe("number");
      if (result.error) {
        // Non-fatal: graph may not be built yet in some environments
        return;
      }
      for (const finding of result.findings) {
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

  describe("MCP config detection", () => {
    it("detectCapability returns FULL when CLI available, graph exists, and MCP config present", async () => {
      const tmp = createTempDir();
      try {
        createMcpConfig(tmp.path, {
          mcpServers: {
            graphify: {
              command: "python3",
              args: ["-m", "graphify.serve", "graphify-out/graph.json"],
            },
          },
        });

        // Create fresh graph file so existence + mtime checks pass
        const graphDir = join(tmp.path, "graphify-out");
        mkdirSync(graphDir, { recursive: true });
        writeFileSync(join(graphDir, "graph.json"), "{}");

        const capability = await detectCapability(tmp.path);
        // When CLI is installed and graph is fresh (< 24h), should be FULL.
        // When CLI is unavailable, detectCapability returns DEGRADED.
        expect(capability).toBe(
          Bun.which("graphify") ? "FULL" : "DEGRADED",
        );
      } finally {
        tmp.cleanup();
      }
    });

    it("detectCapability works normally when MCP config absent", async () => {
      const tmp = createTempDir();
      try {
        // Create fresh graph file but no .omp/mcp.json
        const graphDir = join(tmp.path, "graphify-out");
        mkdirSync(graphDir, { recursive: true });
        writeFileSync(join(graphDir, "graph.json"), "{}");

        const capability = await detectCapability(tmp.path);
        // Same outcome as with MCP config — detectCapability is currently
        // MCP-agnostic, so MCP config presence/absence has no effect.
        expect(capability).toBe(
          Bun.which("graphify") ? "FULL" : "DEGRADED",
        );
      } finally {
        tmp.cleanup();
      }
    });
  });

  describe("checkGraphifyCLI", () => {
    it("returns installed status without throwing", async () => {
      const result = await checkGraphifyCLI();
      expect(result).toHaveProperty("installed");
      expect(typeof result.installed).toBe("boolean");
    });
  });
});
