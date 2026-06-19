import type { LearningLayer, LearningEntry, LearningSummary } from "../../domains/learning/schema.js";

export class LearningRepository {
  constructor(private segment: LearningLayer) {}

  getSuccesses(): LearningEntry[] {
    return [...this.segment.successes];
  }

  getFailures(): LearningEntry[] {
    return [...this.segment.failures];
  }

  getSummary(): LearningSummary {
    return { ...this.segment.summary };
  }

  addSuccess(entry: LearningEntry): void {
    this.segment.successes.push(entry);
  }

  addFailure(entry: LearningEntry): void {
    this.segment.failures.push(entry);
  }

  updateSummary(summary: LearningSummary): void {
    this.segment.summary = { ...summary };
  }

  updateSuccess(id: string, updates: Partial<LearningEntry>): void {
    const entry = this.segment.successes.find(e => e.id === id);
    if (entry) {
      Object.assign(entry, updates);
    }
  }

  updateFailure(id: string, updates: Partial<LearningEntry>): void {
    const entry = this.segment.failures.find(e => e.id === id);
    if (entry) {
      Object.assign(entry, updates);
    }
  }

  setSuccesses(entries: LearningEntry[]): void {
    this.segment.successes = [...entries];
  }

  setFailures(entries: LearningEntry[]): void {
    this.segment.failures = [...entries];
  }
}
export type ILearningRepo = Pick<LearningRepository, 'getSuccesses' | 'getFailures' | 'getSummary' | 'addSuccess' | 'addFailure' | 'updateSummary' | 'updateSuccess' | 'updateFailure' | 'setSuccesses' | 'setFailures'>;
