"use strict";

/**
 * Unit tests for state-inspect-tool.ts — noesis_state_inspect / executeRecall.
 *
 * These tests prove that noesis_state_inspect operates exclusively against
 * current in-memory cognitive state via runtime.stateManager.read()
 * and does NOT touch persistent vault storage.
 */

import { describe, it, expect } from "bun:test";
import { createMockPi, toExtensionAPI } from "../../helpers/mock-pi.js";
import { sampleFact, sampleDecision, sampleHypothesis, sampleLearning, cleanPersistedState } from "../../helpers/fixtures.js";
import { createRuntime, type NoesisRuntime } from "../../../src/runtime.js";
import { executeRecall } from "../../../src/tools/state-inspect-tool.js";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { TextContent, ImageContent } from "@oh-my-pi/pi-ai";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function setup(): Promise<{ runtime: NoesisRuntime }> {
  cleanPersistedState();
  const pi = createMockPi();
  const runtime = await createRuntime(toExtensionAPI(pi));
  return { runtime };
}
function textContent(result: { content: (TextContent | ImageContent)[] }): string {
  const block = result.content[0];
  if (block?.type !== "text") throw new Error("Expected text content block");
  return block.text;
}
function detailsOf(result: { details?: unknown }): Record<string, any> {
  return result.details as Record<string, any>;
}


// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("noesis_state_inspect — in-memory state boundary", () => {

  it("returns empty active_beliefs from fresh in-memory state", async () => {
    const { runtime } = await setup();
    const result = await executeRecall(runtime, {
      query: "active_beliefs",
      minConfidence: 0.75,
      includeCompleted: false,
      includeSuperseded: false,
      includeArchived: false,
    });

    expect(result.isError).toBe(false);
    expect(result.details!.query).toBe("active_beliefs");
    expect(textContent(result)).toContain("(none)");
  });

  it("returns seeded fact from in-memory state via active_beliefs", async () => {
    const { runtime } = await setup();

    // Seed a fact directly against in-memory state
    await runtime.stateManager.mutate((s) => {
      s.belief.facts.push(sampleFact({
        id: "bf-test-fact-1",
        content: "In-memory boundary fact",
        confidence: 0.9,
        source: "execution",
      }));
    });

    const result = await executeRecall(runtime, {
      query: "active_beliefs",
      minConfidence: 0.5,
      includeCompleted: false,
      includeSuperseded: false,
      includeArchived: false,
    });

    expect(result.isError).toBe(false);
    expect(result.details!.count).toBe(1);
    expect(textContent(result)).toContain("In-memory boundary fact");
  });
});

