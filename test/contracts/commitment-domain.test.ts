import { describe, it, expect } from "vitest";
import { makeState, makeWorkflowStep } from "../_harness/factories.js";
import {
  extendWorkflow,
  replaceWorkflow,
  updateWorkflowStatus,
  getCurrentStep,
  getNextStep,
} from "../../src/domains/commitment/commitment-domain.js";

describe("commitment-domain contracts", () => {
  it("extendWorkflow appends steps and actions", () => {
    const state = makeState();
    const initialSteps = state.commitment.workflow.steps.length;
    const initialActions = state.commitment.actions.length;

    extendWorkflow(
      state,
      [{ description: "s1", status: "pending" }],
      [{ content: "a1" }],
    );

    expect(state.commitment.workflow.steps.length).toBe(initialSteps + 1);
    expect(state.commitment.actions.length).toBe(initialActions + 1);
    expect(state.commitment.workflow.steps[0].description).toBe("s1");
    expect(state.commitment.actions[0].content).toBe("a1");
  });

  it("extendWorkflow truncates graph queries and files via setGraphQueries/setFiles? No, not relevant", () => {
    const state = makeState();
    extendWorkflow(
      state,
      [{ description: "s1" }],
      [{ content: "a1" }],
    );
    expect(state.commitment.workflow.status).toBe("draft");
  });

  it("replaceWorkflow replaces goal, steps, and actions", () => {
    const state = makeState();
    replaceWorkflow(
      state,
      "new goal",
      [{ description: "step1", status: "active" }],
      [{ content: "action1" }],
    );

    expect(state.commitment.workflow.goal).toBe("new goal");
    expect(state.commitment.workflow.steps.length).toBe(1);
    expect(state.commitment.workflow.steps[0].description).toBe("step1");
    expect(state.commitment.actions.length).toBe(1);
    expect(state.commitment.actions[0].content).toBe("action1");
  });

  it("replaceWorkflow clears previous steps", () => {
    const state = makeState();
    const step1 = makeWorkflowStep({ description: "old" });
    state.commitment.workflow.steps.push(step1);

    replaceWorkflow(state, "goal", [{ description: "new" }], []);

    expect(state.commitment.workflow.steps.length).toBe(1);
    expect(state.commitment.workflow.steps[0].description).toBe("new");
  });

  it("updateWorkflowStatus sets status", () => {
    const state = makeState();
    updateWorkflowStatus(state, "active");

    expect(state.commitment.workflow.status).toBe("active");
    expect(state.commitment.workflow.updatedAt).toBeDefined();
  });

  it("getCurrentStep returns active step first", () => {
    const state = makeState();
    state.commitment.workflow.steps.push(
      makeWorkflowStep({ description: "pending", status: "pending" }),
    );
    state.commitment.workflow.steps.push(
      makeWorkflowStep({ description: "active", status: "active" }),
    );

    const current = getCurrentStep(state);

    expect(current).not.toBeNull();
    expect(current!.description).toBe("active");
  });

  it("getCurrentStep falls back to first pending", () => {
    const state = makeState();
    state.commitment.workflow.steps.push(
      makeWorkflowStep({ description: "pending1", status: "pending" }),
    );
    state.commitment.workflow.steps.push(
      makeWorkflowStep({ description: "pending2", status: "pending" }),
    );

    const current = getCurrentStep(state);

    expect(current).not.toBeNull();
    expect(current!.description).toBe("pending1");
  });

  it("getCurrentStep returns null when no steps", () => {
    const state = makeState();
    expect(getCurrentStep(state)).toBeNull();
  });

  it("getNextStep returns first non-done step", () => {
    const state = makeState();
    state.commitment.workflow.steps.push(
      makeWorkflowStep({ description: "active", status: "active" }),
    );
    state.commitment.workflow.steps.push(
      makeWorkflowStep({ description: "done", status: "done" }),
    );
    state.commitment.workflow.steps.push(
      makeWorkflowStep({ description: "pending", status: "pending" }),
    );

    const next = getNextStep(state);

    expect(next).not.toBeUndefined();
    expect(next!.description).toBe("active");
  });

  it("getNextStep skips done and skipped steps", () => {
    const state = makeState();
    state.commitment.workflow.steps.push(
      makeWorkflowStep({ description: "done", status: "done" }),
    );
    state.commitment.workflow.steps.push(
      makeWorkflowStep({ description: "skipped", status: "skipped" }),
    );
    state.commitment.workflow.steps.push(
      makeWorkflowStep({ description: "pending", status: "pending" }),
    );

    const next = getNextStep(state);

    expect(next).not.toBeUndefined();
    expect(next!.description).toBe("pending");
  });

  it("getNextStep returns undefined when all steps done", () => {
    const state = makeState();
    state.commitment.workflow.steps.push(
      makeWorkflowStep({ description: "done", status: "done" }),
    );

    expect(getNextStep(state)).toBeUndefined();
  });
});
