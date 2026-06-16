"use strict";

/**
 * omp-noesis: Cognitive State Schema
 * Version: 0.1.0
 * Date: 2026-06-15
 *
 * This file defines the exact shape of the noesis cognitive state.
 * It is the schema that .omp/noesis/state.json, the cognitive preamble,
 * the compaction survivor set, the seven cognitive tools, and the five OMP hooks all depend on.
 */

import { z } from "zod";

// ============================================================================
// VERSION & CONSTANTS
// ============================================================================

export const CURRENT_VERSION = 1;
export const MAX_PREAMBLE_TOKENS = 2000;

export const CAPS = {
  STALE_THRESHOLD_HOURS: 720,
  focus: 2, // sentences
  workflow: 3, // goal + current + next
  decisions: 5,
  beliefs: 10,
  hypotheses: 3,
  learning: 3,
  graphQueries: 5,
  files: 10,
  workflowSteps: 20,
  actions: 50,
  learningEntries: 100,
  beliefTags: 5,
  decisionTags: 5,
  hypothesisTags: 5,
  alternatives: 3,
  contentLength: 1000,
  descriptionLength: 500,
  evidenceLength: 500,
  rationaleLength: 1000,
  rootCauseLength: 1000,
  fixLength: 1000,
  focusLength: 200,
  verificationLength: 200,
} as const;

// ============================================================================
// ENUMS
// ============================================================================

export const BeliefStatusSchema = z.enum(["active", "superseded", "archived"]);
export type BeliefStatus = z.infer<typeof BeliefStatusSchema>;

export const HypothesisStatusSchema = z.enum(["testing", "confirmed", "refuted", "abandoned"]);
export type HypothesisStatus = z.infer<typeof HypothesisStatusSchema>;

export const WorkflowStatusSchema = z.enum(["draft", "active", "done", "abandoned"]);
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;

export const StepStatusSchema = z.enum(["pending", "active", "done", "skipped"]);
export type StepStatus = z.infer<typeof StepStatusSchema>;

export const PrioritySchema = z.enum(["critical", "high", "normal", "low"]);
export type Priority = z.infer<typeof PrioritySchema>;

export const BeliefSourceSchema = z.enum(["graph", "execution", "user", "inference"]);
export type BeliefSource = z.infer<typeof BeliefSourceSchema>;

export const GraphConfidenceSchema = z.enum(["EXTRACTED", "INFERRED", "AMBIGUOUS"]);
export type GraphConfidence = z.infer<typeof GraphConfidenceSchema>;

export const LearningStatusSchema = z.enum(["captured", "diagnosed", "resolved"]);
export type LearningStatus = z.infer<typeof LearningStatusSchema>;

export const CapabilityLevelSchema = z.enum(["FULL", "STALE", "NO_GRAPH", "DEGRADED"]);
export type CapabilityLevel = z.infer<typeof CapabilityLevelSchema>;

// ============================================================================
// ATTENTION LAYER
// ============================================================================

export const GraphFindingSchema = z.object({
  query: z.string(),
  nodes: z.array(z.string()),
  relations: z.array(z.string()),
  confidence: GraphConfidenceSchema,
  inferredConfidence: z.number().min(0.55).max(0.95).optional(),
  community: z.string().optional(),
  godNodes: z.array(z.string()).optional(),
  surprisingConnections: z.array(z.string()).optional(),
  rawOutput: z.string().optional(),
  timestamp: z.string().datetime(),
});
export type GraphFinding = z.infer<typeof GraphFindingSchema>;

export const AttentionLayerSchema = z.object({
  focus: z.string().max(CAPS.focusLength).default(""),
  priority: PrioritySchema.default("normal"),
  graphQueries: z.array(z.string()).max(CAPS.graphQueries).default([]),
  files: z.array(z.string()).max(CAPS.files).default([]),
  graphFindings: z.array(GraphFindingSchema).default([]),
  updatedAt: z.string().datetime(),
});
export type AttentionLayer = z.infer<typeof AttentionLayerSchema>;