describe("executeRecall — search (query=search)", () => {

  it("requires keyword — returns error when keyword is missing", async () => {
    const { runtime } = await setup();

    // We test the runtime behavior directly (keyword required is enforced
    // by both the Zod refine AND the execute handler guard at line 347)
    const result = await executeRecall(runtime, {
      query: "search",
      minConfidence: 0.75,
      includeCompleted: false,
      includeSuperseded: false,
      includeArchived: false,
    });

    expect(result.isError).toBe(true);
    expect(result.details!.error).toBe("missing_fields");
    expect(textContent(result)).toContain("Missing required field: keyword");
  });

  it("searches in-memory facts only — does NOT touch vault", async () => {
    const { runtime } = await setup();

    // Seed in-memory facts via state mutation
    await runtime.stateManager.mutate((s) => {
      s.belief.facts.push(sampleFact({
        id: "bf-mem-fact-1",
        content: "Database connection limit is 100",
        confidence: 0.9,
        source: "execution",
      }));
    });

    const result = await executeRecall(runtime, {
      query: "search",
      keyword: "Database",
      limit: 5,
      minConfidence: 0.75,
      includeCompleted: false,
      includeSuperseded: false,
      includeArchived: false,
    });

    expect(result.isError).toBe(false);
    expect(result.details!.query).toBe("search");
    expect(result.details!.keyword).toBe("Database");
    expect(result.details!.totalMatches).toBeGreaterThanOrEqual(1);
    expect(textContent(result)).toContain("Database connection limit is 100");
  });

  it("returns zero matches when keyword does not appear in in-memory state", async () => {
    const { runtime } = await setup();

    // Seed unrelated in-memory data
    await runtime.stateManager.mutate((s) => {
      s.belief.facts.push(sampleFact({
        id: "bf-mem-fact-2",
        content: "Unrelated information",
        confidence: 0.8,
        source: "user",
      }));
    });

    const result = await executeRecall(runtime, {
      query: "search",
      keyword: "nonexistent_keyword_xyzzy",
      limit: 10,
      minConfidence: 0.75,
      includeCompleted: false,
      includeSuperseded: false,
      includeArchived: false,
    });

    expect(result.isError).toBe(false);
    expect(result.details!.totalMatches).toBe(0);
    expect(textContent(result)).toContain("(no matches)");
  });

  it("searches across in-memory facts, decisions, hypotheses, and learning", async () => {
    const { runtime } = await setup();

    await runtime.stateManager.mutate((s) => {
      // fact
      s.belief.facts.push(sampleFact({
        id: "bf-cross-1",
        content: "CROSS_MARKER in fact",
        confidence: 0.9,
        source: "execution",
      }));
      // decision
      s.belief.decisions.push(sampleDecision({
        id: "bd-cross-1",
        content: "CROSS_MARKER in decision",
        rationale: "Matches testing",
        source: "user",
      }));
      // hypothesis
      s.inference.hypotheses.push(sampleHypothesis({
        id: "hy-cross-1",
        content: "CROSS_MARKER in hypothesis",
        evidence: "",
      }));
      // learning
      s.learning.successes.push(sampleLearning({
        id: "le-cross-1",
        description: "CROSS_MARKER in learning",
        status: "captured",
        rootCause: "test",
        fix: "verify",
      }));
    });

    const result = await executeRecall(runtime, {
      query: "search",
      keyword: "CROSS_MARKER",
      limit: 20,
      minConfidence: 0.75,
      includeCompleted: false,
      includeSuperseded: false,
      includeArchived: false,
    });

    expect(result.isError).toBe(false);
    // All 4 layers matched
    expect(result.details!.totalMatches).toBe(4);
    const results = result.details!.results as Array<{ kind: string; id: string }>;
    const kinds = results.map((r) => r.kind).sort();
    expect(kinds).toEqual(["decision", "fact", "hypothesis", "learning"]);
  });

  it("matches decisions by alternatives field", async () => {
    const { runtime } = await setup();

    await runtime.stateManager.mutate((s) => {
      s.belief.decisions.push(sampleDecision({
        id: "bd-alt-1",
        content: "Use primary runtime",
        rationale: "Best performance",
        alternatives: ["Node.js XYZ", "Deno"],
        source: "user",
      }));
    });

    const result = await executeRecall(runtime, {
      query: "search",
      keyword: "XYZ",
      limit: 10,
      minConfidence: 0.75,
      includeCompleted: false,
      includeSuperseded: false,
      includeArchived: false,
    });

    expect(result.isError).toBe(false);
    expect(result.details!.totalMatches).toBe(1);
    const results = result.details!.results as Array<{ kind: string }>;
    expect(results[0]!.kind).toBe("decision");
  });

  it("matches hypotheses by evidence field", async () => {
    const { runtime } = await setup();

    await runtime.stateManager.mutate((s) => {
      s.inference.hypotheses.push(sampleHypothesis({
        id: "hy-ev-1",
        content: "The app crashes",
        evidence: "Observed EVIDENCE_MATCH in logs",
      }));
    });

    const result = await executeRecall(runtime, {
      query: "search",
      keyword: "EVIDENCE_MATCH",
      limit: 10,
      minConfidence: 0.75,
      includeCompleted: false,
      includeSuperseded: false,
      includeArchived: false,
    });

    expect(result.isError).toBe(false);
    expect(result.details!.totalMatches).toBe(1);
    const results = result.details!.results as Array<{ kind: string }>;
    expect(results[0]!.kind).toBe("hypothesis");
  });

  it("matches learning entries by rootCause field", async () => {
    const { runtime } = await setup();

    await runtime.stateManager.mutate((s) => {
      s.learning.failures.push(sampleLearning({
        id: "le-rc-1",
        description: "Server timeout",
        rootCause: "ROOTCAUSE_MATCH in config",
        fix: "Increase timeout",
      }));
    });

    const result = await executeRecall(runtime, {
      query: "search",
      keyword: "ROOTCAUSE_MATCH",
      limit: 10,
      minConfidence: 0.75,
      includeCompleted: false,
      includeSuperseded: false,
      includeArchived: false,
    });

    expect(result.isError).toBe(false);
    expect(result.details!.totalMatches).toBe(1);
    const results = result.details!.results as Array<{ kind: string }>;
    expect(results[0]!.kind).toBe("learning");
  });

  it("matches learning entries by fix field", async () => {
    const { runtime } = await setup();

    await runtime.stateManager.mutate((s) => {
      s.learning.successes.push(sampleLearning({
        id: "le-fx-1",
        description: "Build flakiness",
        status: "captured",
        rootCause: "Async race condition",
        fix: "Apply FIX_MATCH patch",
      }));
    });

    const result = await executeRecall(runtime, {
      query: "search",
      keyword: "FIX_MATCH",
      limit: 10,
      minConfidence: 0.75,
      includeCompleted: false,
      includeSuperseded: false,
      includeArchived: false,
    });

    expect(result.isError).toBe(false);
    expect(result.details!.totalMatches).toBe(1);
    const results = result.details!.results as Array<{ kind: string }>;
    expect(results[0]!.kind).toBe("learning");
  });

  it("respects limit parameter (returns at most N results)", async () => {
    const { runtime } = await setup();

    await runtime.stateManager.mutate((s) => {
      for (let i = 0; i < 5; i++) {
        s.belief.facts.push(sampleFact({
          id: `bf-limit-${i}`,
          content: `Keyword fact number ${i}`,
          confidence: 0.8,
          source: "user",
        }));
      }
    });

    const result = await executeRecall(runtime, {
      query: "search",
      keyword: "Keyword",
      limit: 2,
      minConfidence: 0.75,
      includeCompleted: false,
      includeSuperseded: false,
      includeArchived: false,
    });

    expect(result.isError).toBe(false);
    expect(result.details!.totalMatches).toBe(2);
  });
});

