import { generateId } from "../../shared/ids.js";
import { nowISO } from "../../shared/time.js";
import type { NoesisState, BeliefFact, BeliefDecision } from "../../schema.js";

type Revisable = { id: string; status: string; supersededBy?: string };

type BeliefCollection<T extends Revisable> = {
  items: T[];
  prefix: "bf" | "bd";
};

function tagsOverlap(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a || !b || a.length === 0 || b.length === 0) return false;
  return a.some((tag) => b.includes(tag));
}

function walkToActiveHead<T extends Revisable>(items: T[], id: string, maxDepth = 100): T | null {
  const visited = new Set<string>();
  let current = items.find((item) => item.id === id);
  let depth = 0;

  while (current && depth < maxDepth) {
    if (visited.has(current.id)) return null; // cycle detected
    visited.add(current.id);

    if (current.status === "active") return current;
    if (!current.supersededBy) return null;

    const nextId = current.supersededBy;
    const next = items.find((item) => item.id === nextId);
    if (!next) return null;
    current = next;
    depth++;
  }

  return null;
}

function revise<T extends Revisable & { createdAt: string; updatedAt: string }>(
  collection: BeliefCollection<T>,
  current: T,
  contradictsIds: string[],
  sameKindDuplicate: (item: T) => boolean,
): T[] {
  if (collection.items.some(sameKindDuplicate)) return [];

  const superseded: T[] = [];
  const nextId = generateId(collection.prefix);
  const timestamp = nowISO();

  current.id = nextId;
  current.status = "active";
  current.createdAt = timestamp;
  current.updatedAt = timestamp;

  for (const id of contradictsIds) {
    const activeHead = walkToActiveHead(collection.items, id);
    if (!activeHead) continue;
    activeHead.status = "superseded";
    activeHead.supersededBy = nextId;
    activeHead.updatedAt = timestamp;
    superseded.push(activeHead);
  }

  collection.items.push(current);
  return superseded;
}

export function reviseFact(state: NoesisState, newFact: BeliefFact, contradictsIds: string[]): BeliefFact[] {
  return revise(
    { items: state.belief.facts, prefix: "bf" },
    newFact,
    contradictsIds,
    (fact) => fact.status === "active" && fact.content === newFact.content && tagsOverlap(fact.tags, newFact.tags),
  );
}

export function reviseDecision(state: NoesisState, newDecision: BeliefDecision, contradictsIds: string[]): BeliefDecision[] {
  return revise(
    { items: state.belief.decisions, prefix: "bd" },
    newDecision,
    contradictsIds,
    (decision) => decision.status === "active" && decision.content === newDecision.content && tagsOverlap(decision.tags, newDecision.tags),
  );
}
