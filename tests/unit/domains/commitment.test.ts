"use strict";

/**
 * Unit tests for the Commitment Domain (commitment-domain.ts).
 *
 * Tests extendWorkflow, replaceWorkflow, updateStep, and addAction —
 * including cap enforcement at CAPS.workflowSteps and CAPS.actions,
 * missing-ID paths, and state transitions.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  extendWorkflow,
  replaceWorkflow,
  updateStep,
  addAction,
} from "../../../src/domains/commitment/commitment-domain.js";
import type { NoesisState, WorkflowStep } from "../../../src/schema.js";
import { EMPTY_STATE, CAPS } from "../../../src/schema.js";
import { freshState } from "../../helpers/fixtures.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// extendWorkflow
// ---------------------------------------------------------------------------

describe("extendWorkflow", () => {
  it("adds steps to an existing workflow", () => {
    const state = freshState();
    const wf = extendWorkflow(state, {
      steps: [
        { description: "Step 1" },
        { description: "Step 2", dependsOn: [], verification: "Check output" },
      ],
    });

    expect(wf.steps).toHaveLength(2);
    expect(wf.steps[0]!.description).toBe("Step 1");
    expect(wf.steps[0]!.status).toBe("pending");
    expect(wf.steps[0]!.id).toMatch(/^ws-/);
    expect(wf.steps[1]!.dependsOn).toEqual([]);
    expect(wf.steps[1]!.verification).toBe("Check output");
  });

  it("updates goal and status when provided", () => {
    const state = freshState();
    const wf = extendWorkflow(state, {
      goal: "New goal",
      status: "active",
      steps: [{ description: "Do it" }],
    });

    expect(wf.goal).toBe("New goal");
    expect(wf.status).toBe("active");
  });

  it("enforces CAPS.workflowSteps cap", () => {
    const state = freshState();
    // Pre-fill to just under the cap
    const prefill = Array.from({ length: CAPS.workflowSteps - 1 }, (_, i) => ({
      id: `ws-prefill-${i}`,
      description: `Prefill ${i}`,
      status: "done" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    state.commitment.workflow.steps.push(...prefill);

    const wf = extendWorkflow(state, {
      steps: [
        { description: "Should fit (exactly cap)" },
        { description: "Should be rejected (over cap)" },
      ],
    });

    // Only 1 step was added (reaching cap of 20)
    expect(wf.steps).toHaveLength(CAPS.workflowSteps);
    expect(wf.steps[CAPS.workflowSteps - 1]!.description).toBe("Should fit (exactly cap)");
  });

  it("adds no steps when workflow is already at cap", () => {
    const state = freshState();
    const prefill = Array.from({ length: CAPS.workflowSteps }, (_, i) => ({
      id: `ws-prefill-${i}`,
      description: `Prefill ${i}`,
      status: "done" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    state.commitment.workflow.steps.push(...prefill);

    const wf = extendWorkflow(state, {
      steps: [{ description: "Should not be added" }],
    });

    expect(wf.steps).toHaveLength(CAPS.workflowSteps);
  });
});

// ---------------------------------------------------------------------------
// replaceWorkflow
// ---------------------------------------------------------------------------

describe("replaceWorkflow", () => {
  it("creates an entirely new workflow", () => {
    const state = freshState();
    const oldId = state.commitment.workflow.id;

    const wf = replaceWorkflow(state, {
      goal: "Build feature X",
      steps: [
        { description: "Research" },
        { description: "Implement" },
        { description: "Test" },
      ],
    });

    expect(wf.id).not.toBe(oldId);
    expect(wf.goal).toBe("Build feature X");
    expect(wf.status).toBe("active");
    expect(wf.steps).toHaveLength(3);
    expect(wf.steps[0]!.status).toBe("pending");

    // State references the new workflow
    expect(state.commitment.workflow.id).toBe(wf.id);
  });

  it("accepts custom status", () => {
    const state = freshState();
    const wf = replaceWorkflow(state, {
      goal: "Draft feature",
      steps: [{ description: "Plan" }],
      status: "draft",
    });

    expect(wf.status).toBe("draft");
  });

  it("handles empty steps array", () => {
    const state = freshState();
    const wf = replaceWorkflow(state, {
      goal: "Empty",
      steps: [],
    });

    expect(wf.steps).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// updateStep
// ---------------------------------------------------------------------------

describe("updateStep", () => {
  it("changes step status and returns the updated step", () => {
    const state = freshState();
    const wf = extendWorkflow(state, {
      steps: [{ description: "My step" }],
    });
    const stepId = wf.steps[0]!.id;

    const updated = updateStep(state, stepId, "active");
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("active");
    expect(updated!.id).toBe(stepId);
  });

  it("appends note to verification when verification exists", () => {
    const state = freshState();
    const wf = extendWorkflow(state, {
      steps: [{ description: "Step with verification", verification: "Initial check" }],
    });

    updateStep(state, wf.steps[0]!.id, "done", "Verified ok");
    expect(wf.steps[0]!.verification).toBe("Initial check\nVerified ok");
  });

  it("returns null for a non-existent step id", () => {
    const state = freshState();
    expect(updateStep(state, "ghost-step", "done")).toBeNull();
  });

  it("can transition done->pending (triggers cycle check)", () => {
    const state = freshState();
    const wf = extendWorkflow(state, {
      steps: [
        { description: "Step A" },
        { description: "Step B" },
      ],
    });

    // Mark A done, then roll it back to pending
    updateStep(state, wf.steps[0]!.id, "done");
    const rolledBack = updateStep(state, wf.steps[0]!.id, "pending");

    expect(rolledBack).not.toBeNull();
    expect(rolledBack!.status).toBe("pending");
  });
});

// ---------------------------------------------------------------------------
// addAction
// ---------------------------------------------------------------------------

describe("addAction", () => {
  it("creates a planned action and stores it", () => {
    const state = freshState();
    const action = addAction(state, "Fix bug #42", "high");

    expect(action.id).toMatch(/^pa-/);
    expect(action.content).toBe("Fix bug #42");
    expect(action.priority).toBe("high");
    expect(action.createdAt).toBeDefined();

    expect(state.commitment.actions).toHaveLength(1);
    expect(state.commitment.actions[0]!.id).toBe(action.id);
  });

  it("defaults to normal priority", () => {
    const state = freshState();
    const action = addAction(state, "Generic task");
    expect(action.priority).toBe("normal");
  });

  it("respects CAPS.actions limit — does not store over cap", () => {
    const state = freshState();
    // Fill actions to the cap
    for (let i = 0; i < CAPS.actions; i++) {
      addAction(state, `Action ${i}`);
    }
    expect(state.commitment.actions).toHaveLength(CAPS.actions);

    // This one should not be stored
    const overflow = addAction(state, "Overflow action");
    expect(overflow.content).toBe("Overflow action");
    expect(state.commitment.actions).toHaveLength(CAPS.actions);
    // The action object is still returned even if not stored
    expect(overflow.id).toMatch(/^pa-/);
  });

  it("stores actions up to the exact cap", () => {
    const state = freshState();
    for (let i = 0; i < CAPS.actions - 1; i++) {
      addAction(state, `Action ${i}`);
    }
    expect(state.commitment.actions).toHaveLength(CAPS.actions - 1);

    const last = addAction(state, "Last slot");
    expect(state.commitment.actions).toHaveLength(CAPS.actions);
    expect(state.commitment.actions[CAPS.actions - 1]!.content).toBe("Last slot");
  });
});
