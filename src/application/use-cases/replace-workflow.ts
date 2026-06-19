import type { IUnitOfWork } from "../../infrastructure/unit-of-work.js";
import { CAPS, generateId } from "../../shared/schema-base.js";
import type { Workflow, WorkflowStatus } from "../../domains/commitment/schema.js";

export interface ReplaceWorkflowInput {
  goal: string;
  steps: { description: string; dependsOn?: string[]; verification?: string }[];
  status?: WorkflowStatus;
}

export class ReplaceWorkflowUseCase {
  constructor(private uow: IUnitOfWork) {}

  async execute(input: ReplaceWorkflowInput): Promise<Workflow> {
    const commitmentRepo = this.uow.commitment;
    const timestamp = new Date().toISOString();

    const slicedSteps = input.steps.slice(0, CAPS.workflowSteps);

    const wf: Workflow = {
      id: generateId("wf"),
      goal: input.goal,
      status: input.status ?? "active",
      steps: slicedSteps.map((s) => ({
        id: generateId("ws"),
        description: s.description,
        status: "pending" as const,
        dependsOn: s.dependsOn,
        verification: s.verification,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    commitmentRepo.setWorkflow(wf);
    await this.uow.commit();
    return wf;
  }
}
