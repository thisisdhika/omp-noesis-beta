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
import { existsSync, mkdirSync, openSync, ftruncateSync, closeSync, writeFileSync, utimesSync } from "node:fs";
import { createTempDir } from "../../helpers/temp-dir.js";
import {
  detectCapability,
  computeGraphAgeHours,
  query,
  build,
  updateGraph,
  tryBackgroundGraphUpdate,
  tryLifecycleGraphUpdate,
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

  it("returns STALE when graph file is older than 24h", async () => {
    // detectCapability is a pure stat-only check — no auto-heal side effect.
    createGraphFile(tempDir.path, 48);
    expect(await detectCapability(tempDir.path)).toBe("STALE");
  });
});

// ============================================================================
// Tests — computeGraphAgeHours
// ============================================================================

describe("computeGraphAgeHours", () => {
  it("returns null when no graph file exists", async () => {
    expect(await computeGraphAgeHours(tempDir.path)).toBeNull();
  });

  it("returns a number when graph file exists", async () => {
    createGraphFile(tempDir.path);
    const result = await computeGraphAgeHours(tempDir.path);
    expect(result).toBeNumber();
    // Freshly created file should be < 1 hour old
    expect(result).toBeLessThan(1);
  });

  it("returns age hours consistent with staleHours parameter", async () => {
    createGraphFile(tempDir.path, 10);
    const result = await computeGraphAgeHours(tempDir.path);
    expect(result).toBeNumber();
    // 10 hours stale ± some margin for test execution
    expect(result).toBeGreaterThan(9);
    expect(result).toBeLessThan(11);
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

// ============================================================================
// Tests — tryBackgroundGraphUpdate
// ============================================================================

describe("tryBackgroundGraphUpdate", () => {
  it("returns false when graph is too large", async () => {
    // Create a graph.json > MAX_GRAPH_SIZE_BYTES (50MB)
    const graphDir = join(tempDir.path, "graphify-out");
    mkdirSync(graphDir, { recursive: true });
    const graphPath = join(graphDir, "graph.json");
    const fd = openSync(graphPath, "w");
    ftruncateSync(fd, 50 * 1024 * 1024 + 1);
    closeSync(fd);

    const stateManager = {
      read: () => ({}),
      mutate: async () => {},
    };
    expect(await tryBackgroundGraphUpdate(tempDir.path, stateManager)).toBe(false);
  });

  it("returns true on successful update and records timestamp", async () => {
    const srcDir = join(tempDir.path, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "index.ts"), "export const x = 1;");
    writeFileSync(
      join(tempDir.path, "package.json"),
      JSON.stringify({ name: "test-project" }),
    );

    let recorded: string | undefined;
    const stateManager = {
      read: () => ({ _lastGraphUpdate: recorded }),
      mutate: async (fn: (s: any) => void) => {
        const s: any = {};
        fn(s);
        recorded = s._lastGraphUpdate;
      },
    };
    expect(await tryBackgroundGraphUpdate(tempDir.path, stateManager)).toBe(true);
    expect(recorded).toBeDefined();
    expect(typeof recorded).toBe("string");
    expect(new Date(recorded!).getTime()).toBeGreaterThan(0);
  });

  it("returns false when update fails", async () => {
    const stateManager = {
      read: () => ({}),
      mutate: async () => {},
    };
    expect(
      await tryBackgroundGraphUpdate("/tmp/nonexistent-project-root-omp-test", stateManager),
    ).toBe(false);
  });

  it("returns false on timeout", async () => {
    const srcDir = join(tempDir.path, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "index.ts"), "export const x = 1;");
    writeFileSync(
      join(tempDir.path, "package.json"),
      JSON.stringify({ name: "test-project" }),
    );

    const stateManager = {
      read: () => ({}),
      mutate: async () => {},
    };
    // 1ms timeout ensures Bun.spawn kills the process before it completes
    expect(await tryBackgroundGraphUpdate(tempDir.path, stateManager, { timeout: 1 })).toBe(false);
  });
});

// ============================================================================
// Tests — tryLifecycleGraphUpdate
// ============================================================================

describe("tryLifecycleGraphUpdate", () => {
  it("returns false when CLI is missing", async () => {
    const origWhich = Bun.which;
    try {
      Reflect.set(Bun, "which", (_cmd: string) => null);
      const stateManager = {
        read: () => ({}),
        mutate: async () => {},
      };
      expect(await tryLifecycleGraphUpdate(tempDir.path, stateManager)).toBe(false);
    } finally {
      Reflect.set(Bun, "which", origWhich);
    }
  });

  it("returns false when graph is too large", async () => {
    createGraphFile(tempDir.path);
    // Expand graph.json past 50MB
    const graphDir = join(tempDir.path, "graphify-out");
    const graphPath = join(graphDir, "graph.json");
    const fd = openSync(graphPath, "w");
    ftruncateSync(fd, 50 * 1024 * 1024 + 1);
    closeSync(fd);

    const stateManager = {
      read: () => ({}),
      mutate: async () => {},
    };
    // allowFreshGraph=true so we get past the FULL→early-exit gate
    expect(await tryLifecycleGraphUpdate(tempDir.path, stateManager, { allowFreshGraph: true })).toBe(false);
  });

  it("returns false when requireAutoUpdate is true and autoUpdate is disabled", async () => {
    const ompDir = join(tempDir.path, ".omp");
    mkdirSync(ompDir, { recursive: true });
    writeFileSync(
      join(ompDir, "config.yml"),
      "noesis:\n  graphify:\n    autoUpdate: false\n",
    );
    createGraphFile(tempDir.path);

    const stateManager = {
      read: () => ({}),
      mutate: async () => {},
    };
    expect(await tryLifecycleGraphUpdate(tempDir.path, stateManager, { allowFreshGraph: true })).toBe(false);
  });

  it("returns false when requireStale is set but graph is fresh", async () => {
    createGraphFile(tempDir.path);
    const stateManager = {
      read: () => ({}),
      mutate: async () => {},
    };
    expect(await tryLifecycleGraphUpdate(tempDir.path, stateManager, { requireStale: true })).toBe(false);
  });

  it("returns true on successful update with allowFreshGraph", async () => {
    const srcDir = join(tempDir.path, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "index.ts"), "export const x = 1;");
    writeFileSync(
      join(tempDir.path, "package.json"),
      JSON.stringify({ name: "test-project" }),
    );
    createGraphFile(tempDir.path);

    const stateManager = {
      read: () => ({}),
      mutate: async () => {},
    };
    expect(await tryLifecycleGraphUpdate(tempDir.path, stateManager, { allowFreshGraph: true })).toBe(true);
  });
});
