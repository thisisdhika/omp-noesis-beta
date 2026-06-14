import type { NoesisState, BeliefFact, BeliefDecision, Hypothesis, LearningEntry } from "../../src/schema.js";

// ---------------------------------------------------------------------------
// AGM postulate assertions
// ---------------------------------------------------------------------------

/**
 * Finds a fact whose content exactly matches and whose status is "active".
 * Throws if not found or not active.
 */
export function assertFactActive(facts: BeliefFact[], content: string): BeliefFact {
  for (const f of facts) {
    if (f.content === content) {
      if (f.status !== "active") {
        throw new Error(
          `Expected fact "${content}" to be active, but status is "${f.status}"`
        );
      }
      return f;
    }
  }
  throw new Error(`Expected fact "${content}" not found in facts array`);
}

/**
 * Asserts the fact identified by `supersededId` has status "superseded"
 * and its `supersededBy` equals `supersededById`.
 */
export function assertFactSuperseded(
  facts: BeliefFact[],
  supersededId: string,
  supersededById: string,
): void {
  const f = facts.find((x) => x.id === supersededId);
  if (!f) {
    throw new Error(`Expected superseded fact "${supersededId}" not found`);
  }
  if (f.status !== "superseded") {
    throw new Error(
      `Expected fact "${supersededId}" to be superseded, got "${f.status}"`,
    );
  }
  if (f.supersededBy !== supersededById) {
    throw new Error(
      `Expected fact "${supersededId}".supersededBy to be "${supersededById}", got "${f.supersededBy}"`,
    );
  }
}

/**
 * Asserts that every id in `originalIds` still exists in the current facts array.
 */
export function assertNoFactDeleted(
  originalIds: Set<string>,
  currentState: NoesisState,
): void {
  for (const id of originalIds) {
    if (!currentState.belief.facts.some((f) => f.id === id)) {
      throw new Error(`Fact "${id}" was removed from the facts array`);
    }
  }
}

/**
 * Groups facts by content and asserts at most one active fact per group.
 * Throws with details listing every violating group.
 */
export function assertOneActivePerClaim(facts: BeliefFact[]): void {
  const groups = new Map<string, BeliefFact[]>();
  for (const f of facts) {
    const group = groups.get(f.content);
    if (group) {
      group.push(f);
    } else {
      groups.set(f.content, [f]);
    }
  }

  const violations: string[] = [];
  for (const [content, group] of groups) {
    const active = group.filter((f) => f.status === "active");
    if (active.length > 1) {
      const ids = active.map((f) => f.id).join(", ");
      violations.push(
        `Content "${content}" has ${active.length} active facts: [${ids}]`,
      );
    }
  }

  if (violations.length > 0) {
    throw new Error(
      "Expected at most one active fact per claim, but found violations:\n" +
        violations.join("\n"),
    );
  }
}

/**
 * Walks the supersededBy chain starting from `headId` and asserts it
 * terminates at an active fact. Guards against cycles with a 100-hop limit.
 */
export function assertChainTerminatesAtActive(
  facts: BeliefFact[],
  headId: string,
): void {
  const map = new Map<string, BeliefFact>();
  for (const f of facts) {
    map.set(f.id, f);
  }

  let current = map.get(headId);
  if (!current) {
    throw new Error(`Chain head "${headId}" not found in facts array`);
  }

  for (let hops = 0; hops < 100; hops++) {
    if (current.status === "active") {
      return; // success
    }
    if (!current.supersededBy) {
      throw new Error(
        `Chain terminated at "${current.id}" with status "${current.status}" ` +
          `but no supersededBy pointer`,
      );
    }
    const next = map.get(current.supersededBy);
    if (!next) {
      throw new Error(
        `Chain broken: "${current.id}".supersededBy points to ` +
          `"${current.supersededBy}" which is not in the facts array`,
      );
    }
    if (next.id === headId) {
      throw new Error("Cycle detected in supersededBy chain");
    }
    current = next;
  }

  throw new Error(
    `Chain exceeded 100 hops without reaching an active fact ` +
      `(ended at "${current.id}" status "${current.status}")`,
  );
}

