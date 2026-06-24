import { z } from "zod";
import { CAPS } from "../../shared/schema-base.js";

export const LearningStatusSchema = z.enum(["captured", "resolved"]);
export type LearningStatus = z.infer<typeof LearningStatusSchema>;

export const LessonTriggerSchema = z.object({
  pattern: z.string().max(200),
  toolName: z.string().optional(),
  skillScope: z.string().optional(),
});
export type LessonTrigger = z.infer<typeof LessonTriggerSchema>;

export const LessonDiagnosisSchema = z.object({
  rootCause: z.string().max(1000),
  graphNodes: z.array(z.string()).max(5).optional(),
});
export type LessonDiagnosis = z.infer<typeof LessonDiagnosisSchema>;

export const LessonInterventionSchema = z.object({
  fix: z.string().max(1000),
  confidence: z.number().min(0).max(1),
});
export type LessonIntervention = z.infer<typeof LessonInterventionSchema>;

export const LessonPreventionSchema = z.object({
  beliefStatement: z.string().max(1000),
  autoApplied: z.boolean().default(false),
});
export type LessonPrevention = z.infer<typeof LessonPreventionSchema>;

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
  trigger: LessonTriggerSchema.optional(),
  diagnosis: LessonDiagnosisSchema.optional(),
  intervention: LessonInterventionSchema.optional(),
  prevention: LessonPreventionSchema.optional(),
  retrievalKeys: z.array(z.string().max(50)).max(5).optional(),
});
export type LearningEntry = z.infer<typeof LearningEntrySchema>;

export const LearningSummarySchema = z.object({
  successCount: z.number().default(0),
  failureCount: z.number().default(0),
  resolvedCount: z.number().default(0),
});
export type LearningSummary = z.infer<typeof LearningSummarySchema>;

export const LearningLayerSchema = z.object({
  successes: z.array(LearningEntrySchema).default([]),
  failures: z.array(LearningEntrySchema).default([]),
  summary: LearningSummarySchema.default({ successCount: 0, failureCount: 0, resolvedCount: 0 }),
});
export type LearningLayer = z.infer<typeof LearningLayerSchema>;
