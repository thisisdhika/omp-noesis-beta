"use strict";

/**
 * Commitment domain: workflow and action management.
 * Version: 1.0.0
 *
 * Provides functions to extend or replace the active workflow, update
 * individual step statuses, and add planned actions — all with
 * built-in caps and consistency checks.
 */

import type { NoesisState } from "../../shared/schema.js";
import type { Workflow, WorkflowStep, PlannedAction, WorkflowStatus, StepStatus } from "./schema.js";
import { CAPS, generateId } from "../../shared/schema-base.js";
import { now } from "../../shared/time.js";
import { checkCircularDeps, checkStatusConsistency } from "./consistency-strategy.js";

/**
 * Extend the current workflow with new steps, optionally updating its
 * goal and/or overall status.  Stops adding steps once
 * {@link CAPS.workflowSteps} is reached.
 */
export function extendWorkflow(
  state: NoesisState,
  params: {
    goal?: string;
    steps: { description: string; dependsOn?: string[]; verification?: string }[];
    status?: WorkflowStatus;
  },
): Workflow {
  const wf = state.commitment.workflow;

  if (params.goal !== undefined) {
    wf.goal = params.goal;
  }

  for (const stepDef of params.steps) {
    if (wf.steps.length >= CAPS.workflowSteps) break;

    const step: WorkflowStep = {
      id: generateId("ws"),
      description: stepDef.description,
      status: "pending",
      dependsOn: stepDef.dependsOn,
      verification: stepDef.verification,
      createdAt: now(),
      updatedAt: now(),
    };
    wf.steps.push(step);
  }

  if (params.status !== undefined) {
    wf.status = params.status;
  }

  wf.updatedAt = now();
  return wf;
}

/**
 * Replace the current workflow entirely with a fresh one.
 * The new workflow defaults to `"active"` status unless overridden.
 */
export function replaceWorkflow(
  state: NoesisState,
  params: {
    goal: string;
    steps: { description: string; dependsOn?: string[]; verification?: string }[];
    status?: WorkflowStatus;
  },
): Workflow {
  const ts = now();

  const wf: Workflow = {
    id: generateId("wf"),
    goal: params.goal,
    status: params.status ?? "active",
    steps: params.steps.map((s) => ({
      id: generateId("ws"),
      description: s.description,
      status: "pending" as const,
      dependsOn: s.dependsOn,
      verification: s.verification,
      createdAt: ts,
      updatedAt: ts,
    })),
    createdAt: ts,
    updatedAt: ts,
  };

  state.commitment.workflow = wf;
  return wf;
}

/**
 * Update a workflow step's status.
 *
 * If the step transitions from `"done"` back to `"pending"` the
 * function runs a circular-dependency check as a consistency signal.
 *
 * When `note` is provided and the step has a `verification` field,
 * the note is appended to that field.
 *
 * Returns the updated step, or `null` if no step with `stepId` exists.
 */
export function updateStep(
  state: NoesisState,
  stepId: string,
  newStatus: StepStatus,
  note?: string,
): WorkflowStep | null {
  const step = state.commitment.workflow.steps.find((s) => s.id === stepId);
  if (!step) return null;

  const oldStatus = step.status;
  step.status = newStatus;
  step.updatedAt = now();

  // Signal cycle detection when rolling a completed step back to pending
  if (oldStatus === "done" && newStatus === "pending") {
    const cycles = checkCircularDeps(state.commitment.workflow);
    if (cycles.length > 0) {
      throw new Error(`Circular dependency detected involving steps: ${cycles.join(", ")}`);
    }
  }

  if (note !== undefined && step.verification !== undefined) {
    step.verification = step.verification + "\n" + note;
  }

  return step;
}

/**
 * Append a new planned action to the commitment layer.
 *
 * The action is only stored if the actions array is below
 * {@link CAPS.actions}, but the created action object is always returned.
 */
export function addAction(
  state: NoesisState,
  content: string,
  priority?: "critical" | "high" | "normal" | "low",
): PlannedAction {
  const action: PlannedAction = {
    id: generateId("pa"),
    content,
    priority: priority ?? "normal",
    createdAt: now(),
  };

  if (state.commitment.actions.length < CAPS.actions) {
    state.commitment.actions.push(action);
  }

  return action;
}
