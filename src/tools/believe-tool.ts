"use strict";

/**
 * omp-noesis: Believe Tools (split)
 * Version: 0.1.0
 *
 * Three flat tools replacing the old discriminated-union noesis_believe:
 *   noesis_believe_fact      — store a verified belief fact
 *   noesis_believe_decision  — record a design or workflow decision
 *   noesis_believe_learning  — resolve a learning entry into a belief fact
 *
 * Each tool has a flat Zod schema with no .refine() — required fields are
 * enforced directly by Zod for cross-provider (including DeepSeek) compatibility.
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { AgentToolResult } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import type { GraphFinding, BeliefFact, BeliefDecision } from "../schema.js";
import {
  addFact,
  addDecision,
  resolveLearning,
} from "../domains/belief/belief-domain.js";
import { mapGraphConfidence } from "../domains/belief/confidence-strategy.js";

// ============================================================================
// noesis_believe_fact — store a verified belief fact
// ============================================================================

export interface BelieveFactParams {
  content: string;
  confidence: number;
  source: "graph" | "execution" | "user" | "inference";
  evidence?: string;
  tags?: string[];
  contradicts?: string[];
  graphFinding?: {
    query: string;
    nodes: string[];
    relations: string[];
    confidence: "EXTRACTED" | "INFERRED" | "AMBIGUOUS";
    inferredConfidence?: number;
    community?: string;
    timestamp: string;
  };
}

export function buildBelieveFactParams(pi: ExtensionAPI) {
  return pi.zod.object({
    content: pi.zod.string().min(1, "content is required"),
    confidence: pi.zod.number().min(0).max(1, "confidence must be 0-1"),
    source: pi.zod.enum(["graph", "execution", "user", "inference"]),
    evidence: pi.zod.string().optional(),
    tags: pi.zod.array(pi.zod.string()).optional(),
    contradicts: pi.zod.array(pi.zod.string()).optional(),
    graphFinding: pi.zod.object({
      query: pi.zod.string(),
      nodes: pi.zod.array(pi.zod.string()),
      relations: pi.zod.array(pi.zod.string()),
      confidence: pi.zod.enum(["EXTRACTED", "INFERRED", "AMBIGUOUS"]),
      inferredConfidence: pi.zod.number().optional(),
      community: pi.zod.string().optional(),
      timestamp: pi.zod.string(),
    }).optional(),
  });
}

export async function executeBelieveFact(
  runtime: NoesisRuntime,
  params: BelieveFactParams,
): Promise<AgentToolResult<any, any>> {
  let confidence = params.confidence;
  if (params.source === "graph" && params.graphFinding) {
    confidence = mapGraphConfidence(params.graphFinding as GraphFinding);
  }
  let fact!: BeliefFact;
  await runtime.stateManager.mutate((state) => {
    fact = addFact(state, {
      content: params.content,
      confidence,
      source: params.source,
      tags: params.tags,
      evidence: params.evidence,
      contradicts: params.contradicts,
    });
  });
  return {
    content: [{ type: "text", text: `Created fact: ${fact.id}\n${fact.content}` }],
    details: { id: fact.id, content: fact.content, kind: "fact" },
    isError: false,
  };
}

export function registerBelieveFactTool(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.registerTool({
    name: "noesis_believe_fact",
    label: "Noesis: Believe Fact",
    description:
      "Store a verified belief fact into the noesis cognitive state. " +
      "Use when you have confirmed information from graph queries, execution results, user statements, or confident inferences. " +
      "Do NOT use for speculative guesses, unverified claims, or routine tool results that do not represent durable knowledge. " +
      "Facts persist across the session and are included in the preamble for subsequent turns. " +
      "For recording design decisions use noesis_believe_decision; for resolving learning use noesis_believe_learning.",
    parameters: buildBelieveFactParams(pi),
    async execute(toolCallId, params, _signal, _onUpdate, _ctx) {
      return executeBelieveFact(runtime, params);
    },
  });
}

// ============================================================================
// noesis_believe_decision — record a design or workflow decision
// ============================================================================

export interface BelieveDecisionParams {
  content: string;
  rationale: string;
  source: "graph" | "execution" | "user" | "inference";
  alternatives?: string[];
  tags?: string[];
  contradicts?: string[];
}

export function buildBelieveDecisionParams(pi: ExtensionAPI) {
  return pi.zod.object({
    content: pi.zod.string().min(1, "content is required"),
    rationale: pi.zod.string().min(1, "rationale is required"),
    source: pi.zod.enum(["graph", "execution", "user", "inference"]),
    alternatives: pi.zod.array(pi.zod.string()).optional(),
    tags: pi.zod.array(pi.zod.string()).optional(),
    contradicts: pi.zod.array(pi.zod.string()).optional(),
  });
}

export async function executeBelieveDecision(
  runtime: NoesisRuntime,
  params: BelieveDecisionParams,
): Promise<AgentToolResult<any, any>> {
  let decision!: BeliefDecision;
  await runtime.stateManager.mutate((state) => {
    decision = addDecision(state, {
      content: params.content,
      rationale: params.rationale,
      alternatives: params.alternatives,
      source: params.source,
      tags: params.tags,
      contradicts: params.contradicts,
    });
  });
  return {
    content: [{ type: "text", text: `Created decision: ${decision.id}\n${decision.content}` }],
    details: { id: decision.id, content: decision.content, kind: "decision" },
    isError: false,
  };
}

export function registerBelieveDecisionTool(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.registerTool({
    name: "noesis_believe_decision",
    label: "Noesis: Believe Decision",
    description:
      "Record a design decision or workflow choice with its rationale into the noesis cognitive state. " +
      "Use when you choose between alternatives, make an architectural call, or commit to a direction. " +
      "Do NOT use for factual observations (use noesis_believe_fact) or for routine log entries. " +
      "Decisions persist across the session and help future turns understand why things were done. " +
      "For tracking multi-step workflows with progress updates use noesis_commit instead.",
    parameters: buildBelieveDecisionParams(pi),
    async execute(toolCallId, params, _signal, _onUpdate, _ctx) {
      return executeBelieveDecision(runtime, params);
    },
  });
}

// ============================================================================
// noesis_believe_learning — resolve a learning entry into a belief fact
// ============================================================================

export interface BelieveLearningParams {
  learningId: string;
  rootCause: string;
  fix: string;
  evidence?: string;
  tags?: string[];
}

export function buildBelieveLearningParams(pi: ExtensionAPI) {
  return pi.zod.object({
    learningId: pi.zod.string().min(1, "learningId is required"),
    rootCause: pi.zod.string().min(1, "rootCause is required"),
    fix: pi.zod.string().min(1, "fix is required"),
    evidence: pi.zod.string().optional(),
    tags: pi.zod.array(pi.zod.string()).optional(),
  });
}

export async function executeBelieveLearning(
  runtime: NoesisRuntime,
  params: BelieveLearningParams,
): Promise<AgentToolResult<any, any>> {
  let fact!: BeliefFact;
  await runtime.stateManager.mutate((state) => {
    fact = resolveLearning(state, params.learningId, params.rootCause, params.fix);
  });
  return {
    content: [{
      type: "text",
      text: `Resolved learning ${params.learningId} into fact: ${fact.id}\n${fact.content}`,
    }],
    details: {
      id: fact.id,
      content: fact.content,
      learningId: params.learningId,
      kind: "fact (from learning)",
    },
    isError: false,
  };
}

export function registerBelieveLearningTool(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.registerTool({
    name: "noesis_believe_learning",
    label: "Noesis: Believe Learning",
    description:
      "Resolve a previously-captured learning entry into a durable belief fact. " +
      "Use when you have diagnosed the root cause of a failure and determined the fix, transforming raw learning into session knowledge. " +
      "Do NOT use for new factual observations or decisions — only for resolving an existing learning captured via noesis_commit or automatic failure detection. " +
      "The resolved fact is stored with 0.85 confidence and tagged 'learning-resolved' automatically. " +
      "For plain factual beliefs use noesis_believe_fact; for decisions use noesis_believe_decision.",
    parameters: buildBelieveLearningParams(pi),
    async execute(toolCallId, params, _signal, _onUpdate, _ctx) {
      return executeBelieveLearning(runtime, params);
    },
  });
}
