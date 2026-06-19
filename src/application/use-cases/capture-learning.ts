import type { IUnitOfWork } from "../../infrastructure/unit-of-work.js";
import { CAPS, generateId } from "../../shared/schema-base.js";
import { evictOverCap } from "../../domains/learning/eviction-strategy.js";
import type { LearningEntry } from "../../domains/learning/schema.js";

export interface CaptureLearningInput {
  description: string;
  toolName?: string;
  isSuccess?: boolean;
  skillScope?: string;
}

export class CaptureLearningUseCase {
  constructor(private uow: IUnitOfWork) {}

  async execute(input: CaptureLearningInput): Promise<LearningEntry> {
    const learningRepo = this.uow.learning;
    const timestamp = new Date().toISOString();
    const entryId = generateId("le");

    const entry: LearningEntry = {
      id: entryId,
      description: input.description,
      status: "captured",
      capturedAt: timestamp,
      toolName: input.toolName,
      skillScope: input.skillScope,
    };

    const isSuccess = input.isSuccess ?? false;
    const summary = learningRepo.getSummary();

    if (isSuccess) {
      learningRepo.addSuccess(entry);
      learningRepo.updateSummary({
        ...summary,
        successCount: summary.successCount + 1,
      });
      const successes = learningRepo.getSuccesses();
      learningRepo.setSuccesses(evictOverCap(successes, CAPS.learningEntries));
    } else {
      learningRepo.addFailure(entry);
      learningRepo.updateSummary({
        ...summary,
        failureCount: summary.failureCount + 1,
      });
      const failures = learningRepo.getFailures();
      learningRepo.setFailures(evictOverCap(failures, CAPS.learningEntries));
    }

    await this.uow.commit();
    return entry;
  }
}
