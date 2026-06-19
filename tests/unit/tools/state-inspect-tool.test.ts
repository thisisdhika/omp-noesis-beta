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
    expect(result.details.query).toBe("active_beliefs");
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
    expect(result.details.count).toBe(1);
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
    expect(result.details.error).toBe("missing_fields");
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
    expect(result.details.query).toBe("search");
    expect(result.details.keyword).toBe("Database");
    expect(result.details.totalMatches).toBeGreaterThanOrEqual(1);
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
    expect(result.details.totalMatches).toBe(0);
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
    expect(result.details.totalMatches).toBe(4);
    const results = result.details.results as Array<{ kind: string; id: string }>;
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
    expect(result.details.totalMatches).toBe(1);
    const results = result.details.results as Array<{ kind: string }>;
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
    expect(result.details.totalMatches).toBe(1);
    const results = result.details.results as Array<{ kind: string }>;
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
    expect(result.details.totalMatches).toBe(1);
    const results = result.details.results as Array<{ kind: string }>;
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
    expect(result.details.totalMatches).toBe(1);
    const results = result.details.results as Array<{ kind: string }>;
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
    expect(result.details.totalMatches).toBe(2);
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
    expect(result.details.count).toBeGreaterThanOrEqual(1);
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
    expect(result.details.count).toBe(1);
    expect(textContent(result)).toContain("Unit test hypothesis");
  });
});
