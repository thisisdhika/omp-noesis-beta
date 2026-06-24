import { z } from "zod";
import { createHash } from "node:crypto";


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
  graphQueryTokenBudget: 500,
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

export const PrioritySchema = z.enum(["critical", "high", "normal", "low"]);
export type Priority = z.infer<typeof PrioritySchema>;

export const CapabilityLevelSchema = z.enum(["FULL", "STALE", "NO_GRAPH", "DEGRADED"]);
export type CapabilityLevel = z.infer<typeof CapabilityLevelSchema>;

export function generateId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function contentHash(content: string): string {
  return createHash("sha256").update(content.slice(0, 128)).digest("hex").slice(0, 16);
}
