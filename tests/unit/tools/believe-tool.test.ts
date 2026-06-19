"use strict";

/**
 * Unit tests for believe-tool.ts — noesis_believe_fact, noesis_believe_decision, noesis_believe_learning tools.
 */

import { describe, it, expect } from "bun:test";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createMockPi, toExtensionAPI } from "../../helpers/mock-pi.js";
import { createRuntime, type NoesisRuntime } from "../../../src/runtime.js";
import { registerBelieveFactTool, registerBelieveDecisionTool, registerBelieveLearningTool } from "../../../src/tools/believe-tool.js";
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
  registerBelieveFactTool(toExtensionAPI(pi), runtime);
  registerBelieveDecisionTool(toExtensionAPI(pi), runtime);
  registerBelieveLearningTool(toExtensionAPI(pi), runtime);

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

describe("noesis_believe_fact", () => {
  it("records a fact", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_believe_fact");

    const result = await execute({
      content: "The sky is blue",
      confidence: 0.95,
      source: "user",
    });

    expect(result.isError).toBe(false);
    expect(result.content[0]!.text).toContain("Created fact:");
    expect(result.content[0]!.text).toContain("The sky is blue");

    const state = runtime.stateManager.read();
    expect(state.belief.facts).toHaveLength(1);
    expect(state.belief.facts[0]!.content).toBe("The sky is blue");
    expect(state.belief.facts[0]!.confidence).toBe(0.95);
  });


  it("schema refine rejects missing required fields", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_believe_fact") as Record<string, unknown> | undefined;
    expect(def).toBeDefined();
    const schema = def!.parameters as { parse: (data: unknown) => unknown };
    expect(schema).toBeDefined();

    // Without content, confidence, or source should fail refinement
    expect(() => schema.parse({})).toThrow();

    // Partially specified should also fail
    expect(() => schema.parse({ content: "test" })).toThrow();
  });
});

describe("noesis_believe_decision", () => {
  it("records a decision", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_believe_decision");

    const result = await execute({
      content: "Use TypeScript strict mode",
      rationale: "Catches more errors at compile time",
      source: "user",
      alternatives: ["loose mode", "JavaScript"],
    });

    expect(result.isError).toBe(false);
    expect(result.content[0]!.text).toContain("Created decision:");
    expect(result.content[0]!.text).toContain("Use TypeScript strict mode");

    const state = runtime.stateManager.read();
    expect(state.belief.decisions).toHaveLength(1);
    expect(state.belief.decisions[0]!.content).toBe(
      "Use TypeScript strict mode",
    );
    expect(state.belief.decisions[0]!.rationale).toBe(
      "Catches more errors at compile time",
    );
  });


  it("schema refine rejects missing required fields", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_believe_decision") as Record<string, unknown> | undefined;
    expect(def).toBeDefined();
    const schema = def!.parameters as { parse: (data: unknown) => unknown };
    expect(schema).toBeDefined();

    // Without content, rationale, or source should fail refinement
    expect(() => schema.parse({})).toThrow();

    // Partially specified should also fail
    expect(() => schema.parse({ content: "test" })).toThrow();
  });
});

describe("noesis_believe_learning", () => {
  it("records a learning resolution", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_believe_learning");

    // First create a learning failure entry
    await runtime.stateManager.mutate((state) => {
      state.learning.failures.push({
        id: "le-fix-001",
        description: "Something failed",
        status: "captured",
        capturedAt: new Date().toISOString(),
      });
    });

    const result = await execute({
      learningId: "le-fix-001",
      rootCause: "Missing null check",
      fix: "Add null guard before dereference",
    });

    expect(result.isError).toBe(false);
    expect(result.content[0]!.text).toContain("Resolved learning le-fix-001 into fact:");
    expect(result.content[0]!.text).toContain("Missing null check");
  });


  it("schema refine rejects missing required fields", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_believe_learning") as Record<string, unknown> | undefined;
    expect(def).toBeDefined();
    const schema = def!.parameters as { parse: (data: unknown) => unknown };
    expect(schema).toBeDefined();

    // Without learningId, rootCause, or fix should fail refinement
    expect(() => schema.parse({})).toThrow();

    // Partially specified should also fail
    expect(() => schema.parse({ learningId: "test" })).toThrow();
  });
});
