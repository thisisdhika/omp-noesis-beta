/**
 * omp-noesis: Cognitive state schema.
 *
 * All types + Zod schemas + EMPTY_STATE factory.
 * This file depends on nothing. Every other module depends on this.
 */

import { z } from "zod/v4";
import { nowISO } from "./shared/time.js";

// ============================================================================
// Constants
// ============================================================================

/** Current schema version. Bump on breaking changes. */
export const CURRENT_VERSION = 1;

// ============================================================================
// Enums / Literal unions
// ============================================================================

export type BeliefSource = "graph" | "execution" | "user" | "inference";
export const BeliefSourceSchema = z.enum(["graph", "execution", "user", "inference"]);

export type FactStatus = "active" | "superseded" | "archived";
export const FactStatusSchema = z.enum(["active", "superseded", "archived"]);

export type DecisionStatus = "active" | "superseded" | "archived";
export const DecisionStatusSchema = z.enum(["active", "superseded", "archived"]);

export type HypothesisStatus = "testing" | "confirmed" | "refuted" | "abandoned";
export const HypothesisStatusSchema = z.enum(["testing", "confirmed", "refuted", "abandoned"]);

export type WorkflowStatus = "draft" | "active" | "done" | "abandoned";
export const WorkflowStatusSchema = z.enum(["draft", "active", "done", "abandoned"]);

export type StepStatus = "pending" | "active" | "done" | "skipped";
export const StepStatusSchema = z.enum(["pending", "active", "done", "skipped"]);

export type CapabilityLevel = "FULL" | "STALE" | "NO_GRAPH" | "DEGRADED";

// ============================================================================
// Attention Layer
// ============================================================================

export const AttentionLayerSchema = z.object({
  focus: z.string().max(200).default(""),
  graphQueries: z.array(z.string()).max(5).default([]),
  files: z.array(z.string()).max(10).default([]),
  contextUsage: z.number().default(0),
  updatedAt: z.string().default(""),
  graphFindings: z.array(z.lazy(() => GraphFindingSchema)).optional(),
  __graphFindings: z.array(z.lazy(() => GraphFindingSchema)).optional(),
});

export type AttentionLayer = z.infer<typeof AttentionLayerSchema>;

// ============================================================================
// Belief Layer — Facts
// ============================================================================

export const BeliefFactSchema = z.object({
  id: z.string(),
  content: z.string(),
  confidence: z.number().min(0).max(1),
  source: BeliefSourceSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  status: FactStatusSchema,
  supersededBy: z.string().optional(),
  tags: z.array(z.string()).optional(),
  communityScope: z.string().optional(),
});

export type BeliefFact = z.infer<typeof BeliefFactSchema>;

// ============================================================================
// Belief Layer — Decisions
// ============================================================================

