import { describe, it, expect } from "vitest";
import { makeFact, makeHypothesis, makeLearningEntry, makeState } from "../_harness/factories.js";
import { buildSurvivors } from "../../src/rendering/survivor-builder.js";

describe("survivor-builder contracts", () => {
  it("empty state produces minimal output", () => {
    const state = makeState();
    const result = buildSurvivors(state);

    expect(result.contextLines.length).toBeGreaterThan(0);
    expect(result.contextLines).toContain("[Focus] No active focus");
  });

  it("active facts with high confidence are included", () => {
    const facts = [
      makeFact({ content: "fact A", confidence: 0.9 }),
      makeFact({ content: "fact B", confidence: 0.6 }),
    ];
    const state = makeState({ belief: { facts, decisions: [] } });
    const result = buildSurvivors(state);

    expect(result.contextLines.some((l) => l.includes("fact A"))).toBe(true);
    expect(result.contextLines.some((l) => l.includes("fact B"))).toBe(false);
  });

  it("testing hypotheses are included in survivors", () => {
    const hypotheses = [
      makeHypothesis({ content: "hypothesis 1" }),
      makeHypothesis({ content: "hypothesis 2", status: "confirmed" }),
    ];
    const state = makeState({ inference: { hypotheses, reasoning: [] } });
    const result = buildSurvivors(state);

    expect(result.contextLines.some((l) => l.includes("hypothesis 1"))).toBe(true);
    expect(result.contextLines.some((l) => l.includes("hypothesis 2"))).toBe(false);
  });

  it("learning summary line included with counts", () => {
    const state = makeState({
      learning: {
        successes: [makeLearningEntry()],
        failures: [makeLearningEntry()],
        summary: { successCount: 1, failureCount: 1, resolvedCount: 0 },
      },
    });
    const result = buildSurvivors(state);

    expect(result.contextLines).toContain(
      "Learning summary: 1 successes, 1 failures (0 resolved)",
    );
  });

  it("state path line included", () => {
    const state = makeState();
    const result = buildSurvivors(state);

    expect(result.contextLines).toContain("State: .omp/noesis/state.json");
  });

  it("preserveData contains stripped state with no transient fields", () => {
    const state = makeState({
      attention: {
        focus: "focus",
        graphQueries: [],
        files: [],
        contextUsage: 0,
        updatedAt: new Date().toISOString(),
      },
    });
    state.attention.graphFindings = [{ label: "A", value: 1 }];
    const result = buildSurvivors(state);

    expect(result.preserveData.noesis.attention).not.toHaveProperty("graphFindings");
    expect(result.preserveData.noesis.attention).not.toHaveProperty("__graphFindings");
  });
});
