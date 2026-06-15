"use strict";

/**
 * Integration tests for tool registration and execution via mock ExtensionAPI.
 *
 * Verifies that all 7 noesis tools register correctly and each tool's execute
 * handler produces expected side effects on cognitive state.
 */

import { describe, it, expect } from "bun:test";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createMockPi } from "../helpers/mock-pi.js";
import { createRuntime, type NoesisRuntime } from "../../src/runtime.js";
import { registerTools } from "../../src/tools/index.js";
import { EMPTY_STATE } from "../../src/schema.js";
import { deepClone } from "../../src/shared/clone.js";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Mock pi with test helper methods. */
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

/** Shape returned by tool execute handlers. */
interface ToolExecuteResult {
  content: Array<{ type: string; text: string }>;
  details: Record<string, unknown>;
  isError: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset persisted state so each test group starts from EMPTY_STATE. */
function cleanState(): void {
  const statePath = join(process.cwd(), ".omp", "noesis", "state.json");
  try {
    if (existsSync(statePath)) unlinkSync(statePath);
  } catch {
    // best-effort cleanup
  }
}

/**
 * Build a mock pi, create runtime, register tools.
 * Resets state first for test isolation.
 */
async function setup(): Promise<{ pi: MockPi; runtime: NoesisRuntime }> {
  cleanState();

  const raw = createMockPi();
  // Unsafe cast: mock structurally matches ExtensionAPI for test purposes.
  const pi = raw as unknown as MockPi;
  const runtime = await createRuntime(pi as unknown as ExtensionAPI);
  registerTools(pi as unknown as ExtensionAPI, runtime);

  // Reset in-memory state to guarantee clean baseline
  await runtime.stateManager.mutate((s) => {
    Object.assign(s, deepClone(EMPTY_STATE));
  });

  return { pi, runtime };
}

/** Retrieve a registered tool's execute method typed for invocation. */
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

describe("tool registration", () => {
  it("registers all 7 tools", async () => {
    const { pi } = await setup();
    expect(pi._toolCount()).toBe(7);
  });

  it("registers each tool by its expected name", async () => {
    const { pi } = await setup();
    const names = [
      "noesis_attend",
      "noesis_focus",
      "noesis_believe",
      "noesis_infer",
      "noesis_commit",
      "noesis_recall",
      "noesis_vault_search",
    ];
    for (const name of names) {
      expect(pi._getTool(name)).toBeTruthy();
    }
  });
});

describe("noesis_attend", () => {
  it("updates focus and priority in attention layer when executed", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_attend");

    const result = await execute({
      focus: "Implement authentication",
      priority: "high",
      files: ["src/auth.ts"],
    });

    expect(result.isError).toBe(false);
    expect(result.details.focus).toBe("Implement authentication");

    const state = runtime.stateManager.read();
    expect(state.attention.focus).toBe("Implement authentication");
    expect(state.attention.priority).toBe("high");
  });
});

describe("noesis_believe", () => {
  it("creates a belief fact when executed with type=fact", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_believe");

    const result = await execute({
      type: "fact",
      content: "The application uses Bun runtime",
      confidence: 0.9,
      source: "execution",
      tags: ["infrastructure"],
    });

    expect(result.isError).toBe(false);
    expect(result.details.kind).toBe("fact");

    const state = runtime.stateManager.read();
    expect(state.belief.facts).toHaveLength(1);
    expect(state.belief.facts[0]!.content).toBe(
      "The application uses Bun runtime",
    );
    expect(state.belief.facts[0]!.source).toBe("execution");
  });
});

describe("noesis_infer", () => {
  it("creates a hypothesis in testing status when executed", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_infer");

    const result = await execute({
      action: "add_hypothesis",
      content: "The test failure is caused by a missing dependency",
      tags: ["testing"],
    });

    expect(result.isError).toBe(false);

    const state = runtime.stateManager.read();
    expect(state.inference.hypotheses).toHaveLength(1);
    expect(state.inference.hypotheses[0]!.content).toBe(
      "The test failure is caused by a missing dependency",
    );
    expect(state.inference.hypotheses[0]!.status).toBe("testing");
  });
});

describe("noesis_commit", () => {
  it("extends the workflow when executed with mode=extend_workflow", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_commit");

    const result = await execute({
      mode: "extend_workflow",
      steps: [
        { description: "Install dependencies" },
        { description: "Run tests", verification: "bun test" },
      ],
    });

    expect(result.isError).toBe(false);
    expect(result.details.stepCount).toBe(2);

    const state = runtime.stateManager.read();
    expect(state.commitment.workflow.steps).toHaveLength(2);
    expect(state.commitment.workflow.steps[0]!.description).toBe(
      "Install dependencies",
    );
  });
});

describe("noesis_recall", () => {
  it("returns active beliefs after a fact has been created", async () => {
    const { pi } = await setup();

    // Arrange — seed a belief fact
    const believe = toolExecutor(pi, "noesis_believe");
    await believe({
      type: "fact",
      content: "Memory limit is 512MB",
      confidence: 0.8,
      source: "execution",
    });

    // Act — query active beliefs
    const recall = toolExecutor(pi, "noesis_recall");
    const result = await recall({
      query: "active_beliefs",
      minConfidence: 0.75,
    });

    // Assert
    expect(result.isError).toBe(false);
    expect(result.details.count).toBeGreaterThanOrEqual(1);
    expect(result.content[0]!.text).toContain("Memory limit is 512MB");
  });
});

describe("noesis_vault_search", () => {
  it("returns placeholder indicating vault search is unavailable", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_vault_search");

    const result = await execute({
      query: "search term",
      kind: "all",
      maxResults: 5,
    });

    expect(result.isError).toBe(false);
    expect(result.details.available).toBe(false);
    expect(result.content[0]!.text).toContain("not yet available");
  });
});
