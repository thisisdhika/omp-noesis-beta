import { tagsOverlap, reviseFact, reviseDecision } from "./revision-strategy.js";
import { applyStalePenalty } from "./confidence-strategy.js";
import { generateId } from "../../shared/ids.js";
import { nowISO } from "../../shared/time.js";
import type {
  BeliefFact,
  BeliefDecision,
  LearningEntry,
  StaleReviewNote,
  CapabilityLevel,
  ContradictionResult,
  NoesisBelieveFactParams,
  NoesisBelieveDecisionParams,
} from "../../schema.js";

// ---------------------------------------------------------------------------
// Contradiction detection
// ---------------------------------------------------------------------------

/**
 * Detect whether `newContent` (optionally scoped by `newTags`) contradicts any
 * existing active entry.
 */
export function detectContradiction(
  existing: Array<{ id: string; content: string; status: string; tags?: string[] }>,
  newContent: string,
  newTags?: string[],
): ContradictionResult {
  const overlaps = existing
    .filter(
      (item) =>
        item.status === "active" &&
        item.content === newContent &&
        tagsOverlap(item.tags, newTags),
    )
    .map((item) => ({ id: item.id, content: item.content, status: item.status }));

  return {
    detected: overlaps.length > 0,
    conflictingIds: overlaps.map((o) => o.id),
    overlaps,
  };
}

// ---------------------------------------------------------------------------
// addFact
// ---------------------------------------------------------------------------

/**
 * Add a new belief fact without mutating the input array.
 *
 * - `supersedes` → marks the target as superseded, new fact is active.
 * - `revises`    → marks the target as superseded, new fact's `supersededBy` points
 *                  to the old fact.
 * - `contradictsIds` → delegates chain-walking to `reviseFact`.
 * - Overlapping facts (same content + overlapping tags) are marked as "contested".
 */
export function addFact(
  facts: BeliefFact[],
  params: NoesisBelieveFactParams,
): {
  created: BeliefFact;
  superseded: BeliefFact[];
  newFacts: BeliefFact[];
  contradictions: ContradictionResult;
  warnings: string[];
} {
  const now = nowISO();
  const id = generateId("bf");

  // Detect contradictions
  const contradictions = detectContradiction(facts, params.content, params.tags);

  // Detect overlapping facts (same content + overlapping tags) → contested
  const overlaps = facts.filter(
    (f) =>
      f.status === "active" &&
      f.content === params.content &&
      params.tags?.some((t) => f.tags?.includes(t)),
  );
  const overlappingIds = overlaps.map((o) => o.id);
  const initialStatus = overlaps.length > 0 ? "contested" : "active";

  // Build the new fact
  const newFact: BeliefFact = {
    id,
    content: params.content,
    confidence: params.confidence,
    source: params.source,
    createdAt: now,
    updatedAt: now,
    status: initialStatus,
    tags: params.tags,
    communityScope: params.communityScope,
    evidenceNodes: params.evidenceNodes,
  };

  let newFacts: BeliefFact[] = [...facts];
  let superseded: BeliefFact[] = [];

  if (params.supersedes) {
    const target = facts.find((f) => f.id === params.supersedes);
    if (target) {
      newFacts = facts.map((f) =>
        f.id === params.supersedes
          ? { ...f, status: "superseded", updatedAt: now }
          : f,
      );
      superseded = [{ ...target, status: "superseded", updatedAt: now }];
    } else {
      newFacts = [...facts];
    }
    newFacts.push(newFact);
  } else if (params.revises) {
    const target = facts.find((f) => f.id === params.revises);
    if (target) {
      newFacts = facts.map((f) =>
        f.id === params.revises
          ? { ...f, status: "superseded", updatedAt: now }
          : f,
      );
      newFact.supersededBy = params.revises;
      superseded = [{ ...target, status: "superseded", updatedAt: now }];
    } else {
      newFacts = [...facts];
    }
    newFacts.push(newFact);
  } else if (params.contradictsIds && params.contradictsIds.length > 0) {
    const result = reviseFact(facts, newFact, params.contradictsIds);
    newFacts = result.newFacts;
    superseded = result.superseded;
    newFacts.push(newFact);
  } else {
    newFacts = [...facts];
    newFacts.push(newFact);
  }

  // Mark overlapping existing facts as contested
  if (overlappingIds.length > 0) {
    newFacts = newFacts.map((f) =>
      overlappingIds.includes(f.id)
        ? { ...f, status: "contested", updatedAt: now }
        : f,
    );
  }

  return { created: newFact, superseded, newFacts, contradictions, warnings: [] };
}

// ---------------------------------------------------------------------------
// addDecision
// ---------------------------------------------------------------------------

/**
 * Add a new belief decision — same semantics as addFact.
 */
