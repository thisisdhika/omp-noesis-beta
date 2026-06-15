"use strict";

/**
 * Integration tests for tool registration and execution via mock ExtensionAPI.
 *
 * Verifies that all 7 noesis tools register correctly and each tool's execute
 * handler produces expected side effects on cognitive state.
 */

import { describe, it, expect } from "bun:test";
import type { LearningEntry } from "../../src/schema.js";
import { generateId } from "../../src/schema.js";
import { now } from "../../src/shared/time.js";
import { cleanPersistedState } from "../helpers/fixtures.js";
import { createMockPi, toExtensionAPI, type MockPi } from "../helpers/mock-pi.js";
import { createRuntime, type NoesisRuntime } from "../../src/runtime.js";
import { registerTools } from "../../src/tools/index.js";
import { EMPTY_STATE } from "../../src/schema.js";
import { deepClone } from "../../src/shared/clone.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape returned by tool execute handlers. */
interface ToolExecuteResult {
  content: Array<{ type: string; text: string }>;
  details: Record<string, unknown>;
  isError: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


/**
 * Build a mock pi, create runtime, register tools.
 * Resets state first for test isolation.
 */
async function setup(): Promise<{ pi: MockPi; runtime: NoesisRuntime }> {
  cleanPersistedState();

  const pi = createMockPi();
  const runtime = await createRuntime(toExtensionAPI(pi));
  registerTools(toExtensionAPI(pi), runtime);

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
  const def = pi._getTool(name);
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

// ===========================================================================
// Additional noesis_believe coverage — decision, learning, contradictions
// ===========================================================================

describe("noesis_believe decision", () => {
  it("creates a belief decision with type=decision", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_believe");

    const result = await execute({
      type: "decision",
      content: "Use Bun runtime for production",
      rationale: "Better performance and TypeScript support",
      source: "user",
      tags: ["architecture"],
    });

    expect(result.isError).toBe(false);
    expect(result.details.kind).toBe("decision");

    const state = runtime.stateManager.read();
    expect(state.belief.decisions).toHaveLength(1);
    expect(state.belief.decisions[0]!.content).toBe("Use Bun runtime for production");
    expect(state.belief.decisions[0]!.rationale).toBe("Better performance and TypeScript support");
    expect(state.belief.decisions[0]!.source).toBe("user");
  });

  it("returns error when missing rationale for decision", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_believe");

    const result = await execute({
      type: "decision",
      content: "Use Bun runtime",
      source: "user",
    });

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("missing_fields");
    expect(result.content[0]!.text).toContain("Missing required fields");
  });

  it("creates decision with alternatives", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_believe");

    const result = await execute({
      type: "decision",
      content: "Adopt Bun as primary runtime",
      rationale: "Best overall fit for the project",
      source: "user",
      alternatives: ["Node.js LTS", "Deno"],
    });

    expect(result.isError).toBe(false);
    expect(result.details.kind).toBe("decision");

    const state = runtime.stateManager.read();
    expect(state.belief.decisions[0]!.alternatives).toHaveLength(2);
    expect(state.belief.decisions[0]!.alternatives).toContain("Node.js LTS");
  });
});

describe("noesis_believe learning", () => {
  it("resolves learning into belief fact with type=learning", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_believe");

    // Arrange — seed a learning failure entry
    const learningId = "test-learning-1";
    await runtime.stateManager.mutate((state) => {
      state.learning.failures.push({
        id: learningId,
        status: "captured",
        description: "Module resolution failed for @scope/package",
        capturedAt: now(),
      });
    });

    // Act — promote learning to belief
    const result = await execute({
      type: "learning",
      learningId,
      rootCause: "Missing export map in package.json",
      fix: "Add exports field to package.json",
    });

    expect(result.isError).toBe(false);
    expect(result.details.kind).toBe("fact (from learning)");

    const state = runtime.stateManager.read();
    expect(state.belief.facts).toHaveLength(1);
    expect(state.belief.facts[0]!.content).toContain("Module resolution failed");
    expect(state.belief.facts[0]!.content).toContain("Missing export map");
    expect(state.belief.facts[0]!.source).toBe("inference");
  });

  it("returns error when missing learningId", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_believe");

    const result = await execute({
      type: "learning",
      rootCause: "Missing config",
      fix: "Add config file",
    });

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("missing_fields");
    expect(result.content[0]!.text).toContain("learningId");
  });

  it("returns error when missing rootCause", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_believe");

    const result = await execute({
      type: "learning",
      learningId: "test-l-1",
      fix: "Fix the issue",
    });

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("missing_fields");
    expect(result.content[0]!.text).toContain("rootCause");
  });
});