// ============================================================================
// BELIEF LAYER
// ============================================================================

export const BeliefFactSchema = z.object({
  id: z.string().regex(/^bf-[a-z0-9-]+$/),
  content: z.string().min(1).max(CAPS.contentLength),
  confidence: z.number().min(0).max(1),
  source: BeliefSourceSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  status: BeliefStatusSchema,
  supersededBy: z.string().optional(),
  tags: z.array(z.string().max(50)).max(CAPS.beliefTags).optional(),
  communityScope: z.string().optional(),
  evidence: z.string().max(CAPS.evidenceLength).optional(),
});
export type BeliefFact = z.infer<typeof BeliefFactSchema>;

export const BeliefDecisionSchema = z.object({
  id: z.string().regex(/^bd-[a-z0-9-]+$/),
  content: z.string().min(1).max(CAPS.contentLength),
  rationale: z.string().min(1).max(CAPS.rationaleLength),
  alternatives: z.array(z.string()).max(CAPS.alternatives).optional(),
  source: BeliefSourceSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  status: BeliefStatusSchema,
  supersededBy: z.string().optional(),
  tags: z.array(z.string().max(50)).max(CAPS.decisionTags).optional(),
});
export type BeliefDecision = z.infer<typeof BeliefDecisionSchema>;

export const BeliefLayerSchema = z.object({
  facts: z.array(BeliefFactSchema).default([]),
  decisions: z.array(BeliefDecisionSchema).default([]),
});
export type BeliefLayer = z.infer<typeof BeliefLayerSchema>;

// ============================================================================
// INFERENCE LAYER
// ============================================================================

export const HypothesisSchema = z.object({
  id: z.string().regex(/^hy-[a-z0-9-]+$/),
  content: z.string().min(1).max(CAPS.contentLength),
  status: HypothesisStatusSchema,
  evidence: z.string().max(CAPS.evidenceLength).optional(),
  relatedBeliefId: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  tags: z.array(z.string().max(50)).max(CAPS.hypothesisTags).optional(),
});
export type Hypothesis = z.infer<typeof HypothesisSchema>;

export const ReasoningStepSchema = z.object({
  id: z.string().regex(/^rs-[a-z0-9-]+$/),
  content: z.string().min(1).max(CAPS.contentLength * 2),
  relatesTo: z.string().optional(),
  createdAt: z.string().datetime(),
});
export type ReasoningStep = z.infer<typeof ReasoningStepSchema>;

export const InferenceLayerSchema = z.object({
  hypotheses: z.array(HypothesisSchema).default([]),
  reasoning: z.array(ReasoningStepSchema).default([]),
});
export type InferenceLayer = z.infer<typeof InferenceLayerSchema>;

// ============================================================================
// COMMITMENT LAYER
// ============================================================================

