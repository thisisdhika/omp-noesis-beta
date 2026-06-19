import type { IUnitOfWork } from "../../infrastructure/unit-of-work.js";
import { generateId } from "../../shared/schema-base.js";
import type { Hypothesis } from "../../domains/inference/schema.js";

export interface AddHypothesisInput {
  content: string;
  evidence?: string;
  tags?: string[];
}

export class AddHypothesisUseCase {
  constructor(private uow: IUnitOfWork) {}

  async execute(input: AddHypothesisInput): Promise<Hypothesis> {
    const inferenceRepo = this.uow.inference;
    const timestamp = new Date().toISOString();
    const hypothesis: Hypothesis = {
      id: generateId("hy"),
      content: input.content,
      status: "testing",
      evidence: input.evidence,
      tags: input.tags,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    inferenceRepo.addHypothesis(hypothesis);
    await this.uow.commit();
    return hypothesis;
  }
}