describe("noesis_believe contradictions", () => {
  it("supersedes contradicting facts when contradictsIds provided", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_believe");

    // Arrange — create fact A
    const resultA = await execute({
      type: "fact",
      content: "The database timeout is 30 seconds",
      confidence: 0.9,
      source: "execution",
    });
    expect(resultA.isError).toBe(false);
    const factAId = resultA.details.id as string;

    // Act — create fact B that contradicts fact A
    const resultB = await execute({
      type: "fact",
      content: "The database timeout is 60 seconds",
      confidence: 0.95,
      source: "user",
      contradictsIds: [factAId],
    });
    expect(resultB.isError).toBe(false);
    const factBId = resultB.details.id as string;

    // Assert — original fact is superseded
    const state = runtime.stateManager.read();
    const factA = state.belief.facts.find((f) => f.id === factAId);
    expect(factA).toBeDefined();
    expect(factA!.status).toBe("superseded");
    expect(factA!.supersededBy).toBe(factBId);

    // New fact is active
    const factB = state.belief.facts.find((f) => f.id === factBId);
    expect(factB).toBeDefined();
    expect(factB!.status).toBe("active");
  });
});

describe("noesis_believe errors", () => {
  it("returns error when type=fact missing content", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_believe");

    const result = await execute({
      type: "fact",
      confidence: 0.9,
      source: "user",
    });

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("missing_fields");
    expect(result.content[0]!.text).toContain("Missing required fields for fact");
  });

  it("returns error when type=fact missing confidence", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_believe");

    const result = await execute({
      type: "fact",
      content: "Some fact without confidence",
      source: "user",
    });

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("missing_fields");
    expect(result.content[0]!.text).toContain("Missing required fields for fact");
  });

  it("returns error when type=decision missing content", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_believe");

    const result = await execute({
      type: "decision",
      rationale: "Some rationale without content",
      source: "user",
    });

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("missing_fields");
    expect(result.content[0]!.text).toContain("Missing required fields for decision");
  });
});

// ===========================================================================
// Additional noesis_infer coverage — update, reasoning, errors
// ===========================================================================

describe("noesis_infer update", () => {
  it("updates hypothesis status with action=update_hypothesis", async () => {
    const { pi, runtime } = await setup();
    const infer = toolExecutor(pi, "noesis_infer");

    // Arrange — create a hypothesis
    const createResult = await infer({
      action: "add_hypothesis",
      content: "The bug is in the caching layer",
      tags: ["performance"],
    });
    const hypothesisId = createResult.details.id as string;

    // Act — update its status to testing (same status, just exercising the path)
    const result = await infer({
      action: "update_hypothesis",
      id: hypothesisId,
      status: "testing",
    });

    expect(result.isError).toBe(false);
    expect(result.details.kind).toBe("hypothesis_updated");
    expect(result.details.status).toBe("testing");

    const state = runtime.stateManager.read();
    const updated = state.inference.hypotheses.find((h) => h.id === hypothesisId);
    expect(updated).toBeDefined();
    expect(updated!.status).toBe("testing");
  });

  it("confirms hypothesis and auto-promotes to belief fact", async () => {
    const { pi, runtime } = await setup();
    const infer = toolExecutor(pi, "noesis_infer");

    // Arrange — create a hypothesis
    const createResult = await infer({
      action: "add_hypothesis",
      content: "Memory leak is caused by unclosed listeners",
      tags: ["memory"],
    });
    const hypothesisId = createResult.details.id as string;
    // Act — confirm with auto-promote (default true, but pass explicitly since we call raw execute)
    const result = await infer({
      action: "update_hypothesis",
      id: hypothesisId,
      status: "confirmed",
      autoPromote: true,
    });

    expect(result.isError).toBe(false);
    expect(result.details.kind).toBe("hypothesis_confirmed");
    expect(result.details.beliefFactId).not.toBeNull();

    const state = runtime.stateManager.read();
    const hypothesis = state.inference.hypotheses.find((h) => h.id === hypothesisId);
    expect(hypothesis).toBeDefined();
    expect(hypothesis!.status).toBe("confirmed");
    expect(hypothesis!.relatedBeliefId).toBeDefined();

    // Belief fact was created from hypothesis
    expect(state.belief.facts).toHaveLength(1);
    expect(state.belief.facts[0]!.content).toBe("Memory leak is caused by unclosed listeners");
    expect(state.belief.facts[0]!.source).toBe("inference");
  });

  it("refutes hypothesis", async () => {
    const { pi, runtime } = await setup();
    const infer = toolExecutor(pi, "noesis_infer");

    // Arrange — create a hypothesis
    const createResult = await infer({
      action: "add_hypothesis",
      content: "The API returns stale data",
      tags: ["api"],
    });
    const hypothesisId = createResult.details.id as string;

    // Act — refute it
    const result = await infer({
      action: "update_hypothesis",
      id: hypothesisId,
      status: "refuted",
    });

    expect(result.isError).toBe(false);
    expect(result.details.kind).toBe("hypothesis_refuted");
    expect(result.details.status).toBe("refuted");

    const state = runtime.stateManager.read();
    const hypothesis = state.inference.hypotheses.find((h) => h.id === hypothesisId);
    expect(hypothesis!.status).toBe("refuted");
  });

  it("adds reasoning step during update", async () => {
    const { pi, runtime } = await setup();
    const infer = toolExecutor(pi, "noesis_infer");

    // Arrange — create a hypothesis
    const createResult = await infer({
      action: "add_hypothesis",
      content: "The error is due to a race condition",
    });
    const hypothesisId = createResult.details.id as string;

    // Act — update with reasoning step
    const result = await infer({
      action: "update_hypothesis",
      id: hypothesisId,
      status: "testing",
      reasoning: "Added log statements and observed interleaving writes",
    });

    expect(result.isError).toBe(false);

    // Verify reasoning step was added
    const state = runtime.stateManager.read();
    expect(state.inference.reasoning).toHaveLength(1);
    expect(state.inference.reasoning[0]!.content).toBe(
      "Added log statements and observed interleaving writes",
    );
    expect(state.inference.reasoning[0]!.relatesTo).toBe(hypothesisId);
  });

  it("returns error when hypothesis not found", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_infer");

    const result = await execute({
      action: "update_hypothesis",
      id: "nonexistent-hypothesis-123",
      status: "confirmed",
    });

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("not_found");
    expect(result.content[0]!.text).toContain("Hypothesis not found");
  });

  it("returns error when missing id", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_infer");

    const result = await execute({
      action: "update_hypothesis",
      status: "confirmed",
    });

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("missing_fields");
    expect(result.content[0]!.text).toContain("Missing required fields");
  });
});

