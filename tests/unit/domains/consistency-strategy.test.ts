"use strict";

/**
 * omp-noesis: Consistency Strategy Unit Tests
 *
 * Tests for checkCircularDeps and checkStatusConsistency.
 */

import { describe, it, expect } from "bun:test";
import { checkCircularDeps, checkStatusConsistency } from "../../../src/domains/commitment/consistency-strategy.js";
import type { Workflow, WorkflowStep } from "../../../src/schema.js";
import { now } from "../../../src/shared/time.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TS = now();

function makeStep(id: string, description: string, overrides?: Partial<WorkflowStep>): WorkflowStep {
  return {
    id,
    description,
    status: "pending",
    dependsOn: [],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  } as WorkflowStep;
}

function makeWorkflow(overrides?: Partial<Workflow>): Workflow {
  return {
    id: "wf-test-001",
    goal: "test workflow",
    status: "draft",
    steps: [],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  } as Workflow;
}

// ---------------------------------------------------------------------------
// checkCircularDeps
// ---------------------------------------------------------------------------

describe("checkCircularDeps", () => {
  it("returns empty array for workflow with no dependencies", () => {
    const steps = [
      makeStep("ws-1", "Step A"),
      makeStep("ws-2", "Step B"),
    ];
    const workflow = makeWorkflow({ steps });
    expect(checkCircularDeps(workflow)).toBeEmpty();
  });

  it("returns empty array for simple chain (A -> B)", () => {
    const steps = [
      makeStep("ws-1", "Step A", { dependsOn: [] }),
      makeStep("ws-2", "Step B", { dependsOn: ["ws-1"] }),
    ];
    const workflow = makeWorkflow({ steps });
    expect(checkCircularDeps(workflow)).toBeEmpty();
  });

  it("detects simple 2-step cycle (A -> B, B -> A)", () => {
    const steps = [
      makeStep("ws-1", "Step A", { dependsOn: ["ws-2"] }),
      makeStep("ws-2", "Step B", { dependsOn: ["ws-1"] }),
    ];
    const workflow = makeWorkflow({ steps });
    const result = checkCircularDeps(workflow);
    expect(result).toContain("Step A");
    expect(result).toContain("Step B");
  });

  it("detects 3-step cycle (A -> B, B -> C, C -> A)", () => {
    const steps = [
      makeStep("ws-1", "Step A", { dependsOn: ["ws-2"] }),
      makeStep("ws-2", "Step B", { dependsOn: ["ws-3"] }),
      makeStep("ws-3", "Step C", { dependsOn: ["ws-1"] }),
    ];
    const workflow = makeWorkflow({ steps });
    const result = checkCircularDeps(workflow);
    expect(result).toContain("Step A");
    expect(result).toContain("Step B");
    expect(result).toContain("Step C");
  });

  it("detects self-referencing step", () => {
    const steps = [
      makeStep("ws-1", "SelfDep", { dependsOn: ["ws-1"] }),
    ];
    const workflow = makeWorkflow({ steps });
    const result = checkCircularDeps(workflow);
    expect(result).toContain("SelfDep");
  });

  it("returns empty array for empty workflow", () => {
    const workflow = makeWorkflow({ steps: [] });
    expect(checkCircularDeps(workflow)).toBeEmpty();
  });
});

// ---------------------------------------------------------------------------
// checkStatusConsistency
// ---------------------------------------------------------------------------

describe("checkStatusConsistency", () => {
  it("returns valid when all steps are pending (no active steps)", () => {
    const steps = [
      makeStep("ws-1", "Step A", { status: "pending" }),
      makeStep("ws-2", "Step B", { status: "pending", dependsOn: ["ws-1"] }),
    ];
    const workflow = makeWorkflow({ steps });
    const result = checkStatusConsistency(workflow);
    expect(result.valid).toBeTrue();
    expect(result.issues).toBeEmpty();
  });

  it("returns valid when active step has all dependencies done", () => {
    const steps = [
      makeStep("ws-1", "Dep A", { status: "done", dependsOn: [] }),
      makeStep("ws-2", "Active B", { status: "active", dependsOn: ["ws-1"] }),
    ];
    const workflow = makeWorkflow({ steps });
    const result = checkStatusConsistency(workflow);
    expect(result.valid).toBeTrue();
    expect(result.issues).toBeEmpty();
  });

  it("returns invalid when active step has a pending dependency", () => {
    const steps = [
      makeStep("ws-1", "Pending A", { status: "pending", dependsOn: [] }),
      makeStep("ws-2", "Active B", { status: "active", dependsOn: ["ws-1"] }),
    ];
    const workflow = makeWorkflow({ steps });
    const result = checkStatusConsistency(workflow);
    expect(result.valid).toBeFalse();
    expect(result.issues.length).toBeGreaterThanOrEqual(1);
    expect(result.issues[0]).toContain("Active B");
    expect(result.issues[0]).toContain("Pending A");
  });

  it("skips dangling dependency references (not in stepMap)", () => {
    const steps = [
      makeStep("ws-1", "Done A", { status: "done" }),
      makeStep("ws-2", "Active B", { status: "active", dependsOn: ["ws-1", "ws-outside"] }),
    ];
    const workflow = makeWorkflow({ steps });
    const result = checkStatusConsistency(workflow);
    // "ws-outside" is not in stepMap — code skips dangling refs
    expect(result.valid).toBeTrue();
  });

  it("returns valid for a done step (always valid)", () => {
    const steps = [
      makeStep("ws-1", "Done A", { status: "done" }),
    ];
    const workflow = makeWorkflow({ steps });
    const result = checkStatusConsistency(workflow);
    expect(result.valid).toBeTrue();
  });

  it("returns valid for empty workflow", () => {
    const workflow = makeWorkflow({ steps: [] });
    const result = checkStatusConsistency(workflow);
    expect(result.valid).toBeTrue();
    expect(result.issues).toBeEmpty();
  });
});
