import type { LearningEntry, LearningSummary } from "./schema.js";

export interface ILearningRepository {
  getSuccesses(): LearningEntry[];
  getFailures(): LearningEntry[];
  getSummary(): LearningSummary;
  addSuccess(entry: LearningEntry): void;
  addFailure(entry: LearningEntry): void;
  updateSummary(summary: LearningSummary): void;
  updateSuccess(id: string, updates: Partial<LearningEntry>): void;
  updateFailure(id: string, updates: Partial<LearningEntry>): void;
  setSuccesses(entries: LearningEntry[]): void;
  setFailures(entries: LearningEntry[]): void;
}
