import type { IUnitOfWork } from "../../infrastructure/unit-of-work.js";
import type { WorkflowStep, StepStatus } from "../../domains/commitment/schema.js";
import { checkCircularDeps } from "../../domains/commitment/consistency-strategy.js";

export interface UpdateWorkflowStepInput {
  stepId: string;
  status: StepStatus;
  note?: string;
}

export class UpdateWorkflowStepUseCase {
  constructor(private uow: IUnitOfWork) {}

  async execute(input: UpdateWorkflowStepInput): Promise<WorkflowStep> {
    const commitmentRepo = this.uow.commitment;
    const wf = commitmentRepo.getWorkflow();
    if (!wf) {
      throw new Error("No workflow found.");
    }

    const step = wf.steps.find((s) => s.id === input.stepId);
    if (!step) {
      throw new Error(`Workflow step not found: ${input.stepId}`);
    }

    const oldStatus = step.status;
    const newStatus = input.status;
    const timestamp = new Date().toISOString();

    step.status = newStatus;
    step.updatedAt = timestamp;

    if (oldStatus === "done" && newStatus === "pending") {
      const cycles = checkCircularDeps(wf);
      if (cycles.length > 0) {
        throw new Error(`Circular dependency detected involving steps: ${cycles.join(", ")}`);
      }
    }

    if (input.note !== undefined && step.verification !== undefined) {
      step.verification = step.verification + "\n" + input.note;
    }

    commitmentRepo.setWorkflow(wf);
    await this.uow.commit();
    return step;
  }
}
