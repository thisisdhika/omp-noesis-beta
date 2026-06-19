import type { IUnitOfWork } from "../../infrastructure/unit-of-work.js";
import { generateId } from "../../shared/schema-base.js";
import type { Hypothesis } from "../../domains/inference/schema.js";

export interface UpdateHypothesisInput {
  id: string;
  status: "testing" | "refuted" | "abandoned";
  evidence?: string;
  reasoning?: string;
}

export class UpdateHypothesisUseCase {
  constructor(private uow: IUnitOfWork) {}

  async execute(input: UpdateHypothesisInput): Promise<Hypothesis> {
    const inferenceRepo = this.uow.inference;
    const hypothesis = inferenceRepo.findHypothesisById(input.id);
    if (!hypothesis) {
      throw new Error(`Hypothesis not found: ${input.id}`);
    }

    const timestamp = new Date().toISOString();

    if (input.reasoning) {
      inferenceRepo.addReasoningStep({
        id: generateId("rs"),
        content: input.reasoning,
        relatesTo: input.id,
        createdAt: timestamp,
      });
    }

    const updates: Partial<Hypothesis> = {
      status: input.status,
      updatedAt: timestamp,
    };

    if (input.evidence !== undefined) {
      updates.evidence = input.evidence;
    }

    inferenceRepo.updateHypothesis(input.id, updates);
    await this.uow.commit();

    const updated = inferenceRepo.findHypothesisById(input.id);
    if (!updated) {
      throw new Error(`Hypothesis not found after update: ${input.id}`);
    }
    return updated;
  }
}
