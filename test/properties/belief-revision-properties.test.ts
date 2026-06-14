import { describe, it, expect } from "vitest";
import { makeFact, makeState, makeLearningEntry, makeHypothesis, makeDecision } from "../_harness/factories.js";
import { addFact } from "../../src/domains/belief/belief-domain.js";
import { buildPreamble } from "../../src/rendering/preamble-builder.js";
import { estimateTokens } from "../../src/shared/tokens.js";

// ---------------------------------------------------------------------------
// Seeded PRNG — deterministic across runs, no external dependency
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  return function (): number {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Walk a supersededBy chain from a starting fact id until we reach an active
 *  fact or exhaust the chain.  Returns the active head or null. */
function walkToActive(
  facts: Array<{ id: string; status: string; supersededBy?: string }>,
  startId: string,
  maxDepth = 100,
): (typeof facts)[number] | null {
  const visited = new Set<string>();
  let current = facts.find((f) => f.id === startId) ?? null;
  let depth = 0;

  while (current && depth < maxDepth) {
    if (visited.has(current.id)) return null; // cycle
    visited.add(current.id);
    if (current.status === "active") return current;
    if (!current.supersededBy) return null;
    current = facts.find((f) => f.id === current!.supersededBy) ?? null;
    depth++;
  }
  return null;
}

const TAG_POOL = ["auth", "db", "api", "cache", "ui", "perf", "test", "infra"];

function randomTags(rng: () => number, max: number): string[] {
  const count = 1 + Math.floor(rng() * max);
  const tags: string[] = [];
  for (let t = 0; t < count; t++) {
    const tag = TAG_POOL[Math.floor(rng() * TAG_POOL.length)];
    if (tag) tags.push(tag);
  }
  return [...new Set(tags)];
}

function randomString(rng: () => number, minLen: number, maxLen: number): string {
  const len = minLen + Math.floor(rng() * (maxLen - minLen + 1));
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789 ";
  let s = "";
  for (let i = 0; i < len; i++) {
    const c = chars[Math.floor(rng() * chars.length)];
    if (c) s += c;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Property tests — 100 iterations each, seed=42
// ---------------------------------------------------------------------------

describe("Belief Revision Properties", () => {
  // -------------------------------------------------------------------------
  // 1. K*5 Consistency: no active fact ever has supersededBy pointing to
  //    another active fact after arbitrary addFact sequences.
  // -------------------------------------------------------------------------
  it("K*5 Consistency across 100 random revision sequences", () => {
    const rng = mulberry32(42);

    for (let i = 0; i < 100; i++) {
      const state = makeState();
      const count = 5 + Math.floor(rng() * 11); // 5-15

      for (let j = 0; j < count; j++) {
        addFact(state, {
          type: "fact",
          content: `fact-${i}-${j}`,
          confidence: 0.1 + rng() * 0.9,
          source: "execution",
          tags: [TAG_POOL[j % TAG_POOL.length] ?? `tag-${j}`],
        });
      }

      // Invariant: no active fact points via supersededBy to another active fact
      for (const fact of state.belief.facts) {
        if (fact.status === "active" && fact.supersededBy) {
          const target = state.belief.facts.find((f) => f.id === fact.supersededBy);
          expect(
            target?.status,
            `Active fact ${fact.id} has supersededBy pointing to active ${fact.supersededBy}`,
          ).not.toBe("active");
        }
      }
    }
  });

  // -------------------------------------------------------------------------
  // 2. K*6 Equivalence: adding a fact with identical content+tags to an
  //    existing active fact is a no-op — the duplicate never creates a new
  //    belief entry.
  // -------------------------------------------------------------------------
  it("K*6 Equivalence across 100 random dedup sequences", () => {
    const rng = mulberry32(42);

    for (let i = 0; i < 100; i++) {
      const state = makeState();
      const content = `duplicate-content-${i}`;
      const tags = randomTags(rng, 3);

      // First add — should succeed
      const first = addFact(state, {
        type: "fact",
        content,
        confidence: 0.5 + rng() * 0.5,
        source: "execution",
        tags,
      });
      expect(first.created.status).toBe("active");
      const countAfterFirst = state.belief.facts.length;

      // Second add with identical content and overlapping tags — should be no-op
      addFact(state, {
        type: "fact",
        content,
        confidence: 0.5 + rng() * 0.5,
        source: "execution",
        tags,
      });

      expect(
        state.belief.facts.length,
        `Duplicate add for "${content}" should not create a new belief (iteration ${i})`,
      ).toBe(countAfterFirst);
    }
  });

  // -------------------------------------------------------------------------
  // 3. Revision chains always terminate at an active fact.
  //    Build chains of 2-10 revisions via contradictsIds, then walk from the
  //    first fact through supersededBy links — must reach an active fact.
  // -------------------------------------------------------------------------
  it("100 revision chains always terminate at active", () => {
    const rng = mulberry32(42);

    for (let i = 0; i < 100; i++) {
      const state = makeState();
      const chainLen = 2 + Math.floor(rng() * 9); // 2-10

      // Build a revision chain: each new fact contradicts the previous one
      const first = addFact(state, {
        type: "fact",
        content: `chain-${i}-v0`,
        confidence: 0.8 + rng() * 0.2,
        source: "execution",
        tags: [`chain-${i}`],
      });
      let prevId = first.created.id;

      for (let v = 1; v < chainLen; v++) {
        const result = addFact(state, {
          type: "fact",
          content: `chain-${i}-v${v}`,
          confidence: 0.8 + rng() * 0.2,
          source: "execution",
          tags: [`chain-${i}`],
          contradictsIds: [prevId],
        });
        prevId = result.created.id;
      }

      // Walk from the very first fact — must reach an active head
      const head = walkToActive(state.belief.facts, first.created.id);
      expect(
        head,
        `Chain starting at ${first.created.id} (iteration ${i}) must terminate at an active fact`,
      ).not.toBeNull();
      expect(head!.status).toBe("active");
    }
  });

  // -------------------------------------------------------------------------
  // 4. Random state populations always produce a preamble within the 2000
  //    token budget.
  // -------------------------------------------------------------------------
  it("100 random states produce preamble ≤ 2000 tokens", () => {
    const rng = mulberry32(42);

    for (let i = 0; i < 100; i++) {
      // Generate random counts within documented caps
      const factCount = 1 + Math.floor(rng() * 20);
      const decisionCount = Math.floor(rng() * 10);
      const hypothesisCount = Math.floor(rng() * 5);
      const learningCount = Math.floor(rng() * 50);

      // Build random facts
      const facts = Array.from({ length: factCount }, () =>
        makeFact({
          content: randomString(rng, 10, 200),
          confidence: 0.5 + rng() * 0.5,
          source: "execution",
          status: "active",
          tags: randomTags(rng, 3),
        }),
      );

      // Build random hypotheses
      const hypotheses = Array.from({ length: hypothesisCount }, () =>
        makeHypothesis({
          content: randomString(rng, 10, 150),
          status: (["testing", "confirmed", "refuted", "abandoned"] as const)[
            Math.floor(rng() * 4)
          ],
        }),
      );

      // Build random learning entries
      const learningEntries = Array.from({ length: learningCount }, () =>
        makeLearningEntry({
          description: randomString(rng, 10, 200),
          rootCause: rng() > 0.5 ? randomString(rng, 10, 100) : undefined,
          fix: rng() > 0.5 ? randomString(rng, 10, 100) : undefined,
        }),
      );

      const state = makeState({
        belief: {
          facts,
          decisions: Array.from({ length: decisionCount }, () =>
            makeDecision({
              content: randomString(rng, 10, 150),
              rationale: randomString(rng, 5, 80),
            }),
          ),
        },
        inference: { hypotheses, reasoning: [] },
        learning: {
          successes: [],
          failures: learningEntries,
          summary: {
            successCount: 0,
            failureCount: learningEntries.length,
            resolvedCount: learningEntries.filter((e) => e.rootCause && e.fix).length,
          },
        },
      });

      const preamble = buildPreamble(state, {
        capability: "FULL",
        learningRanked: learningEntries.slice(0, 5),
        staleNotes: [],
        projectName: "test-project",
        consistencyWarnings: [],
      });

      const tokens = estimateTokens(preamble);
      expect(
        tokens,
        `Iteration ${i}: preamble estimated at ${tokens} tokens, exceeds 2000 budget. ` +
          `State had ${factCount} facts, ${decisionCount} decisions, ${hypothesisCount} hypotheses, ${learningCount} learning entries.`,
      ).toBeLessThanOrEqual(2000);
    }
  });
});
