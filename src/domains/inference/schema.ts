import { z } from "zod";
import { CAPS } from "../../shared/schema-base.js";

export const HypothesisStatusSchema = z.enum(["testing", "confirmed", "refuted", "abandoned"]);
export type HypothesisStatus = z.infer<typeof HypothesisStatusSchema>;

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
