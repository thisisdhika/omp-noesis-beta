"use strict";

/**
 * omp-noesis: Commit Tool
 * Version: 0.1.0
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
import type { NoesisRuntime } from "../runtime.js";
import type { Workflow, WorkflowStep, PlannedAction } from "../schema.js";
import {
  extendWorkflow,
  replaceWorkflow,
  updateStep,
  addAction,
} from "../domains/commitment/commitment-domain.js";

export function registerCommitTool(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  const stepSchema = pi.zod.object({
    description: pi.zod.string().min(1).max(500),
    dependsOn: pi.zod.array(pi.zod.string()).optional(),
    verification: pi.zod.string().max(200).optional(),
  });

  pi.registerTool({
    name: "noesis_commit",
    label: "Noesis: Commit",
    description:
      "Manage the active workflow and planned actions. " +
      "Use mode=\"extend_workflow\" to append steps, \"replace_workflow\" to start fresh, " +
      "\"update_step\" to mark progress, and \"add_action\" to record a to-do.",
    parameters: pi.zod.object({
      mode: pi.zod.enum(["extend_workflow", "replace_workflow", "update_step", "add_action"]),
      goal: pi.zod.string().min(1).max(500).optional(),
      steps: pi.zod.array(stepSchema).max(20).optional(),
      status: pi.zod.enum(["draft", "active", "done", "abandoned", "pending", "skipped"]).optional(),
      stepId: pi.zod.string().min(1).optional(),
      note: pi.zod.string().max(500).optional(),
      content: pi.zod.string().min(1).max(500).optional(),
      priority: pi.zod.enum(["low", "normal", "high", "critical"]).default("normal"),
    }).refine((data) => {
      if (data.mode === "extend_workflow") {
        return Array.isArray(data.steps) && data.steps.length > 0;
      }
      if (data.mode === "replace_workflow") {
        return typeof data.goal === "string" && data.goal.length > 0 &&
          Array.isArray(data.steps) && data.steps.length > 0;
      }
      if (data.mode === "update_step") {
        return typeof data.stepId === "string" && data.stepId.length > 0 &&
          typeof data.status === "string" && data.status.length > 0;
      }
      if (data.mode === "add_action") {
        return typeof data.content === "string" && data.content.length > 0;
      }
      return false;
    }, { message: "Missing required fields for the selected mode" }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      // Runtime type guards — narrow the status union to the mode-specific subset
      function workflowStatus(s: typeof params.status): "draft" | "active" | "done" | "abandoned" | undefined {
        if (s === "draft" || s === "active" || s === "done" || s === "abandoned" || s === undefined) return s;
        return undefined;
      }
      function stepStatus(s: typeof params.status): "pending" | "active" | "done" | "skipped" {
        if (s === "pending" || s === "active" || s === "done" || s === "skipped") return s;
        // Should never happen — refine() already validated mode === "update_step" with a valid status
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
        let workflow!: Workflow;
        await runtime.stateManager.mutate((state) => {
          workflow = extendWorkflow(state, {
            goal,
            steps,
            status: workflowStatus(ws),
          });
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
        let workflow!: Workflow;
        await runtime.stateManager.mutate((state) => {
          workflow = replaceWorkflow(state, {
            goal,
            steps,
            status: workflowStatus(ws),
          });
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
        let step!: WorkflowStep | null;
        await runtime.stateManager.mutate((state) => {
          step = updateStep(state, stepId, narrowedStatus);
        });

        if (step === null) {
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
      let action!: PlannedAction;
      await runtime.stateManager.mutate((state) => {
        action = addAction(state, content, priority);
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
    },
  });
}