describe("noesis_infer reasoning", () => {
  it("adds reasoning step with action=add_reasoning", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_infer");

    const result = await execute({
      action: "add_reasoning",
      content: "Based on stack trace analysis, the null pointer originates in the deserializer",
    });

    expect(result.isError).toBe(false);
    expect(result.details.kind).toBe("reasoning_step");

    const state = runtime.stateManager.read();
    expect(state.inference.reasoning).toHaveLength(1);
    expect(state.inference.reasoning[0]!.content).toBe(
      "Based on stack trace analysis, the null pointer originates in the deserializer",
    );
  });

  it("links reasoning step to hypothesis via relatesTo", async () => {
    const { pi, runtime } = await setup();
    const infer = toolExecutor(pi, "noesis_infer");

    // Arrange — create a hypothesis to link to
    const createResult = await infer({
      action: "add_hypothesis",
      content: "Deserialization fails on malformed input",
      tags: ["bug"],
    });
    const hypothesisId = createResult.details.id as string;

    // Act — add reasoning linked to the hypothesis
    const result = await infer({
      action: "add_reasoning",
      content: "Reproduced with empty payload — missing null check",
      relatesTo: hypothesisId,
    });

    expect(result.isError).toBe(false);
    expect(result.details.relatesTo).toBe(hypothesisId);

    const state = runtime.stateManager.read();
    expect(state.inference.reasoning).toHaveLength(1);
    expect(state.inference.reasoning[0]!.relatesTo).toBe(hypothesisId);
  });

  it("returns error when missing content", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_infer");

    const result = await execute({
      action: "add_reasoning",
    });

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("missing_fields");
    expect(result.content[0]!.text).toContain("Missing required field");
  });
});

// ===========================================================================
// Additional noesis_commit coverage — replace, update_step, add_action
// ===========================================================================

describe("noesis_commit replace", () => {
  it("replaces workflow with mode=replace_workflow", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_commit");

    const result = await execute({
      mode: "replace_workflow",
      goal: "Migrate to Bun v2",
      steps: [
        { description: "Update imports" },
        { description: "Fix breaking changes" },
      ],
    });

    expect(result.isError).toBe(false);
    expect(result.details.kind).toBe("workflow_replaced");
    expect(result.details.stepCount).toBe(2);

    const state = runtime.stateManager.read();
    expect(state.commitment.workflow.goal).toBe("Migrate to Bun v2");
    expect(state.commitment.workflow.steps).toHaveLength(2);
    expect(state.commitment.workflow.status).toBe("active");
  });

  it("returns error when missing goal for replace", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_commit");

    const result = await execute({
      mode: "replace_workflow",
      steps: [{ description: "Some step" }],
    });

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("missing_fields");
    expect(result.content[0]!.text).toContain("Missing required fields");
  });
});

