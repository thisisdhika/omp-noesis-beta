import { describe, it, expect } from "vitest";
import { makeFact, makeDecision, makeHypothesis, makeLearningEntry, makeState } from "../_harness/factories.js";
import { buildPreamble, buildSubagentPreamble } from "../../src/rendering/preamble-builder.js";
import { estimateTokens } from "../../src/shared/tokens.js";

describe("preamble-builder contracts", () => {
  it("active and low-conf counts appear in [Noesis] header", () => {
    const facts = [
      makeFact({ confidence: 0.95 }),
      makeFact({ confidence: 0.6 }),
      makeFact({ confidence: 0.4 }),
    ];
    const state = makeState({ belief: { facts, decisions: [] } });
    const preamble = buildPreamble(state, {
      capability: "FULL",
      learningRanked: [],
      staleNotes: [],
      projectName: "proj",
      consistencyWarnings: [],
    });
    expect(preamble).toContain("Beliefs: 3 active, 1 low-conf");
  });

  it("resolved learning count appears in header", () => {
    const failures = [
      makeLearningEntry({ description: "resolved", rootCause: "rc", fix: "fix" }),
      makeLearningEntry({ description: "open" }),
    ];
    const state = makeState({
      learning: {
        successes: [],
        failures,
        summary: { successCount: 0, failureCount: 2, resolvedCount: 1 },
      },
    });
    const preamble = buildPreamble(state, {
      capability: "FULL",
      learningRanked: [],
      staleNotes: [],
      projectName: "proj",
      consistencyWarnings: [],
    });
    expect(preamble).toContain("(1 resolved)");
  });

  it("stale notes rendered in notes section", () => {
    const state = makeState();
    const preamble = buildPreamble(state, {
      capability: "FULL",
      learningRanked: [],
      staleNotes: [{ message: "stale note" }],
      projectName: "proj",
      consistencyWarnings: [],
    });
    expect(preamble).toContain("[Notes]");
    expect(preamble).toContain("⚠ stale note");
  });

  it("consistency warnings rendered in notes section", () => {
    const state = makeState();
    const preamble = buildPreamble(state, {
      capability: "FULL",
      learningRanked: [],
      staleNotes: [],
      projectName: "proj",
      consistencyWarnings: ["warning A"],
    });
    expect(preamble).toContain("[Notes]");
    expect(preamble).toContain("⚠ warning A");
  });

  it("notes section omitted when both arrays empty", () => {
    const state = makeState();
    const preamble = buildPreamble(state, {
      capability: "FULL",
      learningRanked: [],
      staleNotes: [],
      projectName: "proj",
      consistencyWarnings: [],
    });
    expect(preamble).not.toContain("[Notes]");
  });

  it("over-budget preamble is trimmed within budget", () => {
    const longDesc = "x".repeat(500);
    const facts = Array.from({ length: 20 }, (_, i) =>
      makeFact({ content: `fact-${i}-${longDesc}`, confidence: 0.9 }),
    );
    const state = makeState({ belief: { facts, decisions: [] } });
    const preamble = buildPreamble(state, {
      capability: "FULL",
      learningRanked: [],
      staleNotes: [],
      projectName: "proj",
      consistencyWarnings: [],
    });
    expect(estimateTokens(preamble)).toBeLessThanOrEqual(2000);
  });

  it("under-budget preamble is not trimmed", () => {
    const facts = [makeFact({ content: "short" })];
    const state = makeState({ belief: { facts, decisions: [] } });
    const preamble = buildPreamble(state, {
      capability: "FULL",
      learningRanked: [],
      staleNotes: [],
      projectName: "proj",
      consistencyWarnings: [],
    });
    expect(preamble).not.toContain("...");
  });

  it("special characters are XML-escaped", () => {
    const facts = [makeFact({ content: 'a < b & c > d "quoted"' })];
    const state = makeState({ belief: { facts, decisions: [] } });
    const preamble = buildPreamble(state, {
      capability: "FULL",
      learningRanked: [],
      staleNotes: [],
      projectName: "proj",
      consistencyWarnings: [],
    });
    expect(preamble).toContain("&lt;");
    expect(preamble).toContain("&gt;");
    expect(preamble).toContain("&amp;");
    expect(preamble).toContain("&quot;");
  });

  it("graph findings are included when present", () => {
    const state = makeState({
      attention: {
        focus: "",
        graphQueries: [],
        files: [],
        contextUsage: 0,
        updatedAt: new Date().toISOString(),
      },
    });
    state.attention.graphFindings = [{ label: "A", nodeName: "A", rawSnippet: "snippet", value: 1 }];
    const preamble = buildPreamble(state, {
      capability: "FULL",
      learningRanked: [],
      staleNotes: [],
      projectName: "proj",
      consistencyWarnings: [],
    });
    expect(preamble).toContain("[Graph]");
  });

  it("buildSubagentPreamble returns non-empty string with header", () => {
    const state = makeState();
    const preamble = buildSubagentPreamble(state);
    expect(preamble.length).toBeGreaterThan(0);
    expect(preamble).toContain("[Noesis]");
  });
});
