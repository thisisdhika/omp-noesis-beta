"use strict";

/**
 * Unit tests for graphify-client — capability detection, query execution,
 * build/update delegation, and error handling.
 *
 * The graphify CLI IS installed in this environment (Bun.which("graphify")
 * returns a path), so every branch that only requires the CLI to exist is
 * testable naturally.  The one exception is the "DEGRADED" path which
 * requires overriding Bun.which via Reflect.set (the property is writable
 * but not configurable, so Object.defineProperty cannot be used).
 *
 * Lines 128-129 (query catch) cannot be exercised at the unit level because
 * the CLI is installed and parseQueryOutput never throws.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { existsSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { createTempDir } from "../../helpers/temp-dir.js";
import {
  detectCapability,
  query,
  build,
  updateGraph,
} from "../../../src/infrastructure/graphify-client.js";

// ============================================================================
// Types
// ============================================================================

interface TempDir {
  path: string;
  cleanup(): void;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Create a minimal graphify-out/graph.json in the given temp dir.
 * Optionally sets mtime far enough in the past to simulate a stale graph.
 */
function createGraphFile(root: string, staleHours = 0): string {
  const graphDir = join(root, "graphify-out");
  mkdirSync(graphDir, { recursive: true });
  const graphPath = join(graphDir, "graph.json");
  writeFileSync(graphPath, JSON.stringify({ version: 1 }));
  if (staleHours > 0) {
    const past = new Date(Date.now() - staleHours * 60 * 60 * 1000);
    utimesSync(graphPath, past, past);
  }
  return graphPath;
}

// ============================================================================
// Fixtures
// ============================================================================

let tempDir: TempDir;

beforeEach(() => {
  tempDir = createTempDir();
});

afterEach(() => {
  tempDir.cleanup();
});

// ============================================================================
// Tests — detectCapability
// ============================================================================

describe("detectCapability", () => {
  it("returns DEGRADED when graphify CLI is not available", async () => {
    // Bun.which has writable:true but configurable:false → use Reflect.set
    const origWhich = Bun.which;
    try {
      Reflect.set(Bun, "which", (_cmd: string) => null);
      expect(await detectCapability(tempDir.path)).toBe("DEGRADED");
    } finally {
      Reflect.set(Bun, "which", origWhich);
    }
  });

  it("returns NO_GRAPH when graphify-out/graph.json is missing", async () => {
    // validateGraphPath returns null → line 46
    expect(await detectCapability(tempDir.path)).toBe("NO_GRAPH");
  });

  it("returns FULL when graph file is fresh", async () => {
    // stat succeeds, age <= 24h → line 66
    createGraphFile(tempDir.path);
    expect(await detectCapability(tempDir.path)).toBe("FULL");
  });

  it("executes auto-heal successfully and returns FULL", async () => {
    // Create source files so graphify
    // `graphify . --update` exits with code 0.
    const srcDir = join(tempDir.path, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "index.ts"), "export const x = 1;");
    writeFileSync(
      join(tempDir.path, "package.json"),
      JSON.stringify({ name: "test-project" }),
    );
    // Create stale graph to trigger auto-heal
    createGraphFile(tempDir.path, 48);
    // Auto-heal succeeds → lines 55-62 (inner block, re-stat, return FULL)
    expect(await detectCapability(tempDir.path)).toBe("FULL");
  });

  it("returns STALE on second stale call when _autoHealAttempted is true", async () => {
    // After a prior stale call set _autoHealAttempted = true, the
    // inner if block is skipped and the function falls through to
    // line 65: return "STALE".
    createGraphFile(tempDir.path, 48);
    expect(await detectCapability(tempDir.path)).toBe("STALE");
  });
});

// ============================================================================
// Tests — query
// ============================================================================

describe("query", () => {
  it("returns error result when no graph file exists", async () => {
    // validateGraphPath returns null → early return at line 113
    const result = await query(tempDir.path, "test question");
    expect(result.findings).toEqual([]);
    expect(result.error).toBe("No graph file found");
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it("executes query against an existing graph file", async () => {
    // Spawn succeeds, the CLI processes the (empty) graph → result
    // has an empty findings array and no error set.
    createGraphFile(tempDir.path);
    const result = await query(tempDir.path, "test question");
    expect(Array.isArray(result.findings)).toBe(true);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// Tests — build
// ============================================================================

describe("build", () => {
  it("delegates to runGraphifyBuild and returns expected shape", async () => {
    const result = await build(tempDir.path);
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("output");
    expect(typeof result.success).toBe("boolean");
    expect(typeof result.output).toBe("string");
  });
});

// ============================================================================
// Tests — updateGraph
// ============================================================================

describe("updateGraph", () => {
  it("executes update on the project root", async () => {
    const result = await updateGraph(tempDir.path);
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("output");
    expect(typeof result.success).toBe("boolean");
    expect(typeof result.output).toBe("string");
  });

  it("catches spawn errors when project root does not exist", async () => {
    // Non-existent cwd makes Bun.spawn throw → catch block (lines 177-179)
    const result = await updateGraph("/tmp/nonexistent-project-root-omp-test");
    expect(result.success).toBe(false);
    expect(typeof result.output).toBe("string");
    expect(result.output.length).toBeGreaterThan(0);
  });
});
