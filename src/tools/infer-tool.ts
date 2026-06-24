"use strict";

/**
 * omp-noesis: Infer Tool
 * Version: 1.0.0
 *
 * "noesis_infer" — manage hypotheses and reasoning steps.
 * Uses a flat object schema with runtime validation for cross-provider
 * (including DeepSeek) compatibility.
 *   - add_hypothesis: create a new hypothesis in testing status
 *   - update_hypothesis: change status / evidence (with optional auto-promote)
 *   - add_reasoning: record a reasoning step
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import type { AgentToolResult } from "@oh-my-pi/pi-agent-core";
import type { Hypothesis, BeliefFact, ReasoningStep } from "../shared/schema.js";
import { AddHypothesisUseCase } from "../application/use-cases/add-hypothesis.js";
import { UpdateHypothesisUseCase } from "../application/use-cases/update-hypothesis.js";
import { ConfirmHypothesisUseCase } from "../application/use-cases/confirm-hypothesis.js";
import { AddReasoningStepUseCase } from "../application/use-cases/add-reasoning-step.js";



// ============================================================
// Extracted params builder
// ============================================================
export function buildInferParams(pi: ExtensionAPI) {
  return pi.zod.object({
    action: pi.zod.enum(["add_hypothesis", "update_hypothesis", "add_reasoning"]),
    content: pi.zod.string().optional(),
    id: pi.zod.string().optional(),
    status: pi.zod.enum(["testing", "confirmed", "refuted", "abandoned"]).optional(),
    evidence: pi.zod.string().optional(),
    reasoning: pi.zod.string().optional(),
    autoPromote: pi.zod.boolean().default(true),
    relatesTo: pi.zod.string().optional(),
    tags: pi.zod.array(pi.zod.string()).optional(),
  });
}

// ============================================================
// Extracted execute handler
// ============================================================
export async function executeInfer(
  runtime: NoesisRuntime,
  params: {
    action: "add_hypothesis" | "update_hypothesis" | "add_reasoning";
    content?: string;
    id?: string;
    status?: "testing" | "confirmed" | "refuted" | "abandoned";
    evidence?: string;
    reasoning?: string;
    autoPromote: boolean;
    relatesTo?: string;
    tags?: string[];
  },
): Promise<AgentToolResult<Record<string, unknown>>> {
  if (params.action === "add_hypothesis") {
    const content = params.content;
    if (!content) {
      return {
        isError: true,
        content: [{ type: "text", text: "Missing required field: content" }],
        details: { error: "missing_fields", action: "add_hypothesis" },
      };
    }
    const uow = runtime.stateManager.createUnitOfWork();
    const useCase = new AddHypothesisUseCase(uow);
    const hypothesis = await useCase.execute({
      content,
      evidence: params.evidence,
      tags: params.tags,
    });

    return {
      content: [
        {
          type: "text",
          text: `Hypothesis created: ${hypothesis.id}\n${hypothesis.content}\nStatus: ${hypothesis.status}`,
        },
      ],
      details: {
        id: hypothesis.id,
        content: hypothesis.content,
        status: hypothesis.status,
        kind: "hypothesis",
      },
      isError: false,
    };
  }

  if (params.action === "update_hypothesis") {
    const id = params.id;
    const status = params.status;
    if (!id || !status) {
      return {
        isError: true,
        content: [{ type: "text", text: "Missing required fields: id, status" }],
        details: { error: "missing_fields", action: "update_hypothesis" },
      };
    }
    const { evidence, reasoning, autoPromote } = params;

    if (status === "confirmed") {
      if (reasoning !== undefined && reasoning.length > 0) {
        const reasoningUow = runtime.stateManager.createUnitOfWork();
        const reasoningUseCase = new AddReasoningStepUseCase(reasoningUow);
        await reasoningUseCase.execute({
          content: reasoning,
          relatesTo: id,
        });
      }

      const confirmUow = runtime.stateManager.createUnitOfWork();
      const useCase = new ConfirmHypothesisUseCase(confirmUow);
      let res;
      try {
        res = await useCase.execute({
          id,
          autoPromote,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : `Hypothesis not found: ${id}`;
        return {
          content: [{ type: "text", text: message }],
          details: { id, error: "not_found" },
          isError: true,
        };
      }

      const hypothesis = runtime.stateManager.read().inference.hypotheses.find(h => h.id === id);
      if (!hypothesis) {
        return {
          content: [{ type: "text", text: `Hypothesis not found: ${id}` }],
          details: { id, error: "not_found" },
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Hypothesis hypothesis_confirmed: ${hypothesis.id}\nStatus: ${hypothesis.status}` +
              (res.beliefFactId ? `\nPromoted to belief fact: ${res.beliefFactId}` : ""),
          },
        ],
        details: {
          id: hypothesis.id,
          content: hypothesis.content,
          status: hypothesis.status,
          beliefFactId: res.beliefFactId ?? null,
          kind: "hypothesis_confirmed",
        },
        isError: false,
      };
    } else {
      const updateUow = runtime.stateManager.createUnitOfWork();
      const useCase = new UpdateHypothesisUseCase(updateUow);
      let hypothesis;
      try {
        hypothesis = await useCase.execute({
          id,
          status,
          evidence,
          reasoning,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : `Hypothesis not found: ${id}`;
        return {
          content: [{ type: "text", text: message }],
          details: { id, error: "not_found" },
          isError: true,
        };
      }

      const resultKind = status === "refuted" ? "hypothesis_refuted" : "hypothesis_updated";
      return {
        content: [
          {
            type: "text",
            text: `Hypothesis ${resultKind}: ${hypothesis.id}\nStatus: ${hypothesis.status}`,
          },
        ],
        details: {
          id: hypothesis.id,
          content: hypothesis.content,
          status: hypothesis.status,
          beliefFactId: null,
          kind: resultKind,
        },
        isError: false,
      };
    }
  }

  // action === "add_reasoning"
  const content = params.content;
  if (!content) {
    return {
      isError: true,
      content: [{ type: "text", text: "Missing required field: content" }],
      details: { error: "missing_fields", action: "add_reasoning" },
    };
  }
  const uow = runtime.stateManager.createUnitOfWork();
  const useCase = new AddReasoningStepUseCase(uow);
  const step = await useCase.execute({
    content,
    relatesTo: params.relatesTo,
  });

  return {
    content: [
      {
        type: "text",
        text: `Reasoning step recorded: ${step.id}\n${step.content}` +
          (step.relatesTo ? `\nRelates to: ${step.relatesTo}` : ""),
      },
    ],
    details: {
      id: step.id,
      content: step.content,
      relatesTo: step.relatesTo ?? null,
      kind: "reasoning_step",
    },
    isError: false,
  };
}
export function registerInferTool(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.registerTool({
    name: "noesis_infer",
    label: "Noesis: Infer",
    description:
      "Manages hypotheses and reasoning steps in the cognitive state. " +
      "Call when testing a theory, confirming or refuting a hypothesis, or recording a reasoning step. " +
      "Do NOT call for simple facts — use noesis_believe_fact instead, or noesis_believe_decision for those subtypes. " +
      "Confirmed hypotheses auto-promote to beliefs. " +
      "Runtime validates required fields per action and returns clear error messages, " +
      "so partial or incomplete payloads are not rejected at parse time. " +
      "Fields by action: add_hypothesis(content) | update_hypothesis(id,status) | add_reasoning(content)",
    parameters: buildInferParams(pi),
    async execute(tCID, params, _signal, _onUpdate, _ctx) {
      return executeInfer(runtime, params);
    },
  });
}
