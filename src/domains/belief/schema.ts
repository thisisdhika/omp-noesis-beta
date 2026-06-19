import { z } from "zod";
import { CAPS } from "../../shared/schema-base.js";

export const BeliefStatusSchema = z.enum(["active", "superseded", "archived"]);
export type BeliefStatus = z.infer<typeof BeliefStatusSchema>;

export const BeliefSourceSchema = z.enum(["graph", "execution", "user", "inference"]);
export type BeliefSource = z.infer<typeof BeliefSourceSchema>;

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
