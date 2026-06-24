import type { IUnitOfWork } from "../../infrastructure/unit-of-work.js";
import { generateId } from "../../shared/schema-base.js";
import type { Hypothesis } from "../../domains/inference/schema.js";

export interface ConfirmHypothesisInput {
  id: string;
  autoPromote?: boolean;
}

export class ConfirmHypothesisUseCase {
  constructor(private uow: IUnitOfWork) {}

  async execute(input: ConfirmHypothesisInput): Promise<{ hypothesisId: string; beliefFactId?: string }> {
    const hyp = this.uow.inference.findHypothesisById(input.id);
    if (!hyp) {
      throw new Error(`Hypothesis not found: ${input.id}`);
    }

    const updates: Partial<Hypothesis> = {
      status: "confirmed" as const,
    };

    let beliefFactId: string | undefined;

    if (input.autoPromote !== false) {
      const factId = generateId("bf");
      const timestamp = new Date().toISOString();

      this.uow.belief.addFact({
        id: factId,
        content: hyp.content,
        confidence: 0.85,
        source: "inference",
        createdAt: timestamp,
        updatedAt: timestamp,
        status: "active",
        tags: hyp.tags,
        evidence: hyp.evidence,
      });

      updates.relatedBeliefId = factId;
      beliefFactId = factId;
    }

    this.uow.inference.updateHypothesis(input.id, updates);
    await this.uow.commit();

    return { hypothesisId: hyp.id, beliefFactId };
  }
}
