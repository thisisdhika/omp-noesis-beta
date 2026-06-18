"use strict";

/**
 * Unit tests for infer-tool.ts — noesis_infer tool.
 * Covers add_hypothesis, update_hypothesis, add_reasoning paths
 * and schema refinement fallthrough (line 56).
 */

import { describe, it, expect } from "bun:test";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createMockPi, toExtensionAPI } from "../../helpers/mock-pi.js";
import { createRuntime, type NoesisRuntime } from "../../../src/runtime.js";
import { registerInferTool, buildInferParams } from "../../../src/tools/infer-tool.js";
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
  registerInferTool(toExtensionAPI(pi), runtime);

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

describe("noesis_infer", () => {
  it("adds a hypothesis with content", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_infer");

    const result = await execute({
      action: "add_hypothesis",
      content: "The bug is caused by a race condition",
      evidence: "Observed interleaving in logs",
      tags: ["bug", "concurrency"],
    });

    expect(result.isError).toBe(false);
    expect(result.content[0]!.text).toContain("Hypothesis created:");
    expect(result.content[0]!.text).toContain("race condition");

    const state = runtime.stateManager.read();
    expect(state.inference.hypotheses).toHaveLength(1);
    expect(state.inference.hypotheses[0]!.content).toContain("race condition");
    expect(state.inference.hypotheses[0]!.status).toBe("testing");
  });

  it("adds a hypothesis without optional fields", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_infer");

    const result = await execute({
      action: "add_hypothesis",
      content: "Minimal hypothesis",
    });

    expect(result.isError).toBe(false);
    expect(result.details.kind).toBe("hypothesis");

    const state = runtime.stateManager.read();
    expect(state.inference.hypotheses).toHaveLength(1);
  });

  it("returns error for add_hypothesis without content", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_infer");

    const result = await execute({
      action: "add_hypothesis",
      // no content
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Missing required field: content");
  });

  it("updates hypothesis status with autoPromote", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_infer");

    // First create a hypothesis
    const createResult = await execute({
      action: "add_hypothesis",
      content: "Test hypothesis",
    });
    const id = createResult.details.id as string;

    // Then confirm with autoPromote explicitly true
    // Note: when calling execute directly, zod defaults are NOT applied,
    // so we must pass autoPromote: true explicitly
    const result = await execute({
      action: "update_hypothesis",
      id,
      status: "confirmed",
      evidence: "Test evidence confirms the hypothesis",
      reasoning: "All tests passed",
      autoPromote: true,
    });

    expect(result.isError).toBe(false);
    expect(result.details.status).toBe("confirmed");
    expect(result.details.kind).toBe("hypothesis_confirmed");
    // beliefFactId should be set when autoPromote creates a belief fact
    expect(result.details.beliefFactId).toBeTruthy();

    const state = runtime.stateManager.read();
    const hyp = state.inference.hypotheses.find((h) => h.id === id);
    expect(hyp).toBeDefined();
    expect(hyp!.status).toBe("confirmed");
  });

  it("updates hypothesis to refuted status", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_infer");

    const createResult = await execute({
      action: "add_hypothesis",
      content: "Will be refuted",
    });
    const id = createResult.details.id as string;

    const result = await execute({
      action: "update_hypothesis",
      id,
      status: "refuted",
    });

    expect(result.isError).toBe(false);
    expect(result.details.status).toBe("refuted");
    expect(result.details.kind).toBe("hypothesis_refuted");
  });

  it("updates hypothesis to testing status (non-promoted path)", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_infer");

    const createResult = await execute({
      action: "add_hypothesis",
      content: "Will be downgraded",
    });
    const id = createResult.details.id as string;

    // Promote to confirmed first (with autoPromote=true)
    await execute({
      action: "update_hypothesis",
      id,
      status: "confirmed",
      autoPromote: true,
    });

    // Then update to testing — exercises the else branch
    const result = await execute({
      action: "update_hypothesis",
      id,
      status: "testing",
    });

    expect(result.isError).toBe(false);
    expect(result.details.status).toBe("testing");
    expect(result.details.kind).toBe("hypothesis_updated");
  });

  // -------------------------------------------------------------------------
  // Cover lines 128-132: hypothesis not found when confirming
  // -------------------------------------------------------------------------

  it("returns error when confirming non-existent hypothesis", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_infer");

    const result = await execute({
      action: "update_hypothesis",
      id: "nonexistent-id",
      status: "confirmed",
      autoPromote: true,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Hypothesis not found: nonexistent-id");
    expect(result.details.error).toBe("not_found");
  });

  it("returns error when refuting non-existent hypothesis", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_infer");

    const result = await execute({
      action: "update_hypothesis",
      id: "nonexistent-id-2",
      status: "refuted",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Hypothesis not found: nonexistent-id-2");
    expect(result.details.error).toBe("not_found");
  });

  it("returns error when updating non-existent hypothesis to testing", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_infer");

    const result = await execute({
      action: "update_hypothesis",
      id: "does-not-exist",
      status: "testing",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Hypothesis not found: does-not-exist");
    expect(result.details.error).toBe("not_found");
  });

  it("returns error when update_hypothesis missing id and status", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_infer");

    const result = await execute({
      action: "update_hypothesis",
      // no id, no status
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Missing required fields");
  });

  it("adds reasoning step", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_infer");

    const result = await execute({
      action: "add_reasoning",
      content: "After analyzing the logs, the error occurs at line 42",
    });

    expect(result.isError).toBe(false);
    expect(result.content[0]!.text).toContain("Reasoning step recorded:");
    expect(result.details.kind).toBe("reasoning_step");
    expect(result.details.relatesTo).toBeNull();

    const state = runtime.stateManager.read();
    expect(state.inference.reasoning).toHaveLength(1);
  });

  it("adds reasoning step with relatesTo", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_infer");

    // Need an existing hypothesis to relate to
    const createResult = await execute({
      action: "add_hypothesis",
      content: "Related hypothesis",
    });
    const hypId = createResult.details.id as string;

    const result = await execute({
      action: "add_reasoning",
      content: "This reasoning relates to my hypothesis",
      relatesTo: hypId,
    });

    expect(result.isError).toBe(false);
    expect(result.details.relatesTo).toBe(hypId);
    expect(result.content[0]!.text).toContain("Relates to:");

    const state = runtime.stateManager.read();
    expect(state.inference.reasoning[0]!.relatesTo).toBe(hypId);
  });

  it("returns error for add_reasoning without content", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_infer");

    const result = await execute({
      action: "add_reasoning",
      // no content
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Missing required field: content");
  });

  // -------------------------------------------------------------------------
  // Schema is lenient — all fields optional, validation is server-side
  // -------------------------------------------------------------------------

  it("schema parse accepts all valid action configurations", () => {
    const pi = createMockPi();

    // Use the real builder (no .refine())
    const schema = buildInferParams(pi);

    // add_hypothesis without content now passes (no refine)
    expect(() => schema.parse({ action: "add_hypothesis" })).not.toThrow();

    // update_hypothesis without id now passes (no refine)
    expect(() => schema.parse({ action: "update_hypothesis", status: "testing" })).not.toThrow();

    // update_hypothesis without status now passes (no refine)
    expect(() => schema.parse({ action: "update_hypothesis", id: "test" })).not.toThrow();

    // add_reasoning without content now passes (no refine)
    expect(() => schema.parse({ action: "add_reasoning" })).not.toThrow();
  });

});
