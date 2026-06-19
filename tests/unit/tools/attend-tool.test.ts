"use strict";

/**
 * Unit tests for attend-tool.ts — noesis_attend tool.
 * Covers basic execution, error path for graph queries (line 50).
 * Lines 63-64 (allFindings length > 0) require graphify query
 * to emit JSON output, which the current CLI does not support —
 * parseQueryOutput returns [] for plain text output.
 */

import { describe, it, expect } from "bun:test";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createMockPi, toExtensionAPI } from "../../helpers/mock-pi.js";
import { createRuntime, type NoesisRuntime } from "../../../src/runtime.js";
import { registerAttendTool } from "../../../src/tools/attend-tool.js";
import { EMPTY_STATE } from "../../../src/shared/schema.js";
import { deepClone } from "../../../src/shared/clone.js";
import { createTempDir } from "../../helpers/temp-dir.js";
import { StateManager } from "../../../src/infrastructure/state-manager.js";
import { createVaultStore } from "../../../src/vault/vault-detector.js";
import type { MockPi } from "../../helpers/mock-pi.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolExecuteResult {
  content: Array<{ type: string; text: string }>;
  details: Record<string, unknown>;
  isError: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanState(): void {
  const statePath = join(process.cwd(), ".omp", "noesis", "state.json");
  try {
    if (existsSync(statePath)) unlinkSync(statePath);
  } catch {
    // best-effort cleanup
  }
}

async function setup(): Promise<{ pi: MockPi; runtime: NoesisRuntime }> {
  cleanState();
  const pi = createMockPi();
  const runtime = await createRuntime(toExtensionAPI(pi));
  registerAttendTool(toExtensionAPI(pi), runtime);

  // Reset in-memory state to guarantee clean baseline
  await runtime.stateManager.mutate((s) => {
    Object.assign(s, deepClone(EMPTY_STATE));
  });

  return { pi, runtime };
}

function toolExecutor(
  pi: MockPi,
  name: string,
): (params: Record<string, unknown>) => Promise<ToolExecuteResult> {
  const def = pi._getTool(name) as Record<string, unknown> | undefined;
  const exec = def?.execute as
    | ((...args: unknown[]) => Promise<ToolExecuteResult>)
    | undefined;
  return async (params: Record<string, unknown>) => {
    return exec!("t-id", params, null, () => {}, {});
  };
}

/** Create a minimal NoesisRuntime for an arbitrary directory. */
async function createRuntimeAtDir(dir: string): Promise<NoesisRuntime> {
  const stateManager = new StateManager(dir);
  await stateManager.initialize();
  const vaultStore = await createVaultStore(dir);
  return { projectRoot: dir, stateManager, vaultStore };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("noesis_attend", () => {
  it("sets focus and files when executed", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_attend");

    const result = await execute({
      focus: "Implement authentication",
      files: ["src/auth.ts", "tests/auth.test.ts"],
      priority: "high",
    });

    expect(result.isError).toBe(false);
    expect(result.content[0]!.text).toContain(
      'Focus set to: "Implement authentication"',
    );
    expect(result.content[0]!.text).toContain("Files referenced: 2");
    expect(result.details.focus).toBe("Implement authentication");
    expect(result.details.priority).toBe("high");
    expect(result.details.fileCount).toBe(2);
    expect(result.details.graphQueryCount).toBe(0);
    expect(result.details.findingsCount).toBe(0);

    const state = runtime.stateManager.read();
    expect(state.attention.focus).toBe("Implement authentication");
    expect(state.attention.priority).toBe("high");
    expect(state.attention.files).toHaveLength(2);
    expect(state.attention.files).toContain("src/auth.ts");
  });

  it("handles focus without optional parameters", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_attend");

    const result = await execute({
      focus: "Review architecture",
      priority: "normal",
    });

    expect(result.isError).toBe(false);
    expect(result.content[0]!.text).toContain(
      'Focus set to: "Review architecture"',
    );
    expect(result.content[0]!.text).not.toContain("Files referenced");
    expect(result.content[0]!.text).not.toContain("Graph queries run");
    expect(result.details.fileCount).toBe(0);
    expect(result.details.graphQueryCount).toBe(0);

    const state = runtime.stateManager.read();
    expect(state.attention.focus).toBe("Review architecture");
    expect(state.attention.files).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Cover line 50: console.warn when graph query returns error
  // -------------------------------------------------------------------------

  it("handles graph query that produces error (no graph file)", async () => {
    // Create a runtime in a temp dir without a graph file.
    // This causes validateGraphPath to return null, which makes
    // graphifyQuery return { findings: [], error: "No graph file found" }.
    // The attend-tool logs a warning (line 50) but does not throw.
    const tmpDir = createTempDir();
    const pi = createMockPi();
    try {
      const runtime = await createRuntimeAtDir(tmpDir.path);
      registerAttendTool(toExtensionAPI(pi), runtime);

      await runtime.stateManager.mutate((s) => {
        Object.assign(s, deepClone(EMPTY_STATE));
      });

      const execute = toolExecutor(pi, "noesis_attend");

      const result = await execute({
        focus: "Explore codebase",
        graphQueries: ["find authentication patterns"],
        priority: "normal",
      });

      // Should still succeed — graph query error is non-fatal
      expect(result.isError).toBe(false);
      expect(result.content[0]!.text).toContain(
        'Focus set to: "Explore codebase"',
      );
      // The graph query count shows 1 query was attempted
      expect(result.details.graphQueryCount).toBe(1);
      // findingsCount should be 0 since there was an error
      expect(result.details.findingsCount).toBe(0);
    } finally {
      tmpDir.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // Test graph query with no graph queries (verify zero findings path)
  // -------------------------------------------------------------------------

  it("handles graphQueries parameter with 0 findings from existing graph", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_attend");

    // Graphify CLI outputs plain text, so parseQueryOutput returns [].
    // This exercises the tool with graphQueries but no parsed findings.
    const result = await execute({
      focus: "Map architecture",
      graphQueries: ["test"],
      priority: "high",
    });

    expect(result.isError).toBe(false);
    expect(result.details.graphQueryCount).toBe(1);
    // With current graphify output format, findings are always 0
    expect(result.details.findingsCount).toBe(0);

    // State should still be clean: focus is set, no findings stored
    const state = runtime.stateManager.read();
    expect(state.attention.focus).toBe("Map architecture");
    expect(state.attention.graphFindings).toHaveLength(0);
    expect(state.attention.pendingEvidence).toHaveLength(0);
  });
});
