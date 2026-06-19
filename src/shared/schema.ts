import { z } from "zod";

// Import from shared base
import { CURRENT_VERSION, CapabilityLevelSchema } from "./schema-base.js";

// Import domain layer schemas
import { AttentionLayerSchema } from "../domains/attention/schema.js";
import { BeliefLayerSchema } from "../domains/belief/schema.js";
import { InferenceLayerSchema } from "../domains/inference/schema.js";
import { CommitmentLayerSchema } from "../domains/commitment/schema.js";
import { LearningLayerSchema } from "../domains/learning/schema.js";

// Re-export shared base constants, types and helpers
export * from "./schema-base.js";

// Re-export domain layer schemas and types for convenience
export * from "../domains/attention/schema.js";
export * from "../domains/belief/schema.js";
export * from "../domains/inference/schema.js";
export * from "../domains/commitment/schema.js";
export * from "../domains/learning/schema.js";

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

export const EMPTY_STATE: NoesisState = {
  version: CURRENT_VERSION,
  lastPersisted: new Date().toISOString(),
  attention: {
    focus: "",
    priority: "normal",
    graphQueries: [],
    files: [],
    graphFindings: [],
    pendingEvidence: [],
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
      id: `wf-${crypto.randomUUID()}`,
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
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
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
  modelFamily: z.string().optional(),
});
export type RenderContext = z.infer<typeof RenderContextSchema>;