describe("noesis_commit update_step", () => {
  it("updates step status with mode=update_step", async () => {
    const { pi, runtime } = await setup();
    const commit = toolExecutor(pi, "noesis_commit");

    // Arrange — create a workflow with steps
    const extendResult = await commit({
      mode: "extend_workflow",
      steps: [
        { description: "Research Bun APIs" },
        { description: "Draft migration plan" },
      ],
    });
    const stepId = extendResult.details.id as string;

    // Read state to get the actual step id
    let state = runtime.stateManager.read();
    const firstStepId = state.commitment.workflow.steps[0]!.id;

    // Act — update the first step
    const result = await commit({
      mode: "update_step",
      stepId: firstStepId,
      status: "active",
    });

    expect(result.isError).toBe(false);
    expect(result.details.status).toBe("active");

    state = runtime.stateManager.read();
    const updatedStep = state.commitment.workflow.steps.find((s) => s.id === firstStepId);
    expect(updatedStep).toBeDefined();
    expect(updatedStep!.status).toBe("active");
  });

  it("returns error when step not found", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_commit");

    const result = await execute({
      mode: "update_step",
      stepId: "nonexistent-step-999",
      status: "done",
    });

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("not_found");
    expect(result.content[0]!.text).toContain("Step not found");
  });

  it("returns error when missing stepId", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_commit");

    const result = await execute({
      mode: "update_step",
      status: "done",
    });

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("missing_fields");
    expect(result.content[0]!.text).toContain("Missing required fields");
  });
});

describe("noesis_commit add_action", () => {
  it("adds planned action with mode=add_action", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_commit");

    const result = await execute({
      mode: "add_action",
      content: "Review Bun v2 migration guide",
      priority: "high",
    });

    expect(result.isError).toBe(false);
    expect(result.details.kind).toBe("planned_action");
    expect(result.details.priority).toBe("high");

    const state = runtime.stateManager.read();
    expect(state.commitment.actions).toHaveLength(1);
    expect(state.commitment.actions[0]!.content).toBe("Review Bun v2 migration guide");
  });

  it("returns error when missing content", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_commit");

    const result = await execute({
      mode: "add_action",
      priority: "normal",
    });

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("missing_fields");
    expect(result.content[0]!.text).toContain("Missing required field");
  });
});

// ===========================================================================
// Additional noesis_recall coverage — all query variants
// ===========================================================================

describe("noesis_recall decisions", () => {
  it("returns active decisions", async () => {
    const { pi } = await setup();

    // Arrange — seed a decision
    const believe = toolExecutor(pi, "noesis_believe");
    await believe({
      type: "decision",
      content: "Use Postgres for primary storage",
      rationale: "ACID compliance and ecosystem maturity",
      source: "user",
    });

    // Act
    const recall = toolExecutor(pi, "noesis_recall");
    const result = await recall({
      query: "active_decisions",
    });

    expect(result.isError).toBe(false);
    expect(result.details.count).toBeGreaterThanOrEqual(1);
    expect(result.details.query).toBe("active_decisions");
    expect(result.content[0]!.text).toContain("Use Postgres for primary storage");
  });
});

describe("noesis_recall hypotheses", () => {
  it("returns unresolved hypotheses", async () => {
    const { pi } = await setup();

    // Arrange — create a hypothesis
    const infer = toolExecutor(pi, "noesis_infer");
    await infer({
      action: "add_hypothesis",
      content: "Latency is caused by DNS resolution",
      tags: ["networking"],
    });

    // Act
    const recall = toolExecutor(pi, "noesis_recall");
    const result = await recall({
      query: "unresolved_hypotheses",
    });

    expect(result.isError).toBe(false);
    expect(result.details.count).toBeGreaterThanOrEqual(1);
    expect(result.content[0]!.text).toContain("Latency is caused by DNS resolution");
  });

  it("filters hypotheses by tag", async () => {
    const { pi } = await setup();
    const infer = toolExecutor(pi, "noesis_infer");

    // Create two hypotheses with different tags
    await infer({
      action: "add_hypothesis",
      content: "Hypothesis tagged with database",
      tags: ["database"],
    });
    await infer({
      action: "add_hypothesis",
      content: "Hypothesis tagged with networking",
      tags: ["networking"],
    });

    // Act — filter by database tag
    const recall = toolExecutor(pi, "noesis_recall");
    const result = await recall({
      query: "unresolved_hypotheses",
      tagFilter: ["database"],
    });

    expect(result.isError).toBe(false);
    expect(result.details.count).toBe(1);
    expect(result.content[0]!.text).toContain("Hypothesis tagged with database");
    expect(result.content[0]!.text).not.toContain("Hypothesis tagged with networking");
  });
});

