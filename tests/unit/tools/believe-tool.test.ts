"use strict";

/**
 * Unit tests for believe-tool.ts — noesis_believe_fact, noesis_believe_decision tools.
 */

import { describe, it, expect, mock } from "bun:test";
import { unlinkSync, existsSync, mkdirSync, mkdtempSync, writeFileSync, utimesSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMockPi, toExtensionAPI } from "../../helpers/mock-pi.js";
import { createRuntime, type NoesisRuntime } from "../../../src/runtime.js";
import { registerBelieveFactTool, registerBelieveDecisionTool } from "../../../src/tools/believe-tool.js";
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

/** Create a temp project root with a graph file over 24h old, for stale-penalty tests. */
function setupTempStaleProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "noesis-stale-"));
  const graphDir = join(dir, "graphify-out");
  mkdirSync(graphDir, { recursive: true });
  writeFileSync(join(graphDir, "graph.json"), "{}");
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
  utimesSync(join(graphDir, "graph.json"), twoDaysAgo, twoDaysAgo);
  return dir;
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

  it("retains to OMP when retainToOmp is set and confidence >= 0.5", async () => {
    const { pi, runtime } = await setup();
    const retainToOmp = mock(() => Promise.resolve());
    runtime.retainToOmp = retainToOmp;
    const execute = toolExecutor(pi, "noesis_believe_fact");

    await execute({
      content: "Test durable fact",
      confidence: 0.8,
      source: "execution",
    });

    expect(retainToOmp).toHaveBeenCalledTimes(1);
    expect(retainToOmp).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining("[noesis/belief] Test durable fact"),
        context: expect.stringMatching(/source: execution/),
      }),
    ]);
  });

  it("does not retain to OMP when confidence below use case minimum", async () => {
    const { pi, runtime } = await setup();
    const retainToOmp = mock(() => Promise.resolve());
    runtime.retainToOmp = retainToOmp;
    const execute = toolExecutor(pi, "noesis_believe_fact");

    await expect(execute({
      content: "Low confidence fact",
      confidence: 0.4,
      source: "inference",
    })).rejects.toThrow("below minimum threshold");

    expect(retainToOmp).not.toHaveBeenCalled();
  });

  it("does not throw when retainToOmp is undefined", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_believe_fact");

    const result = await execute({
      content: "No OMP bridge fact",
      confidence: 0.9,
      source: "user",
    });

    expect(result.isError).toBe(false);
    expect(result.content[0]!.text).toContain("Created fact:");
  });

  // Graph confidence mapping — uncovered line 72
  it("maps graph confidence from EXTRACTED to 1.0", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_believe_fact");

    const result = await execute({
      content: "Graph EXTRACTED fact",
      confidence: 0.5,
      source: "graph",
      graphFinding: {
        query: "test",
        nodes: ["n1"],
        relations: ["r1"],
        confidence: "EXTRACTED",
        timestamp: new Date().toISOString(),
      },
    });

    expect(result.isError).toBe(false);
    const fact = runtime.stateManager.read().belief.facts[0]!;
    expect(fact.confidence).toBe(1.0);
  });

  it("maps graph confidence from AMBIGUOUS to 0.55", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_believe_fact");

    const result = await execute({
      content: "Graph AMBIGUOUS fact",
      confidence: 0.9,
      source: "graph",
      graphFinding: {
        query: "test",
        nodes: ["n1"],
        relations: ["r1"],
        confidence: "AMBIGUOUS",
        timestamp: new Date().toISOString(),
      },
    });

    expect(result.isError).toBe(false);
    const fact = runtime.stateManager.read().belief.facts[0]!;
    expect(fact.confidence).toBe(0.55);
  });

  it("maps graph confidence from INFERRED with default 0.7", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_believe_fact");

    const result = await execute({
      content: "Graph INFERRED fact",
      confidence: 0.5,
      source: "graph",
      graphFinding: {
        query: "test",
        nodes: ["n1"],
        relations: ["r1"],
        confidence: "INFERRED",
        timestamp: new Date().toISOString(),
      },
    });

    expect(result.isError).toBe(false);
    const fact = runtime.stateManager.read().belief.facts[0]!;
    expect(fact.confidence).toBe(0.7);
  });

  // Stale penalty for INFERRED graph findings — uncovered lines 76-79
  it("applies stale penalty of -0.10 for stale INFERRED graph finding", async () => {
    const tmpDir = setupTempStaleProject();
    try {
      const pi = createMockPi();
      const runtime = await createRuntime(toExtensionAPI(pi), tmpDir);
      registerBelieveFactTool(toExtensionAPI(pi), runtime);
      const execute = toolExecutor(pi, "noesis_believe_fact");

      const result = await execute({
        content: "Stale INFERRED graph finding",
        confidence: 0.5,
        source: "graph",
        graphFinding: {
          query: "stale-test",
          nodes: ["n1"],
          relations: ["r1"],
          confidence: "INFERRED",
          timestamp: new Date().toISOString(),
        },
      });

      expect(result.isError).toBe(false);
      const fact = runtime.stateManager.read().belief.facts[0]!;
      // INFERRED → 0.7, stale penalty → max(0.55, 0.7 - 0.10) = 0.6
      expect(fact.confidence).toBe(0.6);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("preserves 0.55 floor when stale penalty would push below it", async () => {
    const tmpDir = setupTempStaleProject();
    try {
      const pi = createMockPi();
      const runtime = await createRuntime(toExtensionAPI(pi), tmpDir);
      registerBelieveFactTool(toExtensionAPI(pi), runtime);
      const execute = toolExecutor(pi, "noesis_believe_fact");

      const result = await execute({
        content: "Stale INFERRED floor preservation",
        confidence: 0.5,
        source: "graph",
        graphFinding: {
          query: "floor-test",
          nodes: ["n1"],
          relations: ["r1"],
          confidence: "INFERRED",
          inferredConfidence: 0.55,
          timestamp: new Date().toISOString(),
        },
      });

      expect(result.isError).toBe(false);
      const fact = runtime.stateManager.read().belief.facts[0]!;
      // INFERRED with inferredConfidence=0.55 → 0.55, stale penalty → max(0.55, 0.55-0.10) = 0.55
      expect(fact.confidence).toBe(0.55);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // Confidence threshold boundary — uncovered retainToOmp edge
  it("retains to OMP when confidence is exactly 0.5 (threshold boundary)", async () => {
    const { pi, runtime } = await setup();
    const retainToOmp = mock(() => Promise.resolve());
    runtime.retainToOmp = retainToOmp;
    const execute = toolExecutor(pi, "noesis_believe_fact");

    await execute({
      content: "Boundary 0.5 fact",
      confidence: 0.5,
      source: "execution",
    });

    expect(retainToOmp).toHaveBeenCalledTimes(1);
  });

  it("does not retain to OMP when confidence below use case minimum", async () => {
    const { pi, runtime } = await setup();
    const retainToOmp = mock(() => Promise.resolve());
    runtime.retainToOmp = retainToOmp;
    const execute = toolExecutor(pi, "noesis_believe_fact");

    await expect(execute({
      content: "Below minimum fact",
      confidence: 0.4,
      source: "inference",
    })).rejects.toThrow("below minimum threshold");

    expect(retainToOmp).not.toHaveBeenCalled();
  });

  // Vault push failure — uncovered graceful catch on lines 101-115
  it("handles vaultStore push failure gracefully", async () => {
    const { pi, runtime } = await setup();
    runtime.vaultStore.push = mock(() => Promise.reject(new Error("Vault unreachable")));
    const execute = toolExecutor(pi, "noesis_believe_fact");

    const result = await execute({
      content: "Vault failure fact",
      confidence: 0.9,
      source: "user",
    });

    expect(result.isError).toBe(false);
    expect(result.content[0]!.text).toContain("Created fact:");
    const state = runtime.stateManager.read();
    expect(state.belief.facts).toHaveLength(1);
  });

  // Fact retrieval failure — uncovered line 88
  it("throws when created fact cannot be retrieved from state", async () => {
    const { pi, runtime } = await setup();
    /* read() is called once in executeBeliefFact (line 86) after UoW commit.
       createUnitOfWork accesses #state internally, so mocking read() to return
       empty state safely triggers the retrieval failure path. */
    runtime.stateManager.read = (() =>
      ({ ...EMPTY_STATE, belief: { facts: [], decisions: [] } } as any)
    ) as any;

    const execute = toolExecutor(pi, "noesis_believe_fact");

    await expect(execute({
      content: "Lost fact",
      confidence: 0.9,
      source: "user",
    })).rejects.toThrow("Failed to retrieve created fact");
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

  // Decision retrieval failure — uncovered line 185
  it("throws when created decision cannot be retrieved from state", async () => {
    const { pi, runtime } = await setup();
    /* read() is called once in executeBeliefDecision (line 183) after UoW commit.
       Mock it to return empty state to trigger the retrieval failure path. */
    runtime.stateManager.read = (() =>
      ({ ...EMPTY_STATE, belief: { facts: [], decisions: [] } } as any)
    ) as any;

    const execute = toolExecutor(pi, "noesis_believe_decision");

    await expect(execute({
      content: "Lost decision",
      rationale: "Because",
      source: "user",
    })).rejects.toThrow("Failed to retrieve created decision");
  });
});

