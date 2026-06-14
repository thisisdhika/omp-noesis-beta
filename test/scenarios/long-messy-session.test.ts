import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestContext, type TestContext } from "../_harness/fixtures.js";
import { makeFact, makeDecision, makeHypothesis, makeState } from "../_harness/factories.js";
import { setFocus, setFiles } from "../../src/domains/attention/attention-domain.js";
import { addFact, addDecision, getActiveFacts } from "../../src/domains/belief/belief-domain.js";
import { buildPreamble } from "../../src/rendering/preamble-builder.js";

describe("Scenario C: Long messy session", () => {
  let ctx: TestContext & { cleanup: () => void };

  beforeEach(() => {
    ctx = createTestContext();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it("survives 20 turns of attention and belief cycling", () => {
    const fileSets = [
      ["src/auth.ts"],
      ["src/auth.ts", "src/session.ts"],
      ["src/middleware.ts"],
      ["src/auth.ts", "src/middleware.ts"],
      ["src/index.ts"],
    ];

    // 20 turns: alternate between setting focus and adding beliefs
    for (let turn = 0; turn < 20; turn++) {
      const files = fileSets[turn % fileSets.length] ?? ["src/app.ts"];
      ctx.state.mutate((s) => {
        setFocus(s, `Debug session turn ${turn}`);
        setFiles(s, files);
      });

      ctx.state.mutate((s) => {
        addFact(s, {
          type: "fact",
          content: `Observation from turn ${turn}`,
          confidence: 0.7 + (turn % 10) * 0.03,
          source: "execution",
          tags: ["debug", `turn-${turn}`],
        });
      });

      // Every 5 turns, add a decision
      if (turn % 5 === 0) {
        ctx.state.mutate((s) => {
          addDecision(s, {
            type: "decision",
            content: `Decision at turn ${turn}`,
            rationale: `Rationale for turn ${turn}`,
          });
        });
      }

      // Every 7 turns, add a hypothesis
      if (turn % 7 === 0) {
        ctx.state.mutate((s) => {
          const hyp = makeHypothesis({
            content: `Hypothesis at turn ${turn}`,
            status: "testing",
          });
          s.inference.hypotheses.push(hyp);
        });
      }
    }

    // After 20 turns, state is readable and valid
    const finalState = ctx.state.read();
    expect(finalState.attention.focus).toContain("Debug session");
    expect(finalState.attention.files.length).toBeGreaterThan(0);
    expect(finalState.belief.facts.length).toBe(20);
    expect(finalState.version).toBe(1);

    // Preamble can be built from the messy state
    const preamble = buildPreamble(finalState, {
      capability: "FULL",
      learningRanked: [],
      staleNotes: [],
      projectName: "test-project",
      consistencyWarnings: [],
    });
    expect(preamble).toBeTruthy();
    expect(preamble.length).toBeGreaterThan(0);

    // Active facts ≥ 0.75 are findable
    const highConfidenceFacts = getActiveFacts(finalState, 0.75);
    expect(highConfidenceFacts.length).toBeGreaterThan(0);

    // State survives reload after compaction
    ctx.state.invalidateAfterCompaction();
    const reloaded = ctx.state.read();
    expect(reloaded.attention.focus).toContain("Debug session");
    expect(reloaded.belief.facts.length).toBe(20);
  });
});
