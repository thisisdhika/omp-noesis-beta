import type {
  NoesisState,
  BeliefFact,
  BeliefDecision,
  LearningEntry,
  Hypothesis,
  PlannedAction,
} from "../schema.js";
import { clone } from "../shared/clone.js";


export function stripTransientState(state: NoesisState): NoesisState {
  const copy = clone(state);
  delete copy.attention.graphFindings;
  delete copy.attention.__graphFindings;
  return copy;
}

export function evictOverCap(
  state: NoesisState,
  _max?: number,
): {
  evictedFacts: BeliefFact[];
  evictedDecisions: BeliefDecision[];
  evictedLearning: LearningEntry[];
  evictedHypotheses: Hypothesis[];
  evictedCommitmentActions: PlannedAction[];
} {
  // Placeholder: no-op eviction for now. Real logic would rank and trim.
  return {
    evictedFacts: [],
    evictedDecisions: [],
    evictedLearning: [],
    evictedHypotheses: [],
    evictedCommitmentActions: [],
  };
}

export function evictStale(
  state: NoesisState,
  _maxAge?: number,
): {
  evictedFacts: BeliefFact[];
  evictedDecisions: BeliefDecision[];
  evictedHypotheses: Hypothesis[];
} {
  // Placeholder: no-op stale eviction for now.
  return {
    evictedFacts: [],
    evictedDecisions: [],
    evictedHypotheses: [],
  };
}
