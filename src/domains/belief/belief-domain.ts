import { applyStalePenalty } from "./confidence-strategy.js";
import { reviseFact, reviseDecision } from "./revision-strategy.js";
import { generateId } from "../../shared/ids.js";
import { nowISO } from "../../shared/time.js";
import type {
  NoesisState,
  BeliefFact,
  BeliefDecision,
  LearningEntry,
  StaleReviewNote,
  CapabilityLevel,
  NoesisBelieveFactParams,
  NoesisBelieveDecisionParams,
} from "../../schema.js";

export function addFact(
  state: NoesisState,
  params: NoesisBelieveFactParams,
): { created: BeliefFact; superseded: BeliefFact[] } {
  const fact: BeliefFact = {
    id: generateId("bf"),
    content: params.content,
    confidence: params.confidence,
    source: params.source,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    status: "active",
    tags: params.tags,
    communityScope: params.communityScope,
  };

  const superseded = reviseFact(state, fact, params.contradictsIds ?? []);
  return { created: fact, superseded };
}

export function addDecision(
  state: NoesisState,
  params: NoesisBelieveDecisionParams,
): { created: BeliefDecision; superseded: BeliefDecision[] } {
  const decision: BeliefDecision = {
    id: generateId("bd"),
    content: params.content,
    rationale: params.rationale,
    alternatives: params.alternatives,
    source: "execution",
    createdAt: nowISO(),
    updatedAt: nowISO(),
    status: "active",
    tags: params.tags,
  };

  const superseded = reviseDecision(
    state,
    decision,
    params.contradictsIds ?? [],
  );
  return { created: decision, superseded };
}

export function resolveLearning(
  state: NoesisState,
  learningId: string,
  rootCause: string,
  fix: string,
): LearningEntry | null {
  let entry: LearningEntry | undefined = state.learning.failures.find(
    (e) => e.id === learningId,
  );
  if (!entry) {
    entry = state.learning.successes.find((e) => e.id === learningId);
  }
  if (!entry) return null;

  const wasUnresolved =
    entry.rootCause === undefined && entry.fix === undefined;
  entry.rootCause = rootCause;
  entry.fix = fix;
  if (wasUnresolved) {
    state.learning.summary.resolvedCount++;
  }
  return entry;
}

export function getActiveFacts(
  state: NoesisState,
  minConfidence?: number,
): BeliefFact[] {
  return state.belief.facts.filter((f) => {
    if (f.status !== "active") return false;
    if (minConfidence !== undefined && f.confidence < minConfidence)
      return false;
    return true;
  });
}

export function getActiveDecisions(
  state: NoesisState,
): BeliefDecision[] {
  return state.belief.decisions.filter((d) => d.status === "active");
}

export function computeStaleReviewNotes(
  state: NoesisState,
  capability: CapabilityLevel,
  lastGraphRefresh?: string,
): StaleReviewNote[] {
  if (capability === "FULL") return [];
  if (!lastGraphRefresh) return [];

  const notes: StaleReviewNote[] = [];

  for (const fact of state.belief.facts) {
    if (
      fact.status === "active" &&
      fact.source === "graph" &&
      fact.createdAt < lastGraphRefresh
    ) {
      const adjustedConfidence = applyStalePenalty(fact.confidence);
      const preview =
        fact.content.length > 80
          ? fact.content.slice(0, 80) + "..."
          : fact.content;
      notes.push({
        beliefId: fact.id,
        originalConfidence: fact.confidence,
        adjustedConfidence,
        message: `Belief "${preview}" is stale (created ${fact.createdAt}, last refresh ${lastGraphRefresh}). Confidence adjusted from ${fact.confidence} to ${adjustedConfidence}.`,
      });
    }
  }

  return notes;
}
