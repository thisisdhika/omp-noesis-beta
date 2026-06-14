import { generateId } from "../../shared/ids.js";
import { nowISO } from "../../shared/time.js";
import type {
  NoesisState,
  Workflow,
  WorkflowStep,
  WorkflowStatus,
  WorkflowStepInput,
  PlannedActionInput,
} from "../../schema.js";

function toStep(input: WorkflowStepInput): WorkflowStep {
  return {
    id: generateId("ws"),
    description: input.description,
    status: input.status ?? "pending",
    dependsOn: input.dependsOn,
    verification: input.verification,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
}

function toAction(input: PlannedActionInput) {
  return {
    id: generateId("pa"),
    content: input.content,
    createdAt: nowISO(),
  };
}

export function extendWorkflow(
  state: NoesisState,
  steps: WorkflowStepInput[],
  actions: PlannedActionInput[],
): Workflow {
  const newSteps = steps.map(toStep);
  const newActions = actions.map(toAction);

  state.commitment.workflow.steps.push(...newSteps);
  state.commitment.actions.push(...newActions);
  state.commitment.workflow.updatedAt = nowISO();

  return state.commitment.workflow;
}

export function replaceWorkflow(
  state: NoesisState,
  goal: string,
  steps: WorkflowStepInput[],
  actions: PlannedActionInput[],
): Workflow {
  const newSteps = steps.map(toStep);
  const newActions = actions.map(toAction);

  state.commitment.workflow.goal = goal;
  state.commitment.workflow.steps = newSteps;
  state.commitment.actions = newActions;
  state.commitment.workflow.updatedAt = nowISO();

  return state.commitment.workflow;
}

export function updateWorkflowStatus(
  state: NoesisState,
  status: WorkflowStatus,
): void {
  state.commitment.workflow.status = status;
  state.commitment.workflow.updatedAt = nowISO();
}

export function getCurrentStep(state: NoesisState): WorkflowStep | null {
  const { steps } = state.commitment.workflow;

  // First step with status "active"
  const active = steps.find((s) => s.status === "active");
  if (active) return active;

  // Fall back to first "pending"
  const pending = steps.find((s) => s.status === "pending");
  if (pending) return pending;

  return null;
}

export function getNextStep(state: NoesisState): WorkflowStep | undefined {
  return state.commitment.workflow.steps.find(
    (s) => s.status !== "done" && s.status !== "skipped",
  );
}
