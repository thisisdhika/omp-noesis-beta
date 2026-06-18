"use strict";

/**
 * omp-noesis: Believe Tool
 * Version: 0.1.0
 *
 * "noesis_believe" — record a belief fact, decision, or resolve a learning
 * entry into a belief fact.  Uses a flat object schema with runtime validation
 * for cross-provider (including DeepSeek) compatibility.
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import type { GraphFinding, BeliefFact, BeliefDecision } from "../schema.js";
import {
  addFact,
  addDecision,
  resolveLearning,
} from "../domains/belief/belief-domain.js";
import { mapGraphConfidence } from "../domains/belief/confidence-strategy.js";

export function registerBelieveTool(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.registerTool({
    name: "noesis_believe",
    label: "Noesis: Believe",
    description:
  "Store knowledge. Call when: you verify a fact, make a design decision, " +
  "or learn from a failure. NEVER skip storing verified information. " +
  "Do NOT call when: speculating, unsure, or for routine tool results.",
    parameters: pi.zod.object({
      type: pi.zod.enum(["fact", "decision", "learning"]),
      content: pi.zod.string().min(1).max(1000).optional(),
      confidence: pi.zod.number().min(0).max(1).optional(),
      source: pi.zod.enum(["graph", "execution", "user", "inference"]).optional(),
      rationale: pi.zod.string().min(1).max(1000).optional(),
      alternatives: pi.zod.array(pi.zod.string()).max(3).optional(),
      learningId: pi.zod.string().optional(),
      rootCause: pi.zod.string().min(1).max(1000).optional(),
      fix: pi.zod.string().min(1).max(1000).optional(),
      tags: pi.zod.array(pi.zod.string()).max(5).optional(),
      contradictsIds: pi.zod.array(pi.zod.string()).optional(),
      evidence: pi.zod.string().max(500).optional(),
      graphFinding: pi.zod.object({
        query: pi.zod.string(),
        nodes: pi.zod.array(pi.zod.string()),
        relations: pi.zod.array(pi.zod.string()),
        confidence: pi.zod.enum(["EXTRACTED", "INFERRED", "AMBIGUOUS"]),
        inferredConfidence: pi.zod.number().optional(),
        community: pi.zod.string().optional(),
        timestamp: pi.zod.string(),
      }).optional(),
    }).refine((data) => {
      if (data.type === "fact") {
        return typeof data.content === "string" && data.content.length > 0 &&
          typeof data.confidence === "number" && typeof data.source === "string";
      }
      if (data.type === "decision") {
        return typeof data.content === "string" && data.content.length > 0 &&
          typeof data.rationale === "string" && data.rationale.length > 0 &&
          typeof data.source === "string";
      }
      if (data.type === "learning") {
        return typeof data.learningId === "string" && data.learningId.length > 0 &&
          typeof data.rootCause === "string" && data.rootCause.length > 0 &&
          typeof data.fix === "string" && data.fix.length > 0;
      }
      return false;
    }, { message: "Missing required fields for the selected type" }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      let resultId: string;
      let resultContent: string;
      let kind: string;

      if (params.type === "fact") {
        const content = params.content;
        const source = params.source;
        // Compute confidence: explicit param takes precedence; fall back to graphFinding
        let confidence = params.confidence;
        if (confidence === undefined && source === "graph" && params.graphFinding) {
          confidence = mapGraphConfidence(params.graphFinding as GraphFinding);
        }
        if (!content || confidence === undefined || !source) {
          return {
            isError: true,
            content: [{ type: "text", text: "Missing required fields for fact: content, confidence, source" }],
            details: { error: "missing_fields", type: "fact" },
          };
        }
        let fact!: BeliefFact;
        await runtime.stateManager.mutate((state) => {
          fact = addFact(state, {
            content,
            confidence,
            source,
            tags: params.tags,
            evidence: params.evidence,
            contradictsIds: params.contradictsIds,
          });
        });
        resultId = fact.id;
        resultContent = fact.content;
        kind = "fact";
      } else if (params.type === "decision") {
        const content = params.content;
        const rationale = params.rationale;
        const source = params.source;
        if (!content || !rationale || !source) {
          return {
            isError: true,
            content: [{ type: "text", text: "Missing required fields for decision: content, rationale, source" }],
            details: { error: "missing_fields", type: "decision" },
          };
        }
        let decision!: BeliefDecision;
        await runtime.stateManager.mutate((state) => {
          decision = addDecision(state, {
            content,
            rationale,
            alternatives: params.alternatives,
            source,
            tags: params.tags,
            contradictsIds: params.contradictsIds,
          });
        });
        resultId = decision.id;
        resultContent = decision.content;
        kind = "decision";
      } else {
        // type === "learning"
        const learningId = params.learningId;
        const rootCause = params.rootCause;
        const fix = params.fix;
        if (!learningId || !rootCause || !fix) {
          return {
            isError: true,
            content: [{ type: "text", text: "Missing required fields for learning: learningId, rootCause, fix" }],
            details: { error: "missing_fields", type: "learning" },
          };
        }
        let fact!: BeliefFact;
        await runtime.stateManager.mutate((state) => {
          fact = resolveLearning(state, learningId, rootCause, fix);
        });
        resultId = fact.id;
        resultContent = fact.content;
        kind = "fact (from learning)";
      }

      return {
        content: [
          {
            type: "text",
            text: `Created ${kind}: ${resultId}\n${resultContent}`,
          },
        ],
        details: { id: resultId, content: resultContent, kind },
        isError: false,
      };
    },
  });
}
