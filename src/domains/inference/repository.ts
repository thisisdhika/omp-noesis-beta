import type { Hypothesis, ReasoningStep } from "./schema.js";

export interface IInferenceRepository {
  addHypothesis(hypothesis: Hypothesis): void;
  addReasoningStep(step: ReasoningStep): void;
  findHypothesisById(id: string): Hypothesis | undefined;
  getAllHypotheses(): Hypothesis[];
  getAllReasoningSteps(): ReasoningStep[];
  updateHypothesis(id: string, updates: Partial<Hypothesis>): void;
  setHypotheses(hypotheses: Hypothesis[]): void;
}