describe("noesis_recall learning", () => {
  it("returns relevant learning entries with query=relevant_learning", async () => {
    const { pi, runtime } = await setup();

    // Arrange — seed learning entries
    await runtime.stateManager.mutate((state) => {
      state.learning.failures.push({
        id: "learn-1",
        description: "Connection pool exhaustion under load",
        status: "captured",
        skillScope: "database",
        capturedAt: now(),
      });
      state.learning.successes.push({
        id: "learn-2",
        description: "Implementing connection retry improved reliability",
        status: "captured",
        skillScope: "database",
        capturedAt: now(),
      });
    });

    // Act
    const recall = toolExecutor(pi, "noesis_recall");
    const result = await recall({
      query: "relevant_learning",
      limit: 5,
    });

    expect(result.isError).toBe(false);
    expect(result.details.query).toBe("relevant_learning");
    expect(result.details.topCount).toBeGreaterThanOrEqual(1);
    expect(result.content[0]!.text).toContain("Connection pool exhaustion");
  });

  it("filters learning by skillScope", async () => {
    const { pi, runtime } = await setup();

    // Arrange — seed learning entries with different scopes
    await runtime.stateManager.mutate((state) => {
      state.learning.failures.push({
        id: "learn-3",
        description: "Database migration failed",
        status: "captured",
        skillScope: "database",
        capturedAt: now(),
      });
      state.learning.failures.push({
        id: "learn-4",
        description: "TypeScript build error",
        status: "captured",
        skillScope: "typescript",
        capturedAt: now(),
      });
    });

    // Act — filter by database skillScope
    const recall = toolExecutor(pi, "noesis_recall");
    const result = await recall({
      query: "relevant_learning",
      skillScope: "database",
      limit: 10,
    });

    expect(result.isError).toBe(false);
    // topCount should only include database-scoped entries
    expect(result.details.topCount).toBe(1);
    expect(result.content[0]!.text).toContain("Database migration failed");
  });
});

describe("noesis_recall workflow", () => {
  it("returns current workflow with query=current_workflow", async () => {
    const { pi } = await setup();

    // Arrange — set up a workflow via commit
    const commit = toolExecutor(pi, "noesis_commit");
    await commit({
      mode: "replace_workflow",
      goal: "Deploy to production",
      steps: [
        { description: "Run integration tests" },
        { description: "Build Docker image" },
        { description: "Deploy to staging" },
      ],
      status: "active",
    });

    // Act
    const recall = toolExecutor(pi, "noesis_recall");
    const result = await recall({
      query: "current_workflow",
    });

    expect(result.isError).toBe(false);
    expect(result.details.query).toBe("current_workflow");
    expect(result.details.goal).toBe("Deploy to production");
    expect(result.details.stepCount).toBe(3);
    expect(result.content[0]!.text).toContain("Deploy to production");
    expect(result.content[0]!.text).toContain("Run integration tests");
  });

  it("returns empty workflow response when no workflow", async () => {
    const { pi, runtime } = await setup();

    // Arrange — use the empty default state
    const recall = toolExecutor(pi, "noesis_recall");

    // The EMPTY_STATE has a workflow object with empty fields — verify it still works
    const result = await recall({
      query: "current_workflow",
    });

    expect(result.isError).toBe(false);
    expect(result.details.query).toBe("current_workflow");
    expect(result.content[0]!.text).toBeDefined();
  });
});

describe("noesis_recall digest", () => {
  it("returns full state digest with query=full_state_digest", async () => {
    const { pi, runtime } = await setup();

    // Arrange — seed some data across layers
    const believe = toolExecutor(pi, "noesis_believe");
    await believe({
      type: "fact",
      content: "Production uses 4 vCPUs",
      confidence: 0.95,
      source: "execution",
    });

    const infer = toolExecutor(pi, "noesis_infer");
    await infer({
      action: "add_hypothesis",
      content: "CPU bottleneck at 1000 req/s",
      tags: ["performance"],
    });

    // Act
    const recall = toolExecutor(pi, "noesis_recall");
    const result = await recall({
      query: "full_state_digest",
    });

    expect(result.isError).toBe(false);
    expect(result.details.query).toBe("full_state_digest");
    expect(result.details.activeFactCount).toBeGreaterThanOrEqual(1);
    expect(result.details.unresolvedHypothesisCount).toBeGreaterThanOrEqual(1);
    expect(result.content[0]!.text).toContain("Noesis State Digest");
    expect(result.content[0]!.text).toContain("Production uses 4 vCPUs");
    expect(result.content[0]!.text).toContain("CPU bottleneck at 1000 req/s");
  });
});

describe("noesis_recall search", () => {
  it("searches across all layers with query=search", async () => {
    const { pi } = await setup();

    // Arrange — seed data with a keyword
    const believe = toolExecutor(pi, "noesis_believe");
    await believe({
      type: "fact",
      content: "Database connection limit is 100",
      confidence: 0.9,
      source: "execution",
    });

    // Act — search for "Database"
    const recall = toolExecutor(pi, "noesis_recall");
    const result = await recall({
      query: "search",
      keyword: "Database",
      limit: 5,
    });

    expect(result.isError).toBe(false);
    expect(result.details.query).toBe("search");
    expect(result.details.totalMatches).toBeGreaterThanOrEqual(1);
    expect(result.content[0]!.text).toContain("Database connection limit is 100");
  });

  it("returns error when missing keyword for search", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_recall");

    const result = await execute({
      query: "search",
    });

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("missing_fields");
    expect(result.content[0]!.text).toContain("Missing required field: keyword");
  });
});

// ===========================================================================
// Zod refine validator tests
// ===========================================================================

