"use strict";

/**
 * Unit tests for focus-command.ts — noesis_focus tool.
 */

import { describe, it, expect } from "bun:test";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createMockPi } from "../../helpers/mock-pi.js";
import { createRuntime, type NoesisRuntime } from "../../../src/runtime.js";
import { registerFocusTool } from "../../../src/tools/focus-command.js";
import { EMPTY_STATE } from "../../../src/schema.js";
import { deepClone } from "../../../src/shared/clone.js";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MockPi {
  logger: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
  };
  registerTool(def: Record<string, unknown>): void;
  registerCommand(name: string, opts: Record<string, unknown>): void;
  on(event: string, handler: (...args: unknown[]) => unknown): void;
  _toolCount(): number;
  _getTool(name: string): Record<string, unknown> | undefined;
  _getHooks(event: string): Array<(...args: unknown[]) => unknown>;
}

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
  const raw = createMockPi();
  const pi = raw as unknown as MockPi;
  const runtime = await createRuntime(pi as unknown as ExtensionAPI);
  registerFocusTool(pi as unknown as ExtensionAPI, runtime);

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("noesis_focus", () => {
  it("sets focus and files when executed", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_focus");

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

    const state = runtime.stateManager.read();
    expect(state.attention.focus).toBe("Implement authentication");
    expect(state.attention.priority).toBe("high");
    expect(state.attention.files).toHaveLength(2);
    expect(state.attention.files).toContain("src/auth.ts");
  });

  it("handles focus without files parameter", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_focus");

    const result = await execute({
      focus: "Review architecture",
      priority: "normal",
    });

    expect(result.isError).toBe(false);
    expect(result.content[0]!.text).toContain(
      'Focus set to: "Review architecture"',
    );
    // When files is undefined, the ternary in the template evaluates to ""
    expect(result.content[0]!.text).not.toContain("Files referenced");
    expect(result.details.fileCount).toBe(0);

    const state = runtime.stateManager.read();
    expect(state.attention.focus).toBe("Review architecture");
    expect(state.attention.files).toHaveLength(0);
  });

  it("handles empty files array", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_focus");

    const result = await execute({
      focus: "Debug memory leak",
      files: [],
      priority: "critical",
    });

    expect(result.isError).toBe(false);
    // Empty array — ternary `files.length > 0` is false, so no file count text
    expect(result.content[0]!.text).not.toContain("Files referenced");
    expect(result.details.fileCount).toBe(0);
    expect(result.details.priority).toBe("critical");
  });

  it("handles low priority", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_focus");

    const result = await execute({
      focus: "Clean up code comments",
      priority: "low",
    });

    expect(result.isError).toBe(false);
    expect(result.details.priority).toBe("low");
    expect(result.content[0]!.text).toContain("priority: low");
  });

  it("handles single file reference", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_focus");

    const result = await execute({
      focus: "Fix bug in parser",
      files: ["src/parser.ts"],
      priority: "high",
    });

    expect(result.isError).toBe(false);
    expect(result.details.fileCount).toBe(1);
    expect(result.content[0]!.text).toContain("Files referenced: 1");
  });
});
