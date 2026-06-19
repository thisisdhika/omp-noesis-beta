import type { InferenceLayer, Hypothesis, ReasoningStep } from "../../domains/inference/schema.js";
import { now } from "../../shared/time.js";

export class InferenceRepository {
  constructor(private segment: InferenceLayer) {}

  addHypothesis(hypothesis: Hypothesis): void {
    this.segment.hypotheses.push(hypothesis);
  }

  addReasoningStep(step: ReasoningStep): void {
    this.segment.reasoning.push(step);
  }

  findHypothesisById(id: string): Hypothesis | undefined {
    return this.segment.hypotheses.find(h => h.id === id);
  }

  getAllHypotheses(): Hypothesis[] {
    return [...this.segment.hypotheses];
  }

  getAllReasoningSteps(): ReasoningStep[] {
    return [...this.segment.reasoning];
  }

  updateHypothesis(id: string, updates: Partial<Hypothesis>): void {
    const hypothesis = this.findHypothesisById(id);
    if (hypothesis) {
      Object.assign(hypothesis, updates);
      hypothesis.updatedAt = now();
    }
  }

  setHypotheses(hypotheses: Hypothesis[]): void {
    this.segment.hypotheses = [...hypotheses];
  }
}
export type IInferenceRepo = Pick<InferenceRepository, 'addHypothesis' | 'addReasoningStep' | 'findHypothesisById' | 'getAllHypotheses' | 'getAllReasoningSteps' | 'updateHypothesis' | 'setHypotheses'>;
