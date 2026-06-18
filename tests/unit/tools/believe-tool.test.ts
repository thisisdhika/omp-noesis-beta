"use strict";

/**
 * Unit tests for believe-tool.ts — noesis_believe tool.
 * Covers fact, decision, learning execution paths and schema refinement.
 */

import { describe, it, expect } from "bun:test";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createMockPi, toExtensionAPI } from "../../helpers/mock-pi.js";
import { createRuntime, type NoesisRuntime } from "../../../src/runtime.js";
import { registerBelieveTool } from "../../../src/tools/believe-tool.js";
import { EMPTY_STATE } from "../../../src/schema.js";
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
  registerBelieveTool(toExtensionAPI(pi), runtime);

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

describe("noesis_believe", () => {
  it("records a fact", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_believe");

    const result = await execute({
      type: "fact",
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

  it("records a decision", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_believe");

    const result = await execute({
      type: "decision",
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

  it("records a learning resolution", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_believe");

    // First create a learning failure entry
    await runtime.stateManager.mutate((state) => {
      state.learning.failures.push({
        id: "learn-fix-001",
        description: "Something failed",
        status: "captured",
        capturedAt: new Date().toISOString(),
      });
    });

    const result = await execute({
      type: "learning",
      learningId: "learn-fix-001",
      rootCause: "Missing null check",
      fix: "Add null guard before dereference",
    });

    expect(result.isError).toBe(false);
    expect(result.content[0]!.text).toContain("Created fact (from learning):");
    expect(result.content[0]!.text).toContain("Missing null check");
  });

  it("returns error for fact with missing fields", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_believe");

    const result = await execute({
      type: "fact",
      // no content, confidence, or source
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Missing required fields");
  });

  it("returns error for decision with missing fields", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_believe");

    const result = await execute({
      type: "decision",
      // no content, rationale, or source
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Missing required fields");
  });

  it("returns error for learning with missing fields", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_believe");

    const result = await execute({
      type: "learning",
      // no learningId, rootCause, or fix
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Missing required fields");
  });


  // -------------------------------------------------------------------------
  // Schema refinement test (cover line 66: fallthrough return false)
  // Uses the actual registered tool's parameters schema, not a copy.
  // -------------------------------------------------------------------------

  it("schema refine returns false for fact type without required fields", async () => {
    const { pi } = await setup();
    // After setup, registerBelieveTool was called, so the schema exists
    const def = pi._getTool("noesis_believe") as Record<string, unknown> | undefined;
    expect(def).toBeDefined();
    const schema = def!.parameters as { parse: (data: unknown) => unknown };
    expect(schema).toBeDefined();

    // Fact without content, confidence, or source should fail refinement
    expect(() => schema.parse({ type: "fact" })).toThrow();

    // Decision without rationale should also hit fallthrough
    expect(() =>
      schema.parse({ type: "decision", content: "test", source: "user" }),
    ).toThrow();

    // Learning without learningId, rootCause, or fix should hit fallthrough
    expect(() =>
      schema.parse({ type: "learning", rootCause: "cause", fix: "fix" }),
    ).toThrow();
  });
});
