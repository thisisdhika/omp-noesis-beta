import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestContext, type TestContext } from "../_harness/fixtures.js";
import {
  makeFact,
  makeDecision,
  makeHypothesis,
  makeLearningEntry,
  makeState,
} from "../_harness/factories.js";
import {
  assertPreambleContains,
  assertPreambleNotExceeded,
  assertPreambleHasSections,
} from "../_harness/assertions.js";
import { buildPreamble } from "../../src/rendering/preamble-builder.js";
import { EMPTY_STATE } from "../../src/schema.js";
import { estimateTokens } from "../../src/shared/tokens.js";

describe("preamble budget", () => {
  let ctx: TestContext & { cleanup: () => void };
  beforeEach(() => {
    ctx = createTestContext();
  });
  afterEach(() => {
    ctx.cleanup();
  });

  it("preamble ≤ 2000 tokens for populated state", () => {
    const facts = Array.from({ length: 10 }, (_, i) =>
      makeFact({ content: `fact-${i}`, confidence: 0.9, source: "execution" }),
    );
    const decisions = Array.from({ length: 5 }, (_, i) =>
      makeDecision({ content: `decision-${i}`, rationale: `rationale-${i}` }),
    );
    const hypotheses = Array.from({ length: 3 }, (_, i) =>
      makeHypothesis({ content: `hypothesis-${i}`, status: "testing" }),
    );
    const learningEntries = Array.from({ length: 50 }, (_, i) =>
      makeLearningEntry({ description: `learning-${i}` }),
    );

    const state = makeState({
      belief: { facts, decisions },
      inference: { hypotheses, reasoning: [] },
      learning: {
        successes: [],
        failures: learningEntries,
        summary: { successCount: 0, failureCount: 50, resolvedCount: 0 },
      },
    });

    const opts = {
      capability: "FULL" as const,
      learningRanked: learningEntries,
      staleNotes: [],
      projectName: "test-project",
      consistencyWarnings: [],
    };

    const preamble = buildPreamble(state, opts);
    assertPreambleNotExceeded(preamble, 2000);
  });

  it("preamble has correct section ordering", () => {
    const facts = [makeFact({ content: "ordering-fact", confidence: 0.95 })];
    const decisions = [makeDecision({ content: "ordering-decision" })];
    const hypotheses = [makeHypothesis({ content: "ordering-hypothesis", status: "testing" })];
    const learningEntries = [makeLearningEntry({ description: "ordering-learning" })];

    const state = makeState({
      attention: {
        focus: "test focus area",
        graphQueries: [],
        files: [],
        contextUsage: 0,
        updatedAt: new Date().toISOString(),
      },
      belief: { facts, decisions },
      inference: { hypotheses, reasoning: [] },
      commitment: {
        workflow: {
          goal: "test workflow goal",
          status: "active" as const,
          steps: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        actions: [],
      },
      learning: {
        successes: [],
        failures: learningEntries,
        summary: { successCount: 0, failureCount: 1, resolvedCount: 0 },
      },
    });

    const opts = {
      capability: "FULL" as const,
      learningRanked: learningEntries,
      staleNotes: [],
      projectName: "test-project",
      consistencyWarnings: [],
    };

    const preamble = buildPreamble(state, opts);

    assertPreambleHasSections(preamble, [
      "[Noesis]",
      "[Work]",
      "[Decisions]",
      "[Beliefs]",
      "[Hypotheses]",
      "[Learning]",
    ]);

    // Verify ordering: each section header must appear after the previous one
    const sectionOrder = ["[Noesis]", "[Work]", "[Decisions]", "[Beliefs]", "[Hypotheses]", "[Learning]"];
    let lastIndex = -1;
    for (const section of sectionOrder) {
      const idx = preamble.indexOf(section);
      if (idx === -1) continue; // section may be absent if empty
      expect(idx).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });

  it("empty state → minimal preamble with [Noesis] header", () => {
    const opts = {
      capability: "FULL" as const,
      learningRanked: [],
      staleNotes: [],
      projectName: "test-project",
      consistencyWarnings: [],
    };

    const preamble = buildPreamble(EMPTY_STATE(), opts);

    expect(preamble.length).toBeGreaterThan(0);
    assertPreambleContains(preamble, "[Noesis]");
  });

  it("preamble includes project name", () => {
    const facts = [makeFact({ content: "project-name-fact", confidence: 0.95 })];

    const state = makeState({
      belief: { facts, decisions: [] },
    });

    const opts = {
      capability: "FULL" as const,
      learningRanked: [],
      staleNotes: [],
      projectName: "test-project",
      consistencyWarnings: [],
    };

    const preamble = buildPreamble(state, opts);
    assertPreambleContains(preamble, "test-project");
  });

  // ---------------------------------------------------------------------------
  // estimateTokens unit behaviour
  // ---------------------------------------------------------------------------

  it("estimateTokens returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("estimateTokens estimates ASCII text at ~0.25 tokens per char", () => {
    const text = "Hello world this is ASCII content for token estimation.";
    const estimated = estimateTokens(text);
    expect(estimated).toBeGreaterThan(0);
    // ASCII chars produce roughly 0.25 tokens per character
    expect(estimated).toBeLessThanOrEqual(Math.ceil(text.length * 0.5));
  });

  it("estimateTokens estimates CJK text higher than ASCII per character", () => {
    const cjk = "这是一个测试包含中文内容。";
    const ascii = "a".repeat(cjk.length);
    const cjkTokens = estimateTokens(cjk);
    const asciiTokens = estimateTokens(ascii);
    // CJK chars are more token-dense (≈2 per char vs 0.25 per ASCII char)
    expect(cjkTokens).toBeGreaterThan(asciiTokens);
  });

  it("estimateTokens discounts whitespace relative to ASCII content", () => {
    const spaced = "    a    b    c    d    ";
    const dense = "abcd";
    // spaced has 3× the chars but whitespace is heavily discounted
    expect(estimateTokens(spaced)).toBeLessThanOrEqual(estimateTokens(dense) + 4);
  });

  it("estimateTokens handles mixed ASCII/CJK/whitespace content", () => {
    const mixed = "Hello 你好 world 世界 test 测试 done 结束";
    const estimated = estimateTokens(mixed);
    expect(estimated).toBeGreaterThan(0);
    // Estimate should be less than raw char count (not every char is a full token)
    expect(estimated).toBeLessThan(mixed.length);
  });

  it("preamble with mixed CJK/ASCII content stays within MAX_TOKENS budget", () => {
    const facts = Array.from({ length: 8 }, (_, i) =>
      makeFact({
        content: `事实-fact-${i} : 关键发现说明 explanation`,
        confidence: 0.9,
        source: "execution",
      }),
    );
    const decisions = Array.from({ length: 4 }, (_, i) =>
      makeDecision({
        content: `决定-decision-${i} rationale 理由`,
        rationale: `因为-because-${i}`,
      }),
    );
    const hypotheses = Array.from({ length: 3 }, (_, i) =>
      makeHypothesis({
        content: `假说-hypothesis-${i} status-test`,
        status: "testing",
      }),
    );
    const learningEntries = Array.from({ length: 20 }, (_, i) =>
      makeLearningEntry({ description: `学习条目-learning-${i}` }),
    );

    const state = makeState({
      belief: { facts, decisions },
      inference: { hypotheses, reasoning: [] },
      learning: {
        successes: [],
        failures: learningEntries,
        summary: { successCount: 0, failureCount: 20, resolvedCount: 0 },
      },
    });

    const opts = {
      capability: "FULL" as const,
      learningRanked: learningEntries,
      staleNotes: [],
      projectName: "test-project-测试项目",
      consistencyWarnings: [],
    };

    const preamble = buildPreamble(state, opts);
    assertPreambleNotExceeded(preamble, 2000);
  });
});
