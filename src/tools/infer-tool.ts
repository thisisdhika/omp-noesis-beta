"use strict";

/**
 * omp-noesis: Infer Tool
 * Version: 0.1.0
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
import type { Hypothesis, BeliefFact, ReasoningStep } from "../schema.js";
import {
  addHypothesis,
  updateHypothesis,
  confirmHypothesis,
  refuteHypothesis,
  addReasoning,
} from "../domains/inference/inference-domain.js";

export function registerInferTool(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.registerTool({
    name: "noesis_infer",
    label: "Noesis: Infer",
    description:
      "Manage hypotheses and reasoning steps. " +
      "Use action=\"add_hypothesis\" to create a new hypothesis, " +
      "\"update_hypothesis\" to change status/evidence (optionally auto-promoting " +
      "confirmed hypotheses to belief facts), and \"add_reasoning\" to log a " +
      "reasoning step.",
    parameters: pi.zod.object({
      action: pi.zod.enum(["add_hypothesis", "update_hypothesis", "add_reasoning"]),
      content: pi.zod.string().max(2000).optional(),
      id: pi.zod.string().optional(),
      status: pi.zod.enum(["testing", "confirmed", "refuted", "abandoned"]).optional(),
      evidence: pi.zod.string().max(500).optional(),
      reasoning: pi.zod.string().max(1000).optional(),
      autoPromote: pi.zod.boolean().default(true),
      relatesTo: pi.zod.string().optional(),
      tags: pi.zod.array(pi.zod.string()).max(5).optional(),
    }).refine((data) => {
      if (data.action === "add_hypothesis") {
        return typeof data.content === "string";
      }
      if (data.action === "update_hypothesis") {
        return typeof data.id === "string" && typeof data.status === "string";
      }
      if (data.action === "add_reasoning") {
        return typeof data.content === "string";
      }
      return false;
    }, { message: "Missing required fields for the selected action" }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      if (params.action === "add_hypothesis") {
        const content = params.content;
        if (!content) {
          return {
            isError: true,
            content: [{ type: "text", text: "Missing required field: content" }],
            details: { error: "missing_fields", action: "add_hypothesis" },
          };
        }
        let hypothesis!: Hypothesis;
        await runtime.stateManager.mutate((state) => {
          hypothesis = addHypothesis(state, {
            content,
            evidence: params.evidence,
            tags: params.tags,
          });
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

        // Add reasoning step if provided
        if (reasoning !== undefined && reasoning.length > 0) {
          await runtime.stateManager.mutate((state) => {
            addReasoning(state, reasoning, id);
          });
        }

        // Route to the appropriate domain function based on status
        let resultId: string;
        let resultContent: string;
        let resultStatus: string;
        let resultKind: string;
        let beliefFactId: string | null = null;

        if (status === "confirmed" && autoPromote) {
          let confirmed!: { hypothesis: Hypothesis; beliefFact?: BeliefFact } | null;
          await runtime.stateManager.mutate((state) => {
            confirmed = confirmHypothesis(state, id, true);
          });
          if (confirmed === null) {
            return {
              content: [{ type: "text", text: `Hypothesis not found: ${id}` }],
              details: { id, error: "not_found" },
              isError: true,
            };
          }
          resultId = confirmed.hypothesis.id;
          resultContent = confirmed.hypothesis.content;
          resultStatus = confirmed.hypothesis.status;
          beliefFactId = confirmed.beliefFact?.id ?? null;
          resultKind = "hypothesis_confirmed";
        } else if (status === "refuted") {
          let refuted!: Hypothesis | null;
          await runtime.stateManager.mutate((state) => {
            refuted = refuteHypothesis(state, id);
          });
          if (refuted === null) {
            return {
              content: [{ type: "text", text: `Hypothesis not found: ${id}` }],
              details: { id, error: "not_found" },
              isError: true,
            };
          }
          resultId = refuted.id;
          resultContent = refuted.content;
          resultStatus = refuted.status;
          resultKind = "hypothesis_refuted";
        } else {
          let hypothesis!: Hypothesis | null;
          await runtime.stateManager.mutate((state) => {
            hypothesis = updateHypothesis(state, id, { status, evidence });
          });
          if (hypothesis === null) {
            return {
              content: [{ type: "text", text: `Hypothesis not found: ${id}` }],
              details: { id, error: "not_found" },
              isError: true,
            };
          }
          resultId = hypothesis.id;
          resultContent = hypothesis.content;
          resultStatus = hypothesis.status;
          resultKind = "hypothesis_updated";
        }

        return {
          content: [
            {
              type: "text",
              text: `Hypothesis ${resultKind}: ${resultId}\nStatus: ${resultStatus}` +
                (beliefFactId !== null ? `\nPromoted to belief fact: ${beliefFactId}` : ""),
            },
          ],
          details: {
            id: resultId,
            content: resultContent,
            status: resultStatus,
            beliefFactId,
            kind: resultKind,
          },
          isError: false,
        };
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
      let step!: ReasoningStep;
      await runtime.stateManager.mutate((state) => {
        step = addReasoning(state, content, params.relatesTo);
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
    },
  });
}
