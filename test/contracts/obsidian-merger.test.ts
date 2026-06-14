import { describe, it, expect } from "vitest";
import type { VaultArtifact } from "../../src/schema.js";
import { EMPTY_STATE } from "../../src/schema.js";
import { mergeVaultPull } from "../../src/vault/obsidian-merger.js";
import {
  makeFact,
  makeDecision,
  makeState,
  makeStateWithFacts,
  makeStateWithDecisions,
} from "../_harness/factories.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVA(overrides?: Partial<VaultArtifact>): VaultArtifact {
  return {
    kind: "belief",
    projectPath: "test/p",
    id: `va-${Math.random().toString(36).slice(2, 10)}`,
    content: "some content",
    metadata: {},
    pushedAt: "2025-06-01T12:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Belief artifacts
// ---------------------------------------------------------------------------

describe("mergeVaultPull", () => {
  describe("belief artifacts (kind: 'belief')", () => {
    it("adds a new fact to state.belief.facts and reports in result.addedFacts", () => {
      const state = EMPTY_STATE();
      const artifact = makeVA({ kind: "belief", id: "b1", content: "The sky is blue" });

      const result = mergeVaultPull(state, [artifact]);

      expect(state.belief.facts).toHaveLength(1);
      const f = state.belief.facts[0]!;
      expect(f.id).toBe("b1");
      expect(f.content).toBe("The sky is blue");
      expect(f.source).toBe("vault");
      expect(result.addedFacts).toHaveLength(1);
      expect(result.addedFacts[0]!.id).toBe("b1");
    });

    it("skips existing fact with the same id — state is more current", () => {
      const existing = makeFact({ id: "b-ex", content: "original", source: "user" });
      const state = makeStateWithFacts([existing]);
      const artifact = makeVA({
        kind: "belief",
        id: "b-ex",
        content: "vault version — should be ignored",
      });

      const result = mergeVaultPull(state, [artifact]);

      expect(state.belief.facts).toHaveLength(1);
      expect(state.belief.facts[0]!.content).toBe("original");
      expect(result.addedFacts).toHaveLength(0);
    });

    it("caps vault confidence at 0.80", () => {
      const state = EMPTY_STATE();
      const artifact = makeVA({
        kind: "belief",
        id: "b-conf",
        metadata: { confidence: 0.95 },
      });

      mergeVaultPull(state, [artifact]);

      expect(state.belief.facts).toHaveLength(1);
      expect(state.belief.facts[0]!.confidence).toBe(0.8);
    });

    it("uses 0.80 default when no confidence in metadata or content", () => {
      const state = EMPTY_STATE();
      const artifact = makeVA({ kind: "belief", id: "b-def" });

      mergeVaultPull(state, [artifact]);

      expect(state.belief.facts).toHaveLength(1);
      expect(state.belief.facts[0]!.confidence).toBe(0.8);
    });

    it("preserves vault confidence below cap", () => {
      const state = EMPTY_STATE();
      const artifact = makeVA({
        kind: "belief",
        id: "b-low",
        metadata: { confidence: 0.55 },
      });

      mergeVaultPull(state, [artifact]);

      expect(state.belief.facts).toHaveLength(1);
      expect(state.belief.facts[0]!.confidence).toBe(0.55);
    });

    it("extracts tags, communityScope, and evidenceNodes from metadata", () => {
      const state = EMPTY_STATE();
      const artifact = makeVA({
        kind: "belief",
        id: "b-rich",
        content: "rich fact",
        metadata: {
          tags: ["observability", "metrics"],
          "community-scope": "squad-alpha",
          "evidence-nodes": ["obs-1", "obs-2"],
        },
      });

      mergeVaultPull(state, [artifact]);

      expect(state.belief.facts).toHaveLength(1);
      const fact = state.belief.facts[0]!;
      expect(fact.tags).toEqual(["observability", "metrics"]);
      expect(fact.communityScope).toBe("squad-alpha");
      expect(fact.evidenceNodes).toEqual(["obs-1", "obs-2"]);
    });

    it("extracts supersededBy from metadata", () => {
      const state = EMPTY_STATE();
      const artifact = makeVA({
        kind: "belief",
        id: "b-old",
        metadata: { "superseded-by": "b-new" },
      });

      mergeVaultPull(state, [artifact]);

      expect(state.belief.facts).toHaveLength(1);
      expect(state.belief.facts[0]!.supersededBy).toBe("b-new");
    });

    it("extracts structured content from JSON payload", () => {
      const state = EMPTY_STATE();
      const artifact = makeVA({
        kind: "belief",
        id: "b-json",
        content: JSON.stringify({
          content: "extracted content",
          confidence: 0.7,
          tags: ["a"],
        }),
      });

      mergeVaultPull(state, [artifact]);

      expect(state.belief.facts).toHaveLength(1);
      const fact = state.belief.facts[0]!;
      expect(fact.content).toBe("extracted content");
      expect(fact.confidence).toBe(0.7);
      expect(fact.tags).toEqual(["a"]);
    });
  });

  // ---------------------------------------------------------------------------
  // Decision artifacts
  // ---------------------------------------------------------------------------

  describe("decision artifacts (kind: 'decision')", () => {
    it("adds a new decision to state.belief.decisions and reports in result.addedDecisions", () => {
      const state = EMPTY_STATE();
      const artifact = makeVA({
        kind: "decision",
        id: "d1",
        content: "use PostgreSQL",
      });

      const result = mergeVaultPull(state, [artifact]);

      expect(state.belief.decisions).toHaveLength(1);
      const d = state.belief.decisions[0]!;
      expect(d.id).toBe("d1");
      expect(d.content).toBe("use PostgreSQL");
      expect(d.source).toBe("vault");
      expect(result.addedDecisions).toHaveLength(1);
      expect(result.addedDecisions[0]!.id).toBe("d1");
    });

    it("updates existing decision when vault artifact is newer", () => {
      const existing = makeDecision({
        id: "d-upd",
        content: "old content",
        updatedAt: "2025-01-01T00:00:00.000Z",
      });
      const state = makeStateWithDecisions([existing]);
      const artifact = makeVA({
        kind: "decision",
        id: "d-upd",
        content: "updated content",
        pushedAt: "2025-06-01T12:00:00.000Z",
      });

      const result = mergeVaultPull(state, [artifact]);

      expect(state.belief.decisions).toHaveLength(1);
      expect(state.belief.decisions[0]!.content).toBe("updated content");
      expect(result.addedDecisions).toHaveLength(1);
      expect(result.addedDecisions[0]!.id).toBe("d-upd");
      expect(result.conflicts).toHaveLength(0);
    });

    it("reports conflict when vault artifact is older than existing decision", () => {
      const existing = makeDecision({
        id: "d-conf",
        content: "state version",
        updatedAt: "2025-06-15T00:00:00.000Z",
      });
      const state = makeStateWithDecisions([existing]);
      const artifact = makeVA({
        kind: "decision",
        id: "d-conf",
        content: "old vault version",
        pushedAt: "2025-01-01T00:00:00.000Z",
      });

      const result = mergeVaultPull(state, [artifact]);

      // State unchanged
      expect(state.belief.decisions).toHaveLength(1);
      expect(state.belief.decisions[0]!.content).toBe("state version");
      // Conflict reported
      expect(result.conflicts).toEqual(["d-conf"]);
      expect(result.addedDecisions).toHaveLength(0);
    });

    it("extracts alternatives, tags, and supersededBy from metadata", () => {
      const state = EMPTY_STATE();
      const artifact = makeVA({
        kind: "decision",
        id: "d-rich",
        content: JSON.stringify({
          content: "use MySQL",
          rationale: "better replication",
          alternatives: ["PostgreSQL", "SQLite"],
        }),
        metadata: {
          tags: ["db", "storage"],
          "superseded-by": "d-final",
        },
      });

      mergeVaultPull(state, [artifact]);

      expect(state.belief.decisions).toHaveLength(1);
      const dec = state.belief.decisions[0]!;
      expect(dec.content).toBe("use MySQL");
      expect(dec.rationale).toBe("better replication");
      expect(dec.alternatives).toEqual(["PostgreSQL", "SQLite"]);
      expect(dec.tags).toEqual(["db", "storage"]);
      expect(dec.supersededBy).toBe("d-final");
    });
  });

  // ---------------------------------------------------------------------------
  // Learning artifacts
  // ---------------------------------------------------------------------------

  describe("learning artifacts (kind: 'learning')", () => {
    it("adds learning with resolved:true to state.learning.successes", () => {
      const state = EMPTY_STATE();
      const artifact = makeVA({
        kind: "learning",
        id: "l1",
        content: "Always validate input",
        metadata: { resolved: true },
      });

      mergeVaultPull(state, [artifact]);

      expect(state.learning.successes).toHaveLength(1);
      const s = state.learning.successes[0]!;
      expect(s.id).toBe("l1");
      expect(s.description).toBe("Always validate input");
      expect(state.learning.failures).toHaveLength(0);
    });

    it("adds learning with resolved:undefined to successes (default assumption)", () => {
      const state = EMPTY_STATE();
      const artifact = makeVA({
        kind: "learning",
        id: "l-def",
        content: "Default resolved",
        // no resolved field
      });

      mergeVaultPull(state, [artifact]);

      expect(state.learning.successes).toHaveLength(1);
      expect(state.learning.successes[0]!.id).toBe("l-def");
      expect(state.learning.failures).toHaveLength(0);
    });

    it("skips learning with resolved:false — does not add to successes or failures", () => {
      const state = EMPTY_STATE();
      const artifact = makeVA({
        kind: "learning",
        id: "l-skip",
        content: "Should not appear",
        metadata: { resolved: false },
      });

      mergeVaultPull(state, [artifact]);

      expect(state.learning.successes).toHaveLength(0);
      expect(state.learning.failures).toHaveLength(0);
    });

    it("skips learning when id already exists in successes", () => {
      const state = makeState({
        learning: {
          successes: [
            { id: "l-dup", description: "original", capturedAt: "2025-01-01T00:00:00.000Z" },
          ],
          failures: [],
          summary: { successCount: 1, failureCount: 0, resolvedCount: 0 },
        },
      });
      const artifact = makeVA({
        kind: "learning",
        id: "l-dup",
        content: "duplicate — should be ignored",
      });

      mergeVaultPull(state, [artifact]);

      expect(state.learning.successes).toHaveLength(1);
      expect(state.learning.successes[0]!.description).toBe("original");
    });

    it("skips learning when id already exists in failures (global id dedup)", () => {
      const state = makeState({
        learning: {
          successes: [],
          failures: [
            { id: "l-fail", description: "failed entry", capturedAt: "2025-01-01T00:00:00.000Z" },
          ],
          summary: { successCount: 0, failureCount: 1, resolvedCount: 0 },
        },
      });
      const artifact = makeVA({
        kind: "learning",
        id: "l-fail",
        content: "should be ignored (id in failures)",
      });

      mergeVaultPull(state, [artifact]);

      expect(state.learning.successes).toHaveLength(0);
      expect(state.learning.failures).toHaveLength(1);
    });

    it("truncates description to 500 characters", () => {
      const state = EMPTY_STATE();
      const longContent = "x".repeat(1000);
      const artifact = makeVA({
        kind: "learning",
        id: "l-long",
        content: longContent,
      });

      mergeVaultPull(state, [artifact]);

      expect(state.learning.successes).toHaveLength(1);
      expect(state.learning.successes[0]!.description).toHaveLength(500);
    });
  });

  // ---------------------------------------------------------------------------
  // Combined / edge cases
  // ---------------------------------------------------------------------------

  describe("combined and edge cases", () => {
    it("merges multiple artifact kinds and returns correct summary counts", () => {
      const state = EMPTY_STATE();
      const artifacts: VaultArtifact[] = [
        makeVA({ kind: "belief", id: "cb1", content: "fact one" }),
        makeVA({ kind: "belief", id: "cb2", content: "fact two" }),
        makeVA({ kind: "decision", id: "cd1", content: "decision one" }),
        makeVA({ kind: "learning", id: "cl1", content: "learning one", metadata: { resolved: true } }),
      ];

      const result = mergeVaultPull(state, artifacts);

      expect(state.belief.facts).toHaveLength(2);
      expect(state.belief.decisions).toHaveLength(1);
      expect(state.learning.successes).toHaveLength(1);
      expect(result.addedFacts).toHaveLength(2);
      expect(result.addedDecisions).toHaveLength(1);
      expect(result.conflicts).toHaveLength(0);
    });

    it("returns empty result when no artifacts are provided", () => {
      const state = EMPTY_STATE();
      const result = mergeVaultPull(state, []);
      expect(result.addedFacts).toHaveLength(0);
      expect(result.addedDecisions).toHaveLength(0);
      expect(result.conflicts).toHaveLength(0);
    });

    it("ignores pattern artifacts without error", () => {
      const state = EMPTY_STATE();
      const artifact = makeVA({ kind: "pattern", id: "p1", content: "some pattern" });
      const result = mergeVaultPull(state, [artifact]);
      expect(result.addedFacts).toHaveLength(0);
      expect(result.addedDecisions).toHaveLength(0);
      expect(result.conflicts).toHaveLength(0);
    });
  });
});
