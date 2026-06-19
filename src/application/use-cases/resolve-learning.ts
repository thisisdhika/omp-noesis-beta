import type { IUnitOfWork } from "../../infrastructure/unit-of-work.js";
import { CAPS, generateId } from "../../shared/schema-base.js";
import { truncate } from "../../shared/text.js";

export interface ResolveLearningInput {
  learningId: string;
  rootCause: string;
  fix: string;
}

export class ResolveLearningUseCase {
  constructor(private uow: IUnitOfWork) {}

  async execute(input: ResolveLearningInput): Promise<string> {
    const learningRepo = this.uow.learning;
    const beliefRepo = this.uow.belief;

    // 1. Locate the entry
    let entry = learningRepo.getSuccesses().find(e => e.id === input.learningId);
    let isSuccess = true;
    if (!entry) {
      entry = learningRepo.getFailures().find(e => e.id === input.learningId);
      isSuccess = false;
    }

    if (!entry) {
      throw new Error(`Learning entry not found: ${input.learningId}`);
    }

    // 2. Resolve the learning entry
    const resolvedAt = new Date().toISOString();
    const updates = {
      status: "resolved" as const,
      rootCause: input.rootCause,
      fix: input.fix,
      resolvedAt,
    };

    if (isSuccess) {
      learningRepo.updateSuccess(input.learningId, updates);
    } else {
      learningRepo.updateFailure(input.learningId, updates);
    }

    // Update summary counts
    const summary = learningRepo.getSummary();
    learningRepo.updateSummary({
      ...summary,
      resolvedCount: summary.resolvedCount + 1,
    });

    // 3. Construct belief content
    const parts = [entry.description];
    if (input.rootCause.length > 0) parts.push(`Root cause: ${input.rootCause}`);
    if (input.fix.length > 0) parts.push(`Fix: ${input.fix}`);

    const factId = generateId("bf");
    const timestamp = new Date().toISOString();

    // 4. Add fact to belief repository
    beliefRepo.addFact({
      id: factId,
      content: truncate(parts.join("\n"), CAPS.contentLength),
      confidence: 0.85,
      source: "inference",
      createdAt: timestamp,
      updatedAt: timestamp,
      status: "active",
      tags: ["learning-resolved"],
    });

    // 5. Commit transaction
    await this.uow.commit();
    return factId;
  }
}