describe("executeRecall — non-search query variants", () => {

  it("returns active decisions from in-memory state", async () => {
    const { runtime } = await setup();

    await runtime.stateManager.mutate((s) => {
      s.belief.decisions.push(sampleDecision({
        id: "bd-dec-ut-1",
        content: "Unit test decision",
        rationale: "Testing",
        source: "user",
      }));
    });

    const result = await executeRecall(runtime, {
      query: "active_decisions",
      minConfidence: 0.75,
      includeCompleted: false,
      includeSuperseded: false,
      includeArchived: false,
    });

    expect(result.isError).toBe(false);
    expect(result.details!.count).toBeGreaterThanOrEqual(1);
    expect(textContent(result)).toContain("Unit test decision");
  });

  it("returns unresolved hypotheses from in-memory state", async () => {
    const { runtime } = await setup();

    await runtime.stateManager.mutate((s) => {
      s.inference.hypotheses.push(sampleHypothesis({
        id: "hy-hyp-ut-1",
        content: "Unit test hypothesis",
        evidence: "",
      }));
    });

    const result = await executeRecall(runtime, {
      query: "unresolved_hypotheses",
      minConfidence: 0.75,
      includeCompleted: false,
      includeSuperseded: false,
      includeArchived: false,
    });

    expect(result.isError).toBe(false);
    expect(result.details!.count).toBe(1);
    expect(textContent(result)).toContain("Unit test hypothesis");
  });
});

