import { generateId } from "../../shared/ids.js";
import { nowISO } from "../../shared/time.js";
import type { NoesisState, BeliefFact, BeliefDecision } from "../../schema.js";

function tagsOverlap(
  a: string[] | undefined,
  b: string[] | undefined,
): boolean {
  if (!a || !b || a.length === 0 || b.length === 0) return false;
  return a.some((t) => b.includes(t));
}

function walkToActiveHead(
  state: NoesisState,
  factId: string,
): BeliefFact | null {
  let currentId: string | undefined = factId;
  while (currentId) {
    const fact = state.belief.facts.find((f) => f.id === currentId);
    if (!fact) return null;
    if (fact.status === "active") return fact;
    if (!fact.supersededBy) return null;
    currentId = fact.supersededBy;
  }
  return null;
}

function walkToActiveDecisionHead(
  state: NoesisState,
  decisionId: string,
): BeliefDecision | null {
  let currentId: string | undefined = decisionId;
  while (currentId) {
    const decision = state.belief.decisions.find((d) => d.id === currentId);
    if (!decision) return null;
    if (decision.status === "active") return decision;
    if (!decision.supersededBy) return null;
    currentId = decision.supersededBy;
  }
  return null;
}

export function reviseFact(
  state: NoesisState,
  newFact: BeliefFact,
  contradictsIds: string[],
): BeliefFact[] {
  // Dedup: identical content + overlapping tags on any active fact → no-op
  const hasDuplicate = state.belief.facts.some(
    (f) =>
      f.status === "active" &&
      f.content === newFact.content &&
      tagsOverlap(f.tags, newFact.tags),
  );
  if (hasDuplicate) return [];

  const superseded: BeliefFact[] = [];
  const nextId = generateId("bf");
  const timestamp = nowISO();

  newFact.id = nextId;
  newFact.status = "active";
  newFact.createdAt = timestamp;
  newFact.updatedAt = timestamp;

  for (const id of contradictsIds) {
    const activeHead = walkToActiveHead(state, id);
    if (activeHead) {
      activeHead.status = "superseded";
      activeHead.supersededBy = nextId;
      activeHead.updatedAt = timestamp;
      superseded.push(activeHead);
    }
  }

  state.belief.facts.push(newFact);

  return superseded;
}

export function reviseDecision(
  state: NoesisState,
  newDecision: BeliefDecision,
  contradictsIds: string[],
): BeliefDecision[] {
  // Dedup: identical content + overlapping tags on any active decision → no-op
  const hasDuplicate = state.belief.decisions.some(
    (d) =>
      d.status === "active" &&
      d.content === newDecision.content &&
      tagsOverlap(d.tags, newDecision.tags),
  );
  if (hasDuplicate) return [];

  const superseded: BeliefDecision[] = [];
  const nextId = generateId("bd");
  const timestamp = nowISO();

  newDecision.id = nextId;
  newDecision.status = "active";
  newDecision.createdAt = timestamp;
  newDecision.updatedAt = timestamp;

  for (const id of contradictsIds) {
    const activeHead = walkToActiveDecisionHead(state, id);
    if (activeHead) {
      activeHead.status = "superseded";
      activeHead.supersededBy = nextId;
      activeHead.updatedAt = timestamp;
      superseded.push(activeHead);
    }
  }

  state.belief.decisions.push(newDecision);

  return superseded;
}