export const BeliefDecisionSchema = z.object({
  id: z.string(),
  content: z.string(),
  rationale: z.string(),
  alternatives: z.array(z.string()).optional(),
  source: BeliefSourceSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  status: DecisionStatusSchema,
  supersededBy: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type BeliefDecision = z.infer<typeof BeliefDecisionSchema>;

// ============================================================================
// Belief Layer
// ============================================================================

export const BeliefLayerSchema = z.object({
  facts: z.array(BeliefFactSchema).default([]),
  decisions: z.array(BeliefDecisionSchema).default([]),
});

export type BeliefLayer = z.infer<typeof BeliefLayerSchema>;

// ============================================================================
// Inference Layer — Hypothesis
// ============================================================================

export const HypothesisSchema = z.object({
  id: z.string(),
  content: z.string(),
  status: HypothesisStatusSchema,
  evidence: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Hypothesis = z.infer<typeof HypothesisSchema>;

// ============================================================================
// Inference Layer — Reasoning Step
// ============================================================================

export const ReasoningStepSchema = z.object({
  id: z.string(),
  content: z.string(),
  relatesTo: z.string().optional(),
  createdAt: z.string(),
});

export type ReasoningStep = z.infer<typeof ReasoningStepSchema>;

// ============================================================================
// Inference Layer
// ============================================================================

export const InferenceLayerSchema = z.object({
  hypotheses: z.array(HypothesisSchema).default([]),
  reasoning: z.array(ReasoningStepSchema).default([]),
});

export type InferenceLayer = z.infer<typeof InferenceLayerSchema>;

// ============================================================================
// Commitment Layer — Workflow Step
// ============================================================================

export const WorkflowStepSchema = z.object({
  id: z.string(),
  description: z.string(),
  status: StepStatusSchema,
  dependsOn: z.array(z.string()).optional(),
  verification: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

// ============================================================================
// Commitment Layer — Planned Action
// ============================================================================

export const PlannedActionSchema = z.object({
  id: z.string(),
  content: z.string(),
  createdAt: z.string(),
});

export type PlannedAction = z.infer<typeof PlannedActionSchema>;

// ============================================================================
// Commitment Layer — Workflow
// ============================================================================

export const WorkflowSchema = z.object({
  goal: z.string().default(""),
  status: WorkflowStatusSchema,
  steps: z.array(WorkflowStepSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Workflow = z.infer<typeof WorkflowSchema>;

// ============================================================================
// Commitment Layer
// ============================================================================

export const CommitmentLayerSchema = z.object({
  workflow: WorkflowSchema,
  actions: z.array(PlannedActionSchema).default([]),
});

export type CommitmentLayer = z.infer<typeof CommitmentLayerSchema>;

// ============================================================================
// Learning Layer — Entry
// ============================================================================

export const LearningEntrySchema = z.object({
  id: z.string(),
  description: z.string().max(500),
  rootCause: z.string().optional(),
  fix: z.string().optional(),
  skillScope: z.string().optional(),
  toolName: z.string().optional(),
  capturedAt: z.string(),
});

export type LearningEntry = z.infer<typeof LearningEntrySchema>;

// ============================================================================
// Learning Layer — Summary
// ============================================================================

export const LearningSummarySchema = z.object({
  successCount: z.number(),
  failureCount: z.number(),
  resolvedCount: z.number(),
});

export type LearningSummary = z.infer<typeof LearningSummarySchema>;

// ============================================================================
// Learning Layer
// ============================================================================

export const LearningLayerSchema = z.object({
  successes: z.array(LearningEntrySchema).default([]),
  failures: z.array(LearningEntrySchema).default([]),
  summary: LearningSummarySchema,
});

export type LearningLayer = z.infer<typeof LearningLayerSchema>;

// ============================================================================
// Noesis State (top-level)
// ============================================================================

export const NoesisStateSchema = z.object({
  version: z.number(),
  lastPersisted: z.string(),
  attention: AttentionLayerSchema,
  belief: BeliefLayerSchema,
  inference: InferenceLayerSchema,
  commitment: CommitmentLayerSchema,
  learning: LearningLayerSchema,
});

export type NoesisState = z.infer<typeof NoesisStateSchema>;

// ============================================================================
// Transient types (not serialized to disk)
// ============================================================================

export const ConfidenceLabelSchema = z.union([
  z.literal("EXTRACTED"),
  z.literal("AMBIGUOUS"),
  z.string().regex(/^INFERRED(?:\s+\d+(?:\.\d+)?)?$/),
]);

export const GraphFindingSchema = z.object({
  nodeName: z.string(),
  relation: z.string().optional(),
  confidence: z.number().nullable(),
  confidenceLabel: ConfidenceLabelSchema,
  community: z.string().optional(),
  isGodNode: z.boolean(),
  isSurprising: z.boolean(),
  rawSnippet: z.string(),
});

export type GraphFinding = z.infer<typeof GraphFindingSchema>;

export type AttentionWithTransientFindings = AttentionLayer & {
  graphFindings?: GraphFinding[];
  __graphFindings?: GraphFinding[];
};

export interface StaleReviewNote {
  beliefId: string;
  originalConfidence: number;
  adjustedConfidence: number;
  message: string;
}

// ============================================================================
// Tool Param Schemas
// ============================================================================

export const NoesisAttendParamsSchema = z.object({
  focus: z.string().optional(),
  graphQueries: z.array(z.string()).max(5).optional(),
  files: z.array(z.string()).max(10).optional(),
  clearGraphFindings: z.boolean().optional(),
});

export type NoesisAttendParams = z.infer<typeof NoesisAttendParamsSchema>;

export const NoesisBelieveFactParamsSchema = z.object({
  type: z.literal("fact"),
  content: z.string(),
  confidence: z.number().min(0).max(1),
  source: BeliefSourceSchema,
  tags: z.array(z.string()).optional(),
  communityScope: z.string().optional(),
  contradictsIds: z.array(z.string()).optional(),
});

export const NoesisBelieveDecisionParamsSchema = z.object({
  type: z.literal("decision"),
  content: z.string(),
  rationale: z.string(),
  alternatives: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  contradictsIds: z.array(z.string()).optional(),
});

export const NoesisBelieveLearningParamsSchema = z.object({
  type: z.literal("learning"),
  learningId: z.string(),
  rootCause: z.string().optional(),
  fix: z.string().optional(),
});

export const NoesisBelieveParamsSchema = z.discriminatedUnion("type", [
  NoesisBelieveFactParamsSchema,
  NoesisBelieveDecisionParamsSchema,
  NoesisBelieveLearningParamsSchema,
]);

export type NoesisBelieveParams = z.infer<typeof NoesisBelieveParamsSchema>;
export type NoesisBelieveFactParams = z.infer<typeof NoesisBelieveFactParamsSchema>;
export type NoesisBelieveDecisionParams = z.infer<typeof NoesisBelieveDecisionParamsSchema>;
export type NoesisBelieveLearningParams = z.infer<typeof NoesisBelieveLearningParamsSchema>;

export const NoesisInferHypothesizeSchema = z.object({
  action: z.literal("hypothesize"),
  content: z.string(),
  evidence: z.string().optional(),
});

export const NoesisInferReasonSchema = z.object({
  action: z.literal("reason"),
  content: z.string(),
  relatesTo: z.string().optional(),
});

export const NoesisInferUpdateStatusSchema = z.object({
  action: z.literal("update-status"),
  hypothesisId: z.string(),
  newStatus: HypothesisStatusSchema,
  evidence: z.string().optional(),
});

export const NoesisInferConfirmSchema = z.object({
  action: z.literal("confirm"),
  hypothesisId: z.string(),
});

export const NoesisInferParamsSchema = z.discriminatedUnion("action", [
  NoesisInferHypothesizeSchema,
  NoesisInferReasonSchema,
  NoesisInferUpdateStatusSchema,
  NoesisInferConfirmSchema,
]);

export type NoesisInferParams = z.infer<typeof NoesisInferParamsSchema>;

export const WorkflowStepInputSchema = z.object({
  description: z.string(),
  status: StepStatusSchema.optional(),
  dependsOn: z.array(z.string()).optional(),
  verification: z.string().optional(),
});

export const PlannedActionInputSchema = z.object({
  content: z.string(),
});

// ============================================================================
// Tool Result Event (for tool_result hook)
// ============================================================================

export interface ToolResultEvent {
  type: "tool_result";
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  content: Array<{ type: string; text?: string }>;
  details?: Record<string, unknown>;
  isError?: boolean;
}

export const NoesisCommitParamsSchema = z.object({
  mode: z.enum(["extend", "replace"]),
  goal: z.string().optional(),
  status: WorkflowStatusSchema.optional(),
  steps: z.array(WorkflowStepInputSchema).optional(),
  actions: z.array(PlannedActionInputSchema).optional(),
});

export type NoesisCommitParams = z.infer<typeof NoesisCommitParamsSchema>;
export type WorkflowStepInput = z.infer<typeof WorkflowStepInputSchema>;
export type PlannedActionInput = z.infer<typeof PlannedActionInputSchema>;

// ============================================================================
// EMPTY_STATE factory
// ============================================================================

export function EMPTY_STATE(): NoesisState {
  const now = nowISO();
  return {
    version: CURRENT_VERSION,
    lastPersisted: now,
    attention: {
      focus: "",
      graphQueries: [],
      files: [],
      contextUsage: 0,
      updatedAt: now,
    },
    belief: {
      facts: [],
      decisions: [],
    },
    inference: {
      hypotheses: [],
      reasoning: [],
    },
    commitment: {
      workflow: {
        goal: "",
        status: "draft",
        steps: [],
        createdAt: now,
        updatedAt: now,
      },
      actions: [],
    },
    learning: {
      successes: [],
      failures: [],
      summary: { successCount: 0, failureCount: 0, resolvedCount: 0 },
    },
  };
}
