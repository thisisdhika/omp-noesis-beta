import { z } from "zod";
import { CAPS } from "../../shared/schema-base.js";

export const LearningStatusSchema = z.enum(["captured", "diagnosed", "resolved"]);
export type LearningStatus = z.infer<typeof LearningStatusSchema>;

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
export type LearningSummary = z.infer<typeof LearningSummarySchema>;

export const LearningLayerSchema = z.object({
  successes: z.array(LearningEntrySchema).default([]),
  failures: z.array(LearningEntrySchema).default([]),
  summary: LearningSummarySchema.default({ successCount: 0, failureCount: 0, resolvedCount: 0, diagnosedCount: 0 }),
});
export type LearningLayer = z.infer<typeof LearningLayerSchema>;