// ---------------------------------------------------------------------------
// Confidence contract assertions
// ---------------------------------------------------------------------------

/**
 * Asserts the fact's confidence is exactly `expected`.
 */
export function assertConfidenceIsExact(fact: BeliefFact, expected: number): void {
  if (fact.confidence !== expected) {
    throw new Error(
      `Expected fact "${fact.id}" confidence to be ${expected}, got ${fact.confidence}`,
    );
  }
}

/**
 * A fact is preamble-eligible when its confidence >= 0.75 AND its status is "active".
 */
export function assertIsPreambleEligible(fact: BeliefFact, eligible: boolean): void {
  const isEligible = fact.confidence >= 0.75 && fact.status === "active";
  if (isEligible !== eligible) {
    const label = eligible ? "eligible" : "not eligible";
    throw new Error(
      `Expected fact "${fact.id}" (confidence=${fact.confidence}, status="${fact.status}") ` +
        `to be ${label} for preamble`,
    );
  }
}

// ---------------------------------------------------------------------------
// State cap assertions
// ---------------------------------------------------------------------------

export function assertFactCount(state: NoesisState, max: number): void {
  if (state.belief.facts.length > max) {
    throw new Error(
      `Expected fact count <= ${max}, got ${state.belief.facts.length}`,
    );
  }
}

export function assertDecisionCount(state: NoesisState, max: number): void {
  if (state.belief.decisions.length > max) {
    throw new Error(
      `Expected decision count <= ${max}, got ${state.belief.decisions.length}`,
    );
  }
}

export function assertHypothesisCount(state: NoesisState, max: number): void {
  if (state.inference.hypotheses.length > max) {
    throw new Error(
      `Expected hypothesis count <= ${max}, got ${state.inference.hypotheses.length}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Preamble content assertions
// ---------------------------------------------------------------------------

export function assertPreambleContains(preamble: string, expected: string): void {
  if (!preamble.includes(expected)) {
    throw new Error(
      `Expected preamble to contain "${expected}", but it was not found`,
    );
  }
}

/**
 * Estimates token count as preamble.length / 4 and asserts it does not exceed maxTokens.
 */
export function assertPreambleNotExceeded(preamble: string, maxTokens: number): void {
  const estimated = preamble.length / 4;
  if (estimated > maxTokens) {
    throw new Error(
      `Expected preamble (${preamble.length} chars ≈ ${estimated} tokens) ` +
        `not to exceed ${maxTokens} tokens`,
    );
  }
}

/**
 * Asserts each section header string appears in the preamble.
 */
export function assertPreambleHasSections(preamble: string, sections: string[]): void {
  const missing: string[] = [];
  for (const s of sections) {
    if (!preamble.includes(s)) {
      missing.push(s);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Expected preamble to contain sections:\n` +
        missing.map((s) => `  - "${s}"`).join("\n"),
    );
  }
}

// ---------------------------------------------------------------------------
// Survivor discipline assertions
// ---------------------------------------------------------------------------

/**
 * For every active fact in state with confidence >= 0.75, asserts its content
 * appears in the joined survivor context string.
 */
export function assertSurvivorsIncludeActive(
  survivorContext: string[],
  state: NoesisState,
): void {
  const joined = survivorContext.join(" ");
  const missing: string[] = [];

  for (const f of state.belief.facts) {
    if (f.status === "active" && f.confidence >= 0.75) {
      if (!joined.includes(f.content)) {
        missing.push(f.content);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      "Expected survivor context to include active facts (confidence >= 0.75), " +
        "but the following were missing:\n" +
        missing.map((c) => `  - "${c}"`).join("\n"),
    );
  }
}
