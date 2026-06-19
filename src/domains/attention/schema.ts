import { z } from "zod";
import { CAPS, PrioritySchema } from "../../shared/schema-base.js";

export const GraphConfidenceSchema = z.enum(["EXTRACTED", "INFERRED", "AMBIGUOUS"]);
export type GraphConfidence = z.infer<typeof GraphConfidenceSchema>;

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
  pendingEvidence: z.array(z.object({
    findings: z.array(GraphFindingSchema),
    query: z.string(),
    turnAdded: z.number(),
    turnsRemaining: z.number().default(3),
  })).default([]),
  updatedAt: z.string().datetime(),
});
export type AttentionLayer = z.infer<typeof AttentionLayerSchema>;
