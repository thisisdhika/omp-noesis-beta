import type { IUnitOfWork } from "../../infrastructure/unit-of-work.js";
import { generateId } from "../../shared/schema-base.js";
import type { ReasoningStep } from "../../domains/inference/schema.js";

export interface AddReasoningStepInput {
  content: string;
  relatesTo?: string;
}

export class AddReasoningStepUseCase {
  constructor(private uow: IUnitOfWork) {}

  async execute(input: AddReasoningStepInput): Promise<ReasoningStep> {
    const inferenceRepo = this.uow.inference;
    const timestamp = new Date().toISOString();
    const step: ReasoningStep = {
      id: generateId("rs"),
      content: input.content,
      relatesTo: input.relatesTo,
      createdAt: timestamp,
    };
    inferenceRepo.addReasoningStep(step);
    await this.uow.commit();
    return step;
  }
}