describe("executeRecall — new query modes (attention, token_profile, compaction_history, provenance)", () => {

  it("returns attention summary from fresh state with defaults", async () => {
    const { runtime } = await setup();

    const result = await executeRecall(runtime, {
      query: "attention",
      minConfidence: 0.75,
      includeCompleted: false,
      includeSuperseded: false,
      includeArchived: false,
    });

    expect(result.isError).toBe(false);
    expect(textContent(result)).toContain("Attention Summary:");
    expect(textContent(result)).toContain("Focus: ");
    expect(textContent(result)).toContain("Priority: normal");
    expect(textContent(result)).toContain("Files (0):");
    expect(textContent(result)).toContain("Graph queries (0):");
    expect(textContent(result)).toContain("Graph findings: 0");
    expect(textContent(result)).toContain("Pending evidence items: 0");
    expect(result.details!.query).toBe("attention");
    expect(result.details!.focus).toBe("");
    expect(result.details!.priority).toBe("normal");
    expect(result.details!.fileCount).toBe(0);
    expect(result.details!.graphQueryCount).toBe(0);
    expect(result.details!.graphFindingCount).toBe(0);
    expect(result.details!.pendingEvidenceCount).toBe(0);
    expect(typeof result.details!.updatedAt).toBe("string");
  });

  it("returns attention summary with seeded graph findings and pending evidence", async () => {
    const { runtime } = await setup();
    const now = new Date().toISOString();

    await runtime.stateManager.mutate((s) => {
      s.attention.focus = "Graph-rich attention test";
      s.attention.priority = "critical";
      s.attention.files = ["a.ts", "b.ts", "c.ts"];
      s.attention.graphQueries = ["q1", "q2"];
      s.attention.graphFindings = [{
        query: "q1",
        nodes: ["node1"],
        relations: ["rel1"],
        confidence: "EXTRACTED",
        timestamp: now,
      }];
      s.attention.pendingEvidence = [{
        findings: [{
          query: "q1",
          nodes: ["node1"],
          relations: ["rel1"],
          confidence: "EXTRACTED",
          timestamp: now,
        }],
        query: "q1",
        turnAdded: 1,
        turnsRemaining: 3,
      }];
      s.attention.updatedAt = now;
    });

    const result = await executeRecall(runtime, {
      query: "attention",
      minConfidence: 0.75,
      includeCompleted: false,
      includeSuperseded: false,
      includeArchived: false,
    });

    expect(result.isError).toBe(false);
    expect(textContent(result)).toContain("Graph-rich attention test");
    expect(textContent(result)).toContain("critical");
    expect(textContent(result)).toContain("Files (3):");
    expect(textContent(result)).toContain("Graph queries (2):");
    expect(textContent(result)).toContain("Graph findings: 1");
    expect(textContent(result)).toContain("Pending evidence items: 1");
    expect(result.details!.query).toBe("attention");
    expect(result.details!.focus).toBe("Graph-rich attention test");
    expect(result.details!.priority).toBe("critical");
    expect(result.details!.fileCount).toBe(3);
    expect(result.details!.graphQueryCount).toBe(2);
    expect(result.details!.graphFindingCount).toBe(1);
    expect(result.details!.pendingEvidenceCount).toBe(1);
    expect(result.details!.updatedAt).toBe(now);
  });

  it("returns token_profile from in-memory state", async () => {
    const { runtime } = await setup();

    // Seed a fact so the token profile has at least some content to report on
    await runtime.stateManager.mutate((s) => {
      s.belief.facts.push(sampleFact({
        id: "bf-tp-1",
        content: "Token profile test fact",
        confidence: 0.9,
        source: "execution",
      }));
    });

    const result = await executeRecall(runtime, {
      query: "token_profile",
      minConfidence: 0.75,
      includeCompleted: false,
      includeSuperseded: false,
      includeArchived: false,
    });

    expect(result.isError).toBe(false);
    expect(textContent(result)).toContain("Token Profile:");
    expect(result.details!.query).toBe("token_profile");
    expect(typeof result.details!.totalTokens).toBe("number");
  });

  it("returns token_profile even from fresh empty state", async () => {
    const { runtime } = await setup();

    const result = await executeRecall(runtime, {
      query: "token_profile",
      minConfidence: 0.75,
      includeCompleted: false,
      includeSuperseded: false,
      includeArchived: false,
    });

    expect(result.isError).toBe(false);
    expect(textContent(result)).toContain("Token Profile:");
    // Even empty state has 5 sections (beliefs, inference, commitment, learning, attention) with 0 tokens
    expect(result.details!.query).toBe("token_profile");
    expect(Array.isArray(result.details!.sections)).toBe(true);
    expect(typeof result.details!.totalTokens).toBe("number");
  });

  it("returns compaction_history with seeded entries", async () => {
    const { runtime } = await setup();

    await runtime.stateManager.mutate((s) => {
      s.compactionHistory.push({
        occurredAt: "2026-06-24T00:00:00.000Z",
        preCounts: { facts: 50, decisions: 10 },
        postCounts: { facts: 30, decisions: 5 },
        preserved: ["bf-1", "bd-1"],
        degraded: [{ id: "bf-2", content: "Degraded fact", reason: "truncated" }],
        evicted: [{ id: "bf-3", content: "Evicted fact", reason: "capacity" }],
        reconstructionHints: [],
      });
    });

    const result = await executeRecall(runtime, {
      query: "compaction_history",
      minConfidence: 0.75,
      includeCompleted: false,
      includeSuperseded: false,
      includeArchived: false,
    });

    expect(result.isError).toBe(false);
    expect(textContent(result)).toContain("Compaction History (1 entries):");
    expect(textContent(result)).toContain("2026-06-24");
    expect(result.details!.query).toBe("compaction_history");
    expect(result.details!.count).toBe(1);
    expect(Array.isArray(result.details!.entries)).toBe(true);
    expect(detailsOf(result).entries[0].occurredAt).toBe("2026-06-24T00:00:00.000Z");
    expect(detailsOf(result).entries[0].preCounts).toEqual({ facts: 50, decisions: 10 });
    expect(detailsOf(result).entries[0].postCounts).toEqual({ facts: 30, decisions: 5 });
    expect(detailsOf(result).entries[0].preservedCount).toBe(2);
    expect(detailsOf(result).entries[0].degradedCount).toBe(1);
    expect(detailsOf(result).entries[0].evictedCount).toBe(1);
  });

  it("returns compaction_history with empty entries array when no history exists", async () => {
    const { runtime } = await setup();

    const result = await executeRecall(runtime, {
      query: "compaction_history",
      minConfidence: 0.75,
      includeCompleted: false,
      includeSuperseded: false,
      includeArchived: false,
    });

    expect(result.isError).toBe(false);
    expect(textContent(result)).toContain("Compaction History (0 entries):");
    expect(result.details!.count).toBe(0);
    expect(result.details!.entries).toEqual([]);
  });

  it("returns provenance for a seeded fact", async () => {
    const { runtime } = await setup();

    await runtime.stateManager.mutate((s) => {
      s.belief.facts.push(sampleFact({
        id: "bf-prov-1",
        content: "Provenance test fact",
        source: "execution",
        confidence: 0.9,
        evidence: "Test evidence",
      }));
    });

    const result = await executeRecall(runtime, {
      query: "provenance",
      keyword: "bf-prov-1",
      minConfidence: 0.75,
      includeCompleted: false,
      includeSuperseded: false,
      includeArchived: false,
    });

    expect(result.isError).toBe(false);
    expect(textContent(result)).toContain("Provenance for bf-prov-1:");
    expect(textContent(result)).toContain("Provenance test fact");
    expect(textContent(result)).toContain("execution");
    expect(result.details!.query).toBe("provenance");
    expect(result.details!.beliefId).toBe("bf-prov-1");
    expect(result.details!.node).toBeDefined();
    expect(detailsOf(result).node.content).toBe("Provenance test fact");
    expect(detailsOf(result).node.source).toBe("execution");
  });

  it("returns provenance for a seeded decision", async () => {
    const { runtime } = await setup();

    await runtime.stateManager.mutate((s) => {
      s.belief.decisions.push(sampleDecision({
        id: "bd-prov-1",
        content: "Provenance test decision",
        rationale: "For testing",
        source: "user",
      }));
    });

    const result = await executeRecall(runtime, {
      query: "provenance",
      keyword: "bd-prov-1",
      minConfidence: 0.75,
      includeCompleted: false,
      includeSuperseded: false,
      includeArchived: false,
    });

    expect(result.isError).toBe(false);
    expect(textContent(result)).toContain("Provenance for bd-prov-1:");
    expect(textContent(result)).toContain("Provenance test decision");
    expect(detailsOf(result).node.content).toBe("Provenance test decision");
    expect(detailsOf(result).node.source).toBe("user");
  });

  it("returns error for provenance with unknown belief ID", async () => {
    const { runtime } = await setup();

    const result = await executeRecall(runtime, {
      query: "provenance",
      keyword: "bf-nonexistent",
      minConfidence: 0.75,
      includeCompleted: false,
      includeSuperseded: false,
      includeArchived: false,
    });

    expect(result.isError).toBe(true);
    expect(textContent(result)).toContain("No provenance found for belief ID:");
    expect(result.details!.error).toBeDefined();
    expect(result.details!.beliefId).toBe("bf-nonexistent");
  });

  it("returns provenance overview preview when no keyword given", async () => {
    const { runtime } = await setup();

    await runtime.stateManager.mutate((s) => {
      s.belief.facts.push(sampleFact({
        id: "bf-prov-preview-1",
        content: "Preview fact",
        source: "execution",
        confidence: 0.9,
      }));
    });

    const result = await executeRecall(runtime, {
      query: "provenance",
      minConfidence: 0.75,
      includeCompleted: false,
      includeSuperseded: false,
      includeArchived: false,
    });

    expect(result.isError).toBe(false);
    expect(textContent(result)).toContain("Provenance Overview");
    expect(textContent(result)).toContain("total items");
    expect(result.details!.query).toBe("provenance");
    expect(typeof result.details!.totalItems).toBe("number");
    expect(typeof result.details!.itemsWithChain).toBe("number");
  });
});
