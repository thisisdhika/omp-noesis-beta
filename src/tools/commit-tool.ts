"use strict";

/**
 * omp-noesis: Commit Tool
 * Version: 1.0.0
 *
 * "noesis_commit" — manage the active workflow and planned actions.
 * Uses a flat object schema with runtime validation for cross-provider
 * (including DeepSeek) compatibility.
 *   - extend_workflow: append steps to the current workflow
 *   - replace_workflow: replace the entire workflow
 *   - update_step: change a step's status
 *   - add_action: record a planned action
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { AgentToolResult } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import type { Workflow, WorkflowStep, PlannedAction } from "../shared/schema.js";
import { ExtendWorkflowUseCase } from "../application/use-cases/extend-workflow.js";
import { ReplaceWorkflowUseCase } from "../application/use-cases/replace-workflow.js";
import { UpdateWorkflowStepUseCase } from "../application/use-cases/update-workflow-step.js";
import { AddPlannedActionUseCase } from "../application/use-cases/add-planned-action.js";


export function buildCommitParams(pi: ExtensionAPI) {
  const stepSchema = pi.zod.object({
    description: pi.zod.string(),
    dependsOn: pi.zod.array(pi.zod.string()).optional(),
    verification: pi.zod.string().optional(),
  });

  return pi.zod.object({
    mode: pi.zod.enum(["extend_workflow", "replace_workflow", "update_step", "add_action"]),
    goal: pi.zod.string().optional(),
    steps: pi.zod.array(stepSchema).optional(),
    status: pi.zod.enum(["draft", "active", "done", "abandoned", "pending", "skipped"]).optional(),
    stepId: pi.zod.string().optional(),
    note: pi.zod.string().optional(),
    content: pi.zod.string().optional(),
    priority: pi.zod.enum(["low", "normal", "high", "critical"]).default("normal"),
  });
}

type CommitParams = {
  mode: "extend_workflow" | "replace_workflow" | "update_step" | "add_action";
  goal?: string;
  steps?: { description: string; dependsOn?: string[]; verification?: string }[];
  status?: "draft" | "active" | "done" | "abandoned" | "pending" | "skipped";
  stepId?: string;
  note?: string;
  content?: string;
  priority: "low" | "normal" | "high" | "critical";
};

export async function executeCommit(runtime: NoesisRuntime, params: CommitParams): Promise<AgentToolResult<Record<string, unknown>>> {
  // Runtime type guards — narrow the status union to the mode-specific subset
  function workflowStatus(s: typeof params.status): "draft" | "active" | "done" | "abandoned" | undefined {
    if (s === "draft" || s === "active" || s === "done" || s === "abandoned" || s === undefined) return s;
    return undefined;
  }
  function stepStatus(s: typeof params.status): "pending" | "active" | "done" | "skipped" {
    if (s === "pending" || s === "active" || s === "done" || s === "skipped") return s;
    // Fallback safe default if model sends an invalid status for update_step mode
    return "pending";
  }

  if (params.mode === "extend_workflow") {
    if (!params.steps || params.steps.length === 0) {
      return {
        isError: true,
        content: [{ type: "text", text: "Missing required field: steps (non-empty array)" }],
        details: { error: "missing_fields", mode: "extend_workflow" },
      };
    }
    const steps = params.steps;
    const goal = params.goal;
    const ws = params.status;

    const uow = runtime.stateManager.createUnitOfWork();
    const useCase = new ExtendWorkflowUseCase(uow);
    const workflow = await useCase.execute({
      goal,
      steps,
      status: workflowStatus(ws),
    });

    return {
      content: [
        {
          type: "text",
          text: `Workflow extended: ${workflow.id}\nGoal: ${workflow.goal}\nSteps: ${workflow.steps.length}\nStatus: ${workflow.status}`,
        },
      ],
      details: {
        id: workflow.id,
        goal: workflow.goal,
        stepCount: workflow.steps.length,
        status: workflow.status,
        kind: "workflow_extended",
      },
      isError: false,
    };
  }

  if (params.mode === "replace_workflow") {
    if (!params.goal || !params.steps || params.steps.length === 0) {
      return {
        isError: true,
        content: [{ type: "text", text: "Missing required fields: goal, steps (non-empty array)" }],
        details: { error: "missing_fields", mode: "replace_workflow" },
      };
    }
    const goal = params.goal;
    const steps = params.steps;
    const ws = params.status;

    const uow = runtime.stateManager.createUnitOfWork();
    const useCase = new ReplaceWorkflowUseCase(uow);
    const workflow = await useCase.execute({
      goal,
      steps,
      status: workflowStatus(ws),
    });

    return {
      content: [
        {
          type: "text",
          text: `Workflow replaced: ${workflow.id}\nGoal: ${workflow.goal}\nSteps: ${workflow.steps.length}\nStatus: ${workflow.status}`,
        },
      ],
      details: {
        id: workflow.id,
        goal: workflow.goal,
        stepCount: workflow.steps.length,
        status: workflow.status,
        kind: "workflow_replaced",
      },
      isError: false,
    };
  }

  if (params.mode === "update_step") {
    if (!params.stepId || !params.status) {
      return {
        isError: true,
        content: [{ type: "text", text: "Missing required fields: stepId, status" }],
        details: { error: "missing_fields", mode: "update_step" },
      };
    }
    const stepId = params.stepId;
    const narrowedStatus = stepStatus(params.status);

    const uow = runtime.stateManager.createUnitOfWork();
    const useCase = new UpdateWorkflowStepUseCase(uow);
    let step!: WorkflowStep;
    try {
      step = await useCase.execute({
        stepId,
        status: narrowedStatus,
        note: params.note,
      });
    } catch {
      return {
        content: [{ type: "text", text: `Step not found: ${stepId}` }],
        details: { stepId, error: "not_found" },
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Step updated: ${step.id}\nStatus: ${step.status}` +
            (step.verification !== undefined ? `\nVerification: ${step.verification}` : ""),
        },
      ],
      details: {
        id: step.id,
        status: step.status,
        verification: step.verification ?? null,
      },
      isError: false,
    };
  }

  // mode === "add_action"
  if (!params.content) {
    return {
      isError: true,
      content: [{ type: "text", text: "Missing required field: content" }],
      details: { error: "missing_fields", mode: "add_action" },
    };
  }
  const content = params.content;
  const priority = params.priority;

  const uow = runtime.stateManager.createUnitOfWork();
  const useCase = new AddPlannedActionUseCase(uow);
  const action = await useCase.execute({
    content,
    priority,
  });

  return {
    content: [
      {
        type: "text",
        text: `Action recorded: ${action.id}\n${action.content}\nPriority: ${action.priority}`,
      },
    ],
    details: {
      id: action.id,
      content: action.content,
      priority: action.priority,
      kind: "planned_action",
    },
    isError: false,
  };
}

export function registerCommitTool(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.registerTool({
    name: "noesis_commit",
    label: "Noesis: Commit",
    description:
     "Workflow tracking for multi-step tasks. Call when starting multi-step work, " +
     "completing a step, or replanning. Use extend_workflow to append steps, " +
     "replace_workflow to replace the entire plan, update_step to change a step's " +
     "status, or add_action to record a planned action. " +
     "Tracks cognition, not execution. Do NOT call for single-step tasks.",
    parameters: buildCommitParams(pi),
    async execute(toolCallId, params, _signal, _onUpdate, _ctx) {
      return executeCommit(runtime, params);
    },
  });
}
