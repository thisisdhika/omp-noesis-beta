import type { IUnitOfWork } from "../../infrastructure/unit-of-work.js";
import { CAPS, generateId } from "../../shared/schema-base.js";
import type { Workflow, WorkflowStep, WorkflowStatus } from "../../domains/commitment/schema.js";

export interface ExtendWorkflowInput {
  goal?: string;
  steps: { description: string; dependsOn?: string[]; verification?: string }[];
  status?: WorkflowStatus;
}

export class ExtendWorkflowUseCase {
  constructor(private uow: IUnitOfWork) {}

  async execute(input: ExtendWorkflowInput): Promise<Workflow> {
    const commitmentRepo = this.uow.commitment;
    const wf = commitmentRepo.getWorkflow();
    if (!wf) {
      throw new Error("No workflow found to extend.");
    }

    if (input.goal !== undefined) {
      wf.goal = input.goal;
    }

    const timestamp = new Date().toISOString();

    if (wf.steps.length + input.steps.length > CAPS.workflowSteps) {
      throw new Error(`Workflow steps capacity limit reached. Maximum limit is ${CAPS.workflowSteps}.`);
    }

    for (const stepDef of input.steps) {
      const step: WorkflowStep = {
        id: generateId("ws"),
        description: stepDef.description,
        status: "pending",
        dependsOn: stepDef.dependsOn,
        verification: stepDef.verification,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      wf.steps.push(step);
    }

    if (input.status !== undefined) {
      wf.status = input.status;
    }

    wf.updatedAt = timestamp;

    commitmentRepo.setWorkflow(wf);
    await this.uow.commit();
    return wf;
  }
}
