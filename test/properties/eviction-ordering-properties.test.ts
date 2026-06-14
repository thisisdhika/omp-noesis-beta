import { describe, it, expect } from "vitest";
import { makeLearningEntry } from "../_harness/factories.js";
import { rankLearning } from "../../src/domains/learning/ranking-strategy.js";
import { evictLearning } from "../../src/domains/learning/eviction-strategy.js";

// ---------------------------------------------------------------------------
// Seeded PRNG — deterministic across runs
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  return function (): number {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Replicate the scoring formula from ranking-strategy.ts so we can assert independently. */
function computeScore(
  entry: { capturedAt: string; skillScope?: string; rootCause?: string; fix?: string },
  currentSkillScope?: string,
): number {
  const now = Date.now();
  const ageMs = now - new Date(entry.capturedAt).getTime();
  const ageHours = Number.isFinite(ageMs) ? ageMs / (1000 * 60 * 60) : Infinity;
  const recency = Math.max(1.0 - ageHours / 168, 0.1);

  let relevance: number;
  if (entry.skillScope === currentSkillScope) {
    relevance = 1.0;
  } else if (entry.skillScope !== undefined) {
    relevance = 0.5;
  } else {
    relevance = 0.0;
  }

  const failureMul = entry.rootCause !== undefined ? 2.0 : 1.0;
  const resolvedMul =
    entry.rootCause !== undefined && entry.fix !== undefined ? 2.0 : 1.0;

  return recency * relevance * failureMul * resolvedMul;
}

const SKILL_SCOPES = ["auth", "db", "api", "ui", "infra", "tests"] as const;

function randomTimestamp(rng: () => number): string {
  // Random point within the last 7 days
  const msAgo = Math.floor(rng() * 7 * 24 * 60 * 60 * 1000);
  return new Date(Date.now() - msAgo).toISOString();
}

function randomEntry(
  rng: () => number,
  opts?: { withRootCause?: boolean; withFix?: boolean; skillScope?: string },
) {
  const hasRootCause =
    opts?.withRootCause ?? rng() > 0.5;
  const hasFix =
    opts?.withFix ?? (hasRootCause && rng() > 0.5);

  return makeLearningEntry({
    description: `entry-${Math.floor(rng() * 1_000_000)}`,
    capturedAt: randomTimestamp(rng),
    skillScope: opts?.skillScope ?? SKILL_SCOPES[Math.floor(rng() * SKILL_SCOPES.length)],
    rootCause: hasRootCause ? `cause-${Math.floor(rng() * 10_000)}` : undefined,
    fix: hasFix ? `fix-${Math.floor(rng() * 10_000)}` : undefined,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("eviction ordering properties", () => {
  it("100 random entry sets → top entry by score is highest scored", () => {
    const rng = mulberry32(42);

    for (let i = 0; i < 100; i++) {
      const count = 5 + Math.floor(rng() * 20); // 5–24 entries
      const entries = Array.from({ length: count }, () => randomEntry(rng));

      const ranked = rankLearning(entries);

      // Compute the expected highest score independently
      const expectedBest = entries.reduce((best, e) => {
        const score = computeScore(e);
        return score > best.score ? { entry: e, score } : best;
      }, { entry: entries[0]!, score: computeScore(entries[0]!) });

      // Tolerate ties: the top-ranked entry must have the same score as the best
      const topScore = computeScore(ranked[0]!);
      expect(topScore).toBeGreaterThanOrEqual(expectedBest.score - 1e-6);
    }
  });

  it("100 random entry sets → eviction keeps exactly maxEntries", () => {
    const rng = mulberry32(42);

    for (let i = 0; i < 100; i++) {
      const count = 10 + Math.floor(rng() * 30); // 10–39 entries
      const max = 3 + Math.floor(rng() * 7);      // 3–9 max
      // Ensure we always have more entries than max to trigger eviction
      const effectiveMax = Math.min(max, count - 1);
      const entries = Array.from({ length: count }, () => randomEntry(rng));

      const result = evictLearning(entries, effectiveMax);

      expect(result.length).toBe(effectiveMax);
    }
  });

  it("returns the original array unchanged when already at capacity", () => {
    const entries = [
      makeLearningEntry({ description: "a" }),
      makeLearningEntry({ description: "b" }),
      makeLearningEntry({ description: "c" }),
    ];

    const result = evictLearning(entries, entries.length);

    expect(result).toBe(entries);
  });

  it("eviction keeps the highest scored entries", () => {
    const oldestResolved = makeLearningEntry({
      description: "old-resolved",
      capturedAt: "2026-06-01T00:00:00.000Z",
      skillScope: "auth",
      rootCause: "bad config",
      fix: "update config",
    });
    const newestRelevant = makeLearningEntry({
      description: "new-relevant",
      capturedAt: "2026-06-14T00:00:00.000Z",
      skillScope: "auth",
    });
    const staleIrrelevant = makeLearningEntry({
      description: "stale-irrelevant",
      capturedAt: "2026-06-01T00:00:00.000Z",
      skillScope: "ui",
    });

    const kept = evictLearning([oldestResolved, newestRelevant, staleIrrelevant], 1);

    expect(kept).toHaveLength(1);
    expect(kept[0]!.description).toBe("old-resolved");
  });
  it("100 random entry sets → resolved entries rank above unresolved", () => {
    const rng = mulberry32(42);

    for (let i = 0; i < 100; i++) {
      const sharedScope = SKILL_SCOPES[Math.floor(rng() * SKILL_SCOPES.length)];
      // Use a shared timestamp so recency and relevance are identical
      const sharedTimestamp = randomTimestamp(rng);

      // Create resolved entries (rootCause + fix → score multiplier 4×)
      const resolvedCount = 2 + Math.floor(rng() * 5);
      const resolved = Array.from({ length: resolvedCount }, () =>
        makeLearningEntry({
          description: `resolved-${Math.floor(rng() * 1_000_000)}`,
          capturedAt: sharedTimestamp,
          skillScope: sharedScope,
          rootCause: `cause-${Math.floor(rng() * 10_000)}`,
          fix: `fix-${Math.floor(rng() * 10_000)}`,
        }),
      );

      // Create unresolved entries (no rootCause → score multiplier 1×)
      const unresolvedCount = 2 + Math.floor(rng() * 5);
      const unresolved = Array.from({ length: unresolvedCount }, () =>
        makeLearningEntry({
          description: `unresolved-${Math.floor(rng() * 1_000_000)}`,
          capturedAt: sharedTimestamp,
          skillScope: sharedScope,
          rootCause: undefined,
          fix: undefined,
        }),
      );

      const ranked = rankLearning([...resolved, ...unresolved]);

      // Property: no unresolved entry appears before a resolved entry.
      // Equivalently, once we see an unresolved entry, all following entries
      // must also be unresolved.
      let seenUnresolved = false;
      for (const entry of ranked) {
        if (entry.rootCause === undefined) {
          seenUnresolved = true;
        } else {
          // Resolved entry appearing after an unresolved one violates the property
          expect(seenUnresolved).toBe(false);
        }
      }
    }
  });
});
