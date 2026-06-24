"use strict";

/**
 * omp-noesis: Sandbox Schema
 *
 * Schema definitions for speculative sandboxing — isolated belief state
 * for experimenting with beliefs before committing to main state.
 */

import { z } from "zod";
import { BeliefFactSchema, BeliefDecisionSchema } from "../belief/schema.js";
import { HypothesisSchema } from "../inference/schema.js";

export const SandboxStatusSchema = z.enum(["active", "merged", "discarded"]);
export type SandboxStatus = z.infer<typeof SandboxStatusSchema>;

export const SandboxSchema = z.object({
  id: z.string().regex(/^sb-[a-z0-9-]+$/),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  status: SandboxStatusSchema,
  createdAt: z.string().datetime(),
  mergedAt: z.string().datetime().optional(),
  // Isolated belief state
  facts: z.array(BeliefFactSchema),
  decisions: z.array(BeliefDecisionSchema),
  hypotheses: z.array(HypothesisSchema),
  // Track what was promoted to main state
  promotedFactIds: z.array(z.string()).optional(),
  promotedDecisionIds: z.array(z.string()).optional(),
});
export type Sandbox = z.infer<typeof SandboxSchema>;

export const SandboxShellSchema = z.object({
  sandboxes: z.array(SandboxSchema),
});
export type SandboxShell = z.infer<typeof SandboxShellSchema>;