describe("noesis_believe refine", () => {
  it("passes refinement for valid fact", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_believe") as Record<string, unknown>;
    const schema = def.parameters as { safeParse: (d: unknown) => { success: boolean } };
    const result = schema.safeParse({
      type: "fact",
      content: "The sky is blue",
      confidence: 0.9,
      source: "user",
    });
    expect(result.success).toBe(true);
  });

  it("rejects fact without confidence in refine", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_believe") as Record<string, unknown>;
    const schema = def.parameters as { safeParse: (d: unknown) => { success: boolean; error?: unknown } };
    const result = schema.safeParse({
      type: "fact",
      content: "The sky is blue",
      source: "user",
    });
    expect(result.success).toBe(false);
  });

  it("rejects fact without content", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_believe") as Record<string, unknown>;
    const schema = def.parameters as { safeParse: (d: unknown) => { success: boolean } };
    const result = schema.safeParse({
      type: "fact",
      confidence: 0.9,
      source: "user",
    });
    expect(result.success).toBe(false);
  });

  it("rejects fact without source", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_believe") as Record<string, unknown>;
    const schema = def.parameters as { safeParse: (d: unknown) => { success: boolean } };
    const result = schema.safeParse({
      type: "fact",
      content: "Some fact",
      confidence: 0.8,
    });
    expect(result.success).toBe(false);
  });

  it("passes refinement for valid decision", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_believe") as Record<string, unknown>;
    const schema = def.parameters as { safeParse: (d: unknown) => { success: boolean } };
    const result = schema.safeParse({
      type: "decision",
      content: "Use Bun",
      rationale: "Performance",
      source: "user",
    });
    expect(result.success).toBe(true);
  });

  it("rejects decision without rationale", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_believe") as Record<string, unknown>;
    const schema = def.parameters as { safeParse: (d: unknown) => { success: boolean } };
    const result = schema.safeParse({
      type: "decision",
      content: "Use Bun",
      source: "user",
    });
    expect(result.success).toBe(false);
  });

  it("passes refinement for valid learning", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_believe") as Record<string, unknown>;
    const schema = def.parameters as { safeParse: (d: unknown) => { success: boolean } };
    const result = schema.safeParse({
      type: "learning",
      learningId: "learn-1",
      rootCause: "Missing config",
      fix: "Add config file",
    });
    expect(result.success).toBe(true);
  });

  it("rejects learning without fix", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_believe") as Record<string, unknown>;
    const schema = def.parameters as { safeParse: (d: unknown) => { success: boolean } };
    const result = schema.safeParse({
      type: "learning",
      learningId: "learn-1",
      rootCause: "Missing config",
    });
    expect(result.success).toBe(false);
  });
});

describe("noesis_commit refine", () => {
  it("passes refinement for valid extend_workflow", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_commit") as Record<string, unknown>;
    const schema = def.parameters as { safeParse: (d: unknown) => { success: boolean } };
    const result = schema.safeParse({
      mode: "extend_workflow",
      steps: [{ description: "Do something" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects extend_workflow without steps", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_commit") as Record<string, unknown>;
    const schema = def.parameters as { safeParse: (d: unknown) => { success: boolean } };
    const result = schema.safeParse({
      mode: "extend_workflow",
    });
    expect(result.success).toBe(false);
  });

  it("rejects extend_workflow with empty steps", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_commit") as Record<string, unknown>;
    const schema = def.parameters as { safeParse: (d: unknown) => { success: boolean } };
    const result = schema.safeParse({
      mode: "extend_workflow",
      steps: [],
    });
    expect(result.success).toBe(false);
  });

  it("passes refinement for valid replace_workflow", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_commit") as Record<string, unknown>;
    const schema = def.parameters as { safeParse: (d: unknown) => { success: boolean } };
    const result = schema.safeParse({
      mode: "replace_workflow",
      goal: "New goal",
      steps: [{ description: "Step 1" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects replace_workflow without goal", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_commit") as Record<string, unknown>;
    const schema = def.parameters as { safeParse: (d: unknown) => { success: boolean } };
    const result = schema.safeParse({
      mode: "replace_workflow",
      steps: [{ description: "Step 1" }],
    });
    expect(result.success).toBe(false);
  });

  it("passes refinement for valid update_step", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_commit") as Record<string, unknown>;
    const schema = def.parameters as { safeParse: (d: unknown) => { success: boolean } };
    const result = schema.safeParse({
      mode: "update_step",
      stepId: "ws-1",
      status: "done",
    });
    expect(result.success).toBe(true);
  });

  it("rejects update_step without stepId", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_commit") as Record<string, unknown>;
    const schema = def.parameters as { safeParse: (d: unknown) => { success: boolean } };
    const result = schema.safeParse({
      mode: "update_step",
      status: "done",
    });
    expect(result.success).toBe(false);
  });

  it("passes refinement for valid add_action", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_commit") as Record<string, unknown>;
    const schema = def.parameters as { safeParse: (d: unknown) => { success: boolean } };
    const result = schema.safeParse({
      mode: "add_action",
      content: "Do the thing",
    });
    expect(result.success).toBe(true);
  });

  it("rejects add_action without content", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_commit") as Record<string, unknown>;
    const schema = def.parameters as { safeParse: (d: unknown) => { success: boolean } };
    const result = schema.safeParse({
      mode: "add_action",
    });
    expect(result.success).toBe(false);
  });
});

