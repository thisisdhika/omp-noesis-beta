import { z } from "zod";
import { CAPS, PrioritySchema, generateId } from "../../shared/schema-base.js";

export const WorkflowStatusSchema = z.enum(["draft", "active", "done", "abandoned"]);
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;

export const StepStatusSchema = z.enum(["pending", "active", "done", "skipped"]);
export type StepStatus = z.infer<typeof StepStatusSchema>;

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