export function addDecision(
  decisions: BeliefDecision[],
  params: NoesisBelieveDecisionParams,
): {
  created: BeliefDecision;
  superseded: BeliefDecision[];
  newDecisions: BeliefDecision[];
  contradictions: ContradictionResult;
  warnings: string[];
} {
  const now = nowISO();
  const id = generateId("bd");

  // Detect contradictions
  const contradictions = detectContradiction(decisions, params.content, params.tags);

  // Overlap detection (same content + overlapping tags → contested)
  const overlaps = decisions.filter(
    (d) =>
      d.status === "active" &&
      d.content === params.content &&
      params.tags?.some((t) => d.tags?.includes(t)),
  );
  const overlappingIds = overlaps.map((o) => o.id);
  const initialStatus = overlaps.length > 0 ? "contested" : "active";

  // Build the new decision
  const newDecision: BeliefDecision = {
    id,
    content: params.content,
    rationale: params.rationale,
    alternatives: params.alternatives,
    source: "execution",
    createdAt: now,
    updatedAt: now,
    status: initialStatus,
    tags: params.tags,
  };

  let newDecisions: BeliefDecision[];
  let superseded: BeliefDecision[] = [];

  if (params.supersedes) {
    const target = decisions.find((d) => d.id === params.supersedes);
    if (target) {
      newDecisions = decisions.map((d) =>
        d.id === params.supersedes
          ? { ...d, status: "superseded", updatedAt: now }
          : d,
      );
      superseded = [{ ...target, status: "superseded", updatedAt: now }];
    } else {
      newDecisions = [...decisions];
    }
    newDecisions.push(newDecision);
  } else if (params.revises) {
    const target = decisions.find((d) => d.id === params.revises);
    if (target) {
      newDecisions = decisions.map((d) =>
        d.id === params.revises
          ? { ...d, status: "superseded", updatedAt: now }
          : d,
      );
      newDecision.supersededBy = params.revises;
      superseded = [{ ...target, status: "superseded", updatedAt: now }];
    } else {
      newDecisions = [...decisions];
    }
    newDecisions.push(newDecision);
  } else if (params.contradictsIds && params.contradictsIds.length > 0) {
    const result = reviseDecision(decisions, newDecision, params.contradictsIds);
    newDecisions = result.newDecisions;
    superseded = result.superseded;
    newDecisions.push(newDecision);
  } else {
    newDecisions = [...decisions];
    newDecisions.push(newDecision);
  }

  // Mark overlapping existing decisions as contested
  if (overlappingIds.length > 0) {
    newDecisions = newDecisions.map((d) =>
      overlappingIds.includes(d.id)
        ? { ...d, status: "contested", updatedAt: now }
        : d,
    ) as BeliefDecision[];
  }

  return { created: newDecision, superseded, newDecisions, contradictions, warnings: [] };
}

// ---------------------------------------------------------------------------
// resolveLearning
// ---------------------------------------------------------------------------

/**
 * Resolve a learning entry by providing root cause and fix.
 * Returns the updated entry (or null if not found) plus the new array.
 * Does NOT touch the learning summary — that is the caller's responsibility.
 */
export function resolveLearning(
  failures: LearningEntry[],
  successes: LearningEntry[],
  learningId: string,
  rootCause?: string,
  fix?: string,
): { updated: LearningEntry | null; newFailures: LearningEntry[]; newSuccesses: LearningEntry[] } {
  // Search failures first
  let idx = failures.findIndex((e) => e.id === learningId);
  if (idx !== -1) {
    const src = failures[idx]!;
    const updatedEntry: LearningEntry = {
      id: src.id, description: src.description, capturedAt: src.capturedAt,
      severity: src.severity, rootCause: rootCause ?? src.rootCause, fix: fix ?? src.fix,
      skillScope: src.skillScope, toolName: src.toolName,
    };
    const newFailures = failures.map((e, i) => (i === idx ? updatedEntry : e));
    return { updated: updatedEntry, newFailures, newSuccesses: [...successes] };
  }
  // Search successes
  idx = successes.findIndex((e) => e.id === learningId);
  if (idx !== -1) {
    const src = successes[idx]!;
    const updatedEntry: LearningEntry = {
      id: src.id, description: src.description, capturedAt: src.capturedAt,
      severity: src.severity, rootCause: rootCause ?? src.rootCause, fix: fix ?? src.fix,
      skillScope: src.skillScope, toolName: src.toolName,
    };
    const newSuccesses = successes.map((e, i) => (i === idx ? updatedEntry : e));
    return { updated: updatedEntry, newFailures: [...failures], newSuccesses };
  }
  return { updated: null, newFailures: [...failures], newSuccesses: [...successes] };
}

// ---------------------------------------------------------------------------
// getActiveFacts
// ---------------------------------------------------------------------------

/** Return all active facts, optionally filtering by a minimum confidence. */
export function getActiveFacts(
  facts: BeliefFact[],
  minConfidence?: number,
): BeliefFact[] {
  return facts.filter((f) => {
    if (f.status !== "active") return false;
    if (minConfidence !== undefined && f.confidence < minConfidence) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// getActiveDecisions
// ---------------------------------------------------------------------------

/** Return all active decisions. */
export function getActiveDecisions(
  decisions: BeliefDecision[],
): BeliefDecision[] {
  return decisions.filter((d) => d.status === "active");
}

// ---------------------------------------------------------------------------
// computeStaleReviewNotes
// ---------------------------------------------------------------------------

/**
 * Compute stale-review notes for graph-sourced facts that predate the last
 * graph refresh. Only runs when capability is "STALE" and a refresh timestamp
 * is available.
 */
export function computeStaleReviewNotes(
  facts: BeliefFact[],
  capability: CapabilityLevel,
  lastGraphRefresh?: string,
): StaleReviewNote[] {
  if (capability === "FULL") return [];
  if (!lastGraphRefresh) return [];

  const notes: StaleReviewNote[] = [];

  for (const fact of facts) {
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