describe("noesis_infer refine", () => {
  it("passes refinement for valid add_hypothesis", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_infer") as Record<string, unknown>;
    const schema = def.parameters as { safeParse: (d: unknown) => { success: boolean } };
    const result = schema.safeParse({
      action: "add_hypothesis",
      content: "A hypothesis",
    });
    expect(result.success).toBe(true);
  });

  it("rejects add_hypothesis without content", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_infer") as Record<string, unknown>;
    const schema = def.parameters as { safeParse: (d: unknown) => { success: boolean } };
    const result = schema.safeParse({
      action: "add_hypothesis",
    });
    expect(result.success).toBe(false);
  });

  it("passes refinement for valid update_hypothesis", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_infer") as Record<string, unknown>;
    const schema = def.parameters as { safeParse: (d: unknown) => { success: boolean } };
    const result = schema.safeParse({
      action: "update_hypothesis",
      id: "hyp-1",
      status: "confirmed",
    });
    expect(result.success).toBe(true);
  });

  it("rejects update_hypothesis without id", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_infer") as Record<string, unknown>;
    const schema = def.parameters as { safeParse: (d: unknown) => { success: boolean } };
    const result = schema.safeParse({
      action: "update_hypothesis",
      status: "confirmed",
    });
    expect(result.success).toBe(false);
  });

  it("passes refinement for valid add_reasoning", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_infer") as Record<string, unknown>;
    const schema = def.parameters as { safeParse: (d: unknown) => { success: boolean } };
    const result = schema.safeParse({
      action: "add_reasoning",
      content: "Because of X",
    });
    expect(result.success).toBe(true);
  });

  it("rejects add_reasoning without content", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_infer") as Record<string, unknown>;
    const schema = def.parameters as { safeParse: (d: unknown) => { success: boolean } };
    const result = schema.safeParse({
      action: "add_reasoning",
    });
    expect(result.success).toBe(false);
  });
});

describe("noesis_recall refine", () => {
  it("passes refinement for search with keyword", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_recall") as Record<string, unknown>;
    const schema = def.parameters as { safeParse: (d: unknown) => { success: boolean } };
    const result = schema.safeParse({
      query: "search",
      keyword: "database",
    });
    expect(result.success).toBe(true);
  });

  it("rejects search without keyword", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_recall") as Record<string, unknown>;
    const schema = def.parameters as { safeParse: (d: unknown) => { success: boolean } };
    const result = schema.safeParse({
      query: "search",
    });
    expect(result.success).toBe(false);
  });

  it("passes refinement for non-search queries without keyword", async () => {
    const { pi } = await setup();
    const def = pi._getTool("noesis_recall") as Record<string, unknown>;
    const schema = def.parameters as { safeParse: (d: unknown) => { success: boolean } };
    const result = schema.safeParse({
      query: "active_beliefs",
    });
    expect(result.success).toBe(true);
  });
});

// ===========================================================================
// Additional tool edge-case tests
// ===========================================================================

describe("noesis_attend graph queries", () => {
  it("handles graph query execution (graceful no-graph fallback)", async () => {
    const { pi, runtime } = await setup();
    const execute = toolExecutor(pi, "noesis_attend");

    const result = await execute({
      focus: "Investigate architecture",
      graphQueries: ["What is the dependency structure?"],
    });

    expect(result.isError).toBe(false);
    expect(result.details.graphQueryCount).toBe(1);
    // findingsCount is 0 because graphify CLI is not available in tests
    expect(result.details.findingsCount).toBe(0);
    expect(result.content[0]!.text).toContain("Graph queries run: 1");
  });

  it("handles multiple graph queries", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_attend");

    const result = await execute({
      focus: "Analyze codebase",
      graphQueries: ["Query 1", "Query 2", "Query 3"],
    });

    expect(result.isError).toBe(false);
    expect(result.details.graphQueryCount).toBe(3);
    expect(result.details.findingsCount).toBe(0);
    expect(result.content[0]!.text).toContain("Graph queries run: 3");
  });
});

describe("noesis_commit execute edge cases", () => {
  it("returns error for extend_workflow with no steps via executor", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_commit");

    const result = await execute({
      mode: "extend_workflow",
    });

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("missing_fields");
    expect(result.content[0]!.text).toContain("Missing required field: steps");
  });
});