export const WorkflowStepSchema = z.object({
  id: z.string().regex(/^ws-[a-z0-9-]+$/),
  description: z.string().min(1).max(CAPS.descriptionLength),
  status: StepStatusSchema,
  dependsOn: z.array(z.string()).optional(),
  verification: z.string().max(CAPS.verificationLength).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const WorkflowSchema = z.object({
  id: z.string().regex(/^wf-[a-z0-9-]+$/),
  goal: z.string().max(CAPS.descriptionLength),
  status: WorkflowStatusSchema,
  steps: z.array(WorkflowStepSchema).max(CAPS.workflowSteps).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Workflow = z.infer<typeof WorkflowSchema>;

export const PlannedActionSchema = z.object({
  id: z.string().regex(/^pa-[a-z0-9-]+$/),
  content: z.string().min(1).max(CAPS.descriptionLength),
  priority: PrioritySchema.default("normal"),
  createdAt: z.string().datetime(),
});
export type PlannedAction = z.infer<typeof PlannedActionSchema>;

export const CommitmentLayerSchema = z.object({
  workflow: WorkflowSchema.default(() => ({
    id: generateId("wf"),
    goal: "",
    status: "draft" as const,
    steps: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })),
  actions: z.array(PlannedActionSchema).max(CAPS.actions).default([]),
});
export type CommitmentLayer = z.infer<typeof CommitmentLayerSchema>;

// ============================================================================
// LEARNING LAYER
// ============================================================================

export const LearningEntrySchema = z.object({
  id: z.string().regex(/^le-[a-z0-9-]+$/),
  description: z.string().min(1).max(CAPS.descriptionLength),
  rootCause: z.string().max(CAPS.rootCauseLength).optional(),
  fix: z.string().max(CAPS.fixLength).optional(),
  skillScope: z.string().optional(),
  toolName: z.string().optional(),
  status: LearningStatusSchema.default("captured"),
  capturedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional(),
  impact: z.number().min(0).max(1).optional(),
});
export type LearningEntry = z.infer<typeof LearningEntrySchema>;

export const LearningSummarySchema = z.object({
  successCount: z.number().default(0),
  failureCount: z.number().default(0),
  resolvedCount: z.number().default(0),
  diagnosedCount: z.number().default(0),
});

export const LearningLayerSchema = z.object({
  successes: z.array(LearningEntrySchema).default([]),
  failures: z.array(LearningEntrySchema).default([]),
  summary: LearningSummarySchema.default({ successCount: 0, failureCount: 0, resolvedCount: 0, diagnosedCount: 0 }),
});
export type LearningLayer = z.infer<typeof LearningLayerSchema>;

// ============================================================================
// TOP-LEVEL STATE
// ============================================================================

export const NoesisStateSchema = z.object({
  version: z.literal(CURRENT_VERSION),
  lastPersisted: z.string().datetime(),
  attention: AttentionLayerSchema,
  belief: BeliefLayerSchema,
  inference: InferenceLayerSchema,
  commitment: CommitmentLayerSchema,
  learning: LearningLayerSchema,
});
export type NoesisState = z.infer<typeof NoesisStateSchema>;

// ============================================================================
// EMPTY STATE FACTORY
// ============================================================================

export function generateId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export const EMPTY_STATE: NoesisState = {
  version: CURRENT_VERSION,
  lastPersisted: new Date().toISOString(),
  attention: {
    focus: "",
    priority: "normal",
    graphQueries: [],
    files: [],
    graphFindings: [],
    updatedAt: new Date().toISOString(),
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
      id: generateId("wf"),
      goal: "",
      status: "draft",
      steps: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    actions: [],
  },
  learning: {
    successes: [],
    failures: [],
    summary: { successCount: 0, failureCount: 0, resolvedCount: 0, diagnosedCount: 0 },
  },
};


// ============================================================================
// VAULT ARTIFACT SCHEMAS
// ============================================================================

export const VaultArtifactSchema = z.object({
  kind: z.enum(["decision", "learning", "belief", "pattern", "session"]),
  projectPath: z.string(),
  id: z.string().refine(s => !s.includes('..') && !s.includes('/'), 'Artifact ID must not contain path separators'),
  pushedAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  content: z.string(),
});
export type VaultArtifact = z.infer<typeof VaultArtifactSchema>;

export const VaultPullResultSchema = z.object({
  artifacts: z.array(VaultArtifactSchema),
  source: z.string(),
  timestamp: z.string().datetime(),
});
export type VaultPullResult = z.infer<typeof VaultPullResultSchema>;

// ============================================================================
// RENDER CONTEXT
// ============================================================================

export const RenderContextSchema = z.object({
  capabilityLevel: CapabilityLevelSchema,
  graphifyVersion: z.string().optional(),
  graphFreshness: z.object({
    lastUpdate: z.string().datetime().optional(),
    isStale: z.boolean(),
    staleHours: z.number().optional(),
  }).optional(),
  staleReviewFlags: z.array(z.string()).optional(),
  contextHookFired: z.boolean().default(false),
  hasMcpGraphify: z.boolean().optional(),
});
export type RenderContext = z.infer<typeof RenderContextSchema>;

