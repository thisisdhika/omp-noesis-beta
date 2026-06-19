"use strict";

/**
 * omp-noesis: Believe Tools (split)
 * Version: 0.1.0
 *
 * Two flat tools replacing the old discriminated-union noesis_believe:
 *   noesis_believe_fact      — store a verified belief fact
 *   noesis_believe_decision  — record a design or workflow decision
 *
 * Each tool has a flat Zod schema with no .refine() — required fields are
 * enforced directly by Zod for cross-provider (including DeepSeek) compatibility.
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { AgentToolResult } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import type { GraphFinding, BeliefFact, BeliefDecision } from "../shared/schema.js";
import { AddBeliefFactUseCase } from "../application/use-cases/add-belief-fact.js";
import { AddBeliefDecisionUseCase } from "../application/use-cases/add-belief-decision.js";
import { ResolveLearningUseCase } from "../application/use-cases/resolve-learning.js";
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

  const uow = runtime.stateManager.createUnitOfWork();
  const useCase = new AddBeliefFactUseCase(uow);
  const { factId, contestedWarnings } = await useCase.execute({
    content: params.content,
    confidence,
    source: params.source,
    tags: params.tags,
    evidence: params.evidence,
    contradicts: params.contradicts,
  });

  const fact = runtime.stateManager.read().belief.facts.find(f => f.id === factId);
  if (!fact) {
    throw new Error(`Failed to retrieve created fact: ${factId}`);
  }
  // v0.2: Bridge durable retention to OMP memory backend
  if (runtime.retainToOmp && params.confidence >= 0.6) {
    runtime.retainToOmp([{
      content: `[Noesis Belief] ${params.content}`,
      context: `source: ${params.source}, confidence: ${confidence}${params.tags ? `, tags: ${params.tags.join(", ")}` : ""}`,
    }]).catch(() => {
      // Best-effort bridge; non-critical if OMP memory is unavailable
    });
  }

  // v0.3: Project belief fact to vault as best-effort side effect
  runtime.vaultStore.push({
    kind: "belief",
    projectPath: runtime.projectRoot,
    id: fact.id,
    pushedAt: fact.createdAt,
    content: fact.content,
    metadata: {
      confidence: fact.confidence,
      source: fact.source,
      tags: fact.tags?.join(", ") ?? null,
      evidence: fact.evidence ?? null,
    },
  }).catch(() => {
    // Best-effort vault projection; failure must not break the belief write
  });

  const warningText = contestedWarnings.length > 0 ? `\n\nWarnings:\n${contestedWarnings.join("\n")}` : "";

  return {
    content: [{ type: "text", text: `Created fact: ${fact.id}\n${fact.content}${warningText}` }],
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
      "For recording design decisions use noesis_believe_decision. " +
      "For cross-session durable retention, also call the OMP `retain` tool separately with the same content.",
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
  const uow = runtime.stateManager.createUnitOfWork();
  const useCase = new AddBeliefDecisionUseCase(uow);
  const { decisionId, contestedWarnings } = await useCase.execute({
    content: params.content,
    rationale: params.rationale,
    alternatives: params.alternatives,
    source: params.source,
    tags: params.tags,
    contradicts: params.contradicts,
  });

  const decision = runtime.stateManager.read().belief.decisions.find(d => d.id === decisionId);
  if (!decision) {
    throw new Error(`Failed to retrieve created decision: ${decisionId}`);
  }

  // v0.3: Project decision to vault as best-effort side effect
  runtime.vaultStore.push({
    kind: "decision",
    projectPath: runtime.projectRoot,
    id: decision.id,
    pushedAt: decision.createdAt,
    content: decision.content,
    metadata: {
      rationale: decision.rationale,
      source: decision.source,
      alternatives: decision.alternatives?.join(", ") ?? null,
      tags: decision.tags?.join(", ") ?? null,
    },
  }).catch(() => {
    // Best-effort vault projection; failure must not break the belief write
  });

  const warningText = contestedWarnings.length > 0 ? `\n\nWarnings:\n${contestedWarnings.join("\n")}` : "";

  return {
    content: [{ type: "text", text: `Created decision: ${decision.id}\n${decision.content}${warningText}` }],
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

// Domain exports (params builder, execute handler) kept for internal use.
// Tool registration (noesis_believe_learning) has been removed.
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
  const uow = runtime.stateManager.createUnitOfWork();
  const useCase = new ResolveLearningUseCase(uow);
  const factId = await useCase.execute({
    learningId: params.learningId,
    rootCause: params.rootCause,
    fix: params.fix,
  });

  const fact = runtime.stateManager.read().belief.facts.find(f => f.id === factId);
  if (!fact) {
    throw new Error(`Failed to retrieve created fact: ${factId}`);
  }

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