describe("noesis_infer execute edge cases", () => {
  it("returns error for add_hypothesis with missing content", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_infer");

    const result = await execute({
      action: "add_hypothesis",
    });

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("missing_fields");
    expect(result.details.action).toBe("add_hypothesis");
    expect(result.content[0]!.text).toContain("Missing required field: content");
  });

  it("returns error for refute with missing id", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_infer");

    const result = await execute({
      action: "update_hypothesis",
      status: "refuted",
    });

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("missing_fields");
  });

  it("returns error when refuting nonexistent hypothesis", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_infer");

    const result = await execute({
      action: "update_hypothesis",
      id: "hyp-nonexistent-999",
      status: "refuted",
    });

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("not_found");
    expect(result.content[0]!.text).toContain("Hypothesis not found");
  });

  it("returns error for add_reasoning with missing content", async () => {
    const { pi } = await setup();
    const execute = toolExecutor(pi, "noesis_infer");

    const result = await execute({
      action: "add_reasoning",
    });

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("missing_fields");
    expect(result.content[0]!.text).toContain("Missing required field: content");
  });
});

describe("noesis_recall current_workflow no workflow", () => {
  it("returns no-workflow response when workflow is undefined", async () => {
    const { pi, runtime } = await setup();

    // Set workflow to undefined to trigger the uncovered path
    await runtime.stateManager.mutate((state) => {
      (state.commitment as Record<string, unknown>).workflow = undefined;
    });

    const recall = toolExecutor(pi, "noesis_recall");
    const result = await recall({
      query: "current_workflow",
    });

    expect(result.isError).toBe(false);
    expect(result.details.query).toBe("current_workflow");
    expect(result.details.hasWorkflow).toBe(false);
    expect(result.content[0]!.text).toBe("No active workflow.");
  });
});

describe("noesis_recall search edge cases", () => {
  it("matches decisions by alternatives", async () => {
    const { pi, runtime } = await setup();

    // Seed a decision where only the alternatives match the keyword
    await runtime.stateManager.mutate((state) => {
      state.belief.decisions.push({
        id: "dec-alt-1",
        content: "Use primary runtime",          // no "XYZ" keyword
        rationale: "Best performance",             // no "XYZ" keyword
        alternatives: ["Node.js XYZ", "Deno"],     // "XYZ" matches
        source: "user",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "active",
      });
    });

    const recall = toolExecutor(pi, "noesis_recall");
    const result = await recall({
      query: "search",
      keyword: "XYZ",
    });

    expect(result.isError).toBe(false);
    expect(result.details.totalMatches).toBe(1);
    const results = result.details.results as Array<{ kind: string }>;
    expect(results[0]!.kind).toBe("decision");
  });

  it("matches hypotheses by evidence", async () => {
    const { pi, runtime } = await setup();

    // Seed a hypothesis where only the evidence matches
    await runtime.stateManager.mutate((state) => {
      state.inference.hypotheses.push({
        id: "hyp-evidence-1",
        content: "The app crashes",               // no "EVIDENCE_MATCH" keyword
        status: "testing",
        evidence: "Observed EVIDENCE_MATCH in logs",
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    const recall = toolExecutor(pi, "noesis_recall");
    const result = await recall({
      query: "search",
      keyword: "EVIDENCE_MATCH",
    });

    expect(result.isError).toBe(false);
    expect(result.details.totalMatches).toBe(1);
    const results = result.details.results as Array<{ kind: string }>;
    expect(results[0]!.kind).toBe("hypothesis");
  });

  it("matches learning entries by rootCause", async () => {
    const { pi, runtime } = await setup();

    await runtime.stateManager.mutate((state) => {
      state.learning.failures.push({
        id: "learn-cause-1",
        description: "Server timeout",              // no "ROOTCAUSE_MATCH"
        status: "captured",
        rootCause: "ROOTCAUSE_MATCH in config",
        fix: "Increase timeout",
        capturedAt: new Date().toISOString(),
      });
    });

    const recall = toolExecutor(pi, "noesis_recall");
    const result = await recall({
      query: "search",
      keyword: "ROOTCAUSE_MATCH",
    });

    expect(result.isError).toBe(false);
    expect(result.details.totalMatches).toBe(1);
    const results = result.details.results as Array<{ kind: string }>;
    expect(results[0]!.kind).toBe("learning");
  });

  it("matches learning entries by fix", async () => {
    const { pi, runtime } = await setup();

    await runtime.stateManager.mutate((state) => {
      state.learning.successes.push({
        id: "learn-fix-1",
        description: "Build flakiness",            // no "FIX_MATCH"
        status: "captured",
        rootCause: "Async race condition",
        fix: "Apply FIX_MATCH patch",             // matches
        capturedAt: new Date().toISOString(),
      });
    });

    const recall = toolExecutor(pi, "noesis_recall");
    const result = await recall({
      query: "search",
      keyword: "FIX_MATCH",
    });

    expect(result.isError).toBe(false);
    expect(result.details.totalMatches).toBe(1);
    const results = result.details.results as Array<{ kind: string }>;
    expect(results[0]!.kind).toBe("learning");
  });
});
