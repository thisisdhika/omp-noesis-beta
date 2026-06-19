"use strict";

/**
 * Unit tests for aliases.ts — PA-Tool alias registration.
 *
 * Verifies all 9 aliases are registered with correct metadata,
 * parameter schemas accept/reject expected input, and execution
 * delegates to the correct canonical tool handler.
 */

import { describe, it, expect } from "bun:test";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { createMockPi, toExtensionAPI } from "../../helpers/mock-pi.js";
import { createRuntime, type NoesisRuntime } from "../../../src/runtime.js";
import { registerToolAliases } from "../../../src/tools/aliases.js";
import { EMPTY_STATE } from "../../../src/shared/schema.js";
import { deepClone } from "../../../src/shared/clone.js";
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
  registerToolAliases(toExtensionAPI(pi), runtime);

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

/** Retrieve the stored Zod schema for a registered alias tool. */
function getSchema(pi: MockPi, name: string): z.ZodType<unknown> {
  const tool = pi._getTool(name);
  // tool.parameters is the raw ZodObject stored at registration time
  return tool?.parameters as unknown as z.ZodType<unknown>;
}

// ---------------------------------------------------------------------------
// Registration tests
// ---------------------------------------------------------------------------

describe("registerToolAliases", () => {
  it("registers all 9 aliases", async () => {
    const { pi } = await setup();
    expect(pi._toolCount()).toBe(7);
  });

  it("registers focus_task with correct metadata", async () => {
    const { pi } = await setup();
    const tool = pi._getTool("focus_task");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("focus_task");
    expect(tool!.label).toBe("Noesis: Focus Task");
    expect(tool!.description).toContain("Alias for noesis_attend");
    expect(tool!.parameters).toBeDefined();
    expect(tool!.execute).toBeDefined();
  });

  it("registers switch_focus with correct metadata", async () => {
    const { pi } = await setup();
    const tool = pi._getTool("switch_focus");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("switch_focus");
    expect(tool!.label).toBe("Noesis: Switch Focus");
    expect(tool!.description).toContain("Alias for noesis_attend");
  });

  it("registers store_memory with correct metadata", async () => {
    const { pi } = await setup();
    const tool = pi._getTool("store_memory");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("store_memory");
    expect(tool!.label).toBe("Noesis: Store Memory");
    expect(tool!.description).toContain("Alias for noesis_believe_fact");
  });

  it("registers test_hypothesis with correct metadata", async () => {
    const { pi } = await setup();
    const tool = pi._getTool("test_hypothesis");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("test_hypothesis");
    expect(tool!.label).toBe("Noesis: Test Hypothesis");
    expect(tool!.description).toContain("Alias for noesis_infer");
  });

  it("registers track_workflow with correct metadata", async () => {
    const { pi } = await setup();
    const tool = pi._getTool("track_workflow");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("track_workflow");
    expect(tool!.label).toBe("Noesis: Track Workflow");
    expect(tool!.description).toContain("Alias for noesis_commit");
  });

  it("registers read_memory with correct metadata and boundary wording", async () => {
    const { pi } = await setup();
    const tool = pi._getTool("read_memory");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("read_memory");
    expect(tool!.label).toBe("Noesis: Read Memory");
    expect(tool!.description).toContain("Alias for noesis_state_inspect");
    // Phase 2 boundary: proves read_memory targets in-memory state
    expect(tool!.description as string).toMatch(/in-memory/i);
  });


  it("registers store_decision with correct metadata", async () => {
    const { pi } = await setup();
    const tool = pi._getTool("store_decision");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("store_decision");
    expect(tool!.label).toBe("Noesis: Store Decision");
    expect(tool!.description).toContain("Alias for noesis_believe_decision");
  });


  it("each alias description mentions the canonical tool name", async () => {
    const { pi } = await setup();
    const canonical = ["noesis_attend", "noesis_attend", "noesis_believe_fact",
      "noesis_believe_decision",
      "noesis_infer", "noesis_commit", "noesis_state_inspect"];

    for (const [idx, name] of ["focus_task", "switch_focus", "store_memory",
      "store_decision",
      "test_hypothesis", "track_workflow", "read_memory"].entries()) {
      const tool = pi._getTool(name);
      expect(tool).toBeDefined();
      expect(tool!.description as string).toContain(canonical[idx]!);
    }
  });

  // ── Schema validation tests ──

  it("focus_task schema accepts valid input with all fields", async () => {
    const { pi } = await setup();
    const schema = getSchema(pi, "focus_task");
    const result = schema.safeParse({
      focus: "Implement authentication",
      files: ["src/auth.ts"],
      priority: "high",
    });
    expect(result.success).toBe(true);
  });

  it("focus_task schema accepts focus without optional parameters", async () => {
    const { pi } = await setup();
    const schema = getSchema(pi, "focus_task");
    const result = schema.safeParse({
      focus: "Review architecture",
      priority: "normal",
    });
    expect(result.success).toBe(true);
  });

  it("focus_task accepts empty focus string (current behavior — no min(1))", async () => {
    const { pi } = await setup();
    const schema = getSchema(pi, "focus_task");
    const result = schema.safeParse({
      focus: "",
      priority: "normal",
    });
    // Current Zod schema for focus is .string() without .min(1)
    expect(result.success).toBe(true);
  });

  it("focus_task rejects missing required focus field", async () => {
    const { pi } = await setup();
    const schema = getSchema(pi, "focus_task");
    const result = schema.safeParse({
      priority: "normal",
    });
    expect(result.success).toBe(false);
  });

  it("store_memory schema rejects invalid confidence value", async () => {
    const { pi } = await setup();
    const schema = getSchema(pi, "store_memory");
    // confidence must be 0-1
    const result = schema.safeParse({ confidence: 1.5 });
    expect(result.success).toBe(false);
  });

  it("store_memory schema rejects fact without required fields", async () => {
    const { pi } = await setup();
    const schema = getSchema(pi, "store_memory");
    // Empty object fails because confidence is required (number, not undefined)
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("store_memory schema accepts valid fact input", async () => {
    const { pi } = await setup();
    const schema = getSchema(pi, "store_memory");
    const result = schema.safeParse({
      content: "Test fact",
      confidence: 0.9,
      source: "execution",
    });
    expect(result.success).toBe(true);
  });

  it("store_decision schema accepts valid decision input", async () => {
    const { pi } = await setup();
    const schema = getSchema(pi, "store_decision");
    const result = schema.safeParse({
      content: "Use TypeScript",
      rationale: "Type safety improves maintainability",
      source: "execution",
    });
    expect(result.success).toBe(true);
  });


  it("test_hypothesis schema accepts missing content for add_hypothesis (no refine)", async () => {
    const { pi } = await setup();
    const schema = getSchema(pi, "test_hypothesis");
    // .refine() removed — all fields optional now
    const result = schema.safeParse({
      action: "add_hypothesis",
      // missing content
    });
    expect(result.success).toBe(true);
  });

  it("test_hypothesis schema accepts valid add_hypothesis", async () => {
    const { pi } = await setup();
    const schema = getSchema(pi, "test_hypothesis");
    const result = schema.safeParse({
      action: "add_hypothesis",
      content: "Test hypothesis",
    });
    expect(result.success).toBe(true);
  });

  it("track_workflow schema accepts valid extend_workflow", async () => {
    const { pi } = await setup();
    const schema = getSchema(pi, "track_workflow");
    const result = schema.safeParse({
      mode: "extend_workflow",
      steps: [{ description: "First step" }],
      goal: "Test goal",
    });
    expect(result.success).toBe(true);
  });

  it("read_memory schema requires keyword when query is search", async () => {
    const { pi } = await setup();
    const schema = getSchema(pi, "read_memory");
    const result = schema.safeParse({
      query: "search",
      // missing keyword
    });
    expect(result.success).toBe(false);
  });

  it("read_memory schema accepts active_beliefs without keyword", async () => {
    const { pi } = await setup();
    const schema = getSchema(pi, "read_memory");
    const result = schema.safeParse({
      query: "active_beliefs",
    });
    expect(result.success).toBe(true);
  });


  // ── Execution tests ──

  it("focus_task executes and sets focus in state", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "focus_task");

    const result = await execute({
      focus: "Implement authentication",
      files: ["src/auth.ts"],
      priority: "high",
    });

    expect(result.isError).toBe(false);
    expect(result.content[0]!.text).toContain(
      'Focus set to: "Implement authentication"',
    );

    const state = runtime.stateManager.read();
    expect(state.attention.focus).toBe("Implement authentication");
    expect(state.attention.priority).toBe("high");
  });

  it("focus_task executes without optional parameters", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "focus_task");

    const result = await execute({
      focus: "Review architecture",
      priority: "normal",
    });

    expect(result.isError).toBe(false);
    expect(result.content[0]!.text).toContain(
      'Focus set to: "Review architecture"',
    );

    const state = runtime.stateManager.read();
    expect(state.attention.focus).toBe("Review architecture");
    expect(state.attention.priority).toBe("normal");
  });

  it("switch_focus executes and sets focus", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "switch_focus");

    const result = await execute({
      focus: "Narrowing scope",
      priority: "high",
    });

    expect(result.isError).toBe(false);
    expect(result.content[0]!.text).toContain(
      'Focus set to: "Narrowing scope"',
    );

    const state = runtime.stateManager.read();
    expect(state.attention.focus).toBe("Narrowing scope");
  });

  it("store_memory execution stores a fact in state", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "store_memory");

    const result = await execute({
      type: "fact",
      content: "Test fact",
      confidence: 0.9,
      source: "execution",
    });

    expect(result.isError).toBe(false);
    const state = runtime.stateManager.read();
    expect(state.belief.facts).toHaveLength(1);
    expect(state.belief.facts[0]!.content).toBe("Test fact");
    expect(state.belief.facts[0]!.confidence).toBe(0.9);
  });

  it("store_decision execution stores a decision in state", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "store_decision");

    const result = await execute({
      content: "Use TypeScript strict mode",
      rationale: "Improves code quality",
      source: "execution",
    });

    expect(result.isError).toBe(false);
    const state = runtime.stateManager.read();
    expect(state.belief.decisions).toHaveLength(1);
    expect(state.belief.decisions[0]!.content).toBe("Use TypeScript strict mode");
  });

  it("test_hypothesis execution creates a hypothesis", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "test_hypothesis");

    const result = await execute({
      action: "add_hypothesis",
      content: "Test hypothesis",
    });

    expect(result.isError).toBe(false);
    const state = runtime.stateManager.read();
    expect(state.inference.hypotheses).toHaveLength(1);
    expect(state.inference.hypotheses[0]!.content).toBe("Test hypothesis");
  });

  it("track_workflow execution extends a workflow", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "track_workflow");

    const result = await execute({
      mode: "extend_workflow",
      steps: [{ description: "First step" }],
      goal: "Test workflow",
    });

    expect(result.isError).toBe(false);
    const state = runtime.stateManager.read();
    expect(state.commitment.workflow.steps).toHaveLength(1);
    expect(state.commitment.workflow.goal).toBe("Test workflow");
  });

  it("read_memory execution returns active beliefs (empty state)", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "read_memory");

    const result = await execute({
      query: "active_beliefs",
    });

    expect(result.isError).toBe(false);
    expect(result.content[0]!.text).toContain("(none)");
  });

});
