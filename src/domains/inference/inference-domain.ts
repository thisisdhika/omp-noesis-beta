import { generateId } from "../../shared/ids.js";
import { nowISO } from "../../shared/time.js";
import type {
  NoesisState,
  Hypothesis,
  HypothesisStatus,
  ReasoningStep,
  BeliefFact,
} from "../../schema.js";

export function addHypothesis(
  state: NoesisState,
  content: string,
  evidence?: string,
): Hypothesis {
  const hypothesis: Hypothesis = {
    id: generateId("hy"),
    content,
    status: "testing",
    evidence,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  state.inference.hypotheses.push(hypothesis);
  return hypothesis;
}

export function addReasoningStep(
  state: NoesisState,
  content: string,
  relatesTo?: string,
): ReasoningStep {
  const step: ReasoningStep = {
    id: generateId("rs"),
    content,
    relatesTo,
    createdAt: nowISO(),
  };
  state.inference.reasoning.push(step);
  return step;
}

export function updateHypothesisStatus(
  state: NoesisState,
  id: string,
  status: HypothesisStatus,
  evidence?: string,
): Hypothesis | null {
  const hypothesis = state.inference.hypotheses.find((h) => h.id === id);
  if (!hypothesis) return null;

  hypothesis.status = status;
  if (evidence !== undefined) {
    hypothesis.evidence = evidence;
  }
  hypothesis.updatedAt = nowISO();
  return hypothesis;
}

export function confirmHypothesis(
  state: NoesisState,
  id: string,
): { hypothesis: Hypothesis; belief: BeliefFact } | null {
  const hypothesis = state.inference.hypotheses.find((h) => h.id === id);
  if (!hypothesis) return null;

  hypothesis.status = "confirmed";
  hypothesis.updatedAt = nowISO();

  const belief: BeliefFact = {
    id: generateId("bf"),
    content: hypothesis.content,
    confidence: 0.75,
    source: "inference",
    status: "active",
    tags: [`inferred-from-hy-${id}`],
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  state.belief.facts.push(belief);

  return { hypothesis, belief };
}

export function getUnresolvedHypotheses(
  state: NoesisState,
  max: number = 3,
): Hypothesis[] {
  return state.inference.hypotheses
    .filter((h) => h.status === "testing")
    .slice(0, max);
}
