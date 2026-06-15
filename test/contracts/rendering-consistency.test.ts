import { describe, it, expect } from "vitest";
import { makeDecision, makeFact, makeHypothesis, makeLearningEntry, makeState, makeWorkflowStep } from "../_harness/factories.js";
import { checkConsistency } from "../../src/domains/commitment/consistency-strategy.js";
import { resolveFocus } from "../../src/rendering/focus-resolver.js";
import { stripTransientState } from "../../src/rendering/state-cleanup.js";
import { formatBeliefsSection, formatDecisionsSection, formatGraphSection, formatHypothesesSection, formatLearningSection, formatWorkSection } from "../../src/rendering/section-formatters.js";

describe("rendering and consistency contracts", () => {
  it("resolveFocus prefers explicit focus, then workflow goal, then attention focus", () => {
    const state = makeState({
      attention: {
        focus: "attention focus",
        graphQueries: [],
        files: [],
        contextUsage: 0,
        updatedAt: new Date().toISOString(),
      },
      commitment: {
        workflow: { goal: "workflow focus", status: "active", steps: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        actions: [],
      },
    });

    expect(resolveFocus(state, "explicit focus")).toBe("explicit focus");
    expect(resolveFocus(state)).toBe("workflow focus");

    state.commitment.workflow.goal = "";
    expect(resolveFocus(state)).toBe("attention focus");
  });

  it("resolveFocus returns default orientation when no focus source exists", () => {
    const state = makeState();

    expect(resolveFocus(state)).toBe("No active focus. Use noesis_attend to set one.");
  });

  it("checkConsistency warns when active workflow has no active step", () => {
    const state = makeState({
      commitment: {
        workflow: { goal: "work", status: "active", steps: [makeWorkflowStep({ status: "pending" })], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        actions: [],
      },
    });

    expect(checkConsistency(state)).toEqual(["Workflow active but no active step"]);
  });

  it("checkConsistency warns when done workflow still has active steps", () => {
    const state = makeState({
      commitment: {
        workflow: { goal: "done", status: "done", steps: [makeWorkflowStep({ status: "active" })], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        actions: [],
      },
    });

    expect(checkConsistency(state)).toHaveLength(1);
    expect(checkConsistency(state)[0]).toContain("Workflow marked done");
  });

  it("stripTransientState removes graph finding fields", () => {
    const state = makeState({
      attention: {
        focus: "",
        files: [],
        graphQueries: [],
        contextUsage: 0,
        updatedAt: "",
        graphFindings: [{ nodeName: "A", confidence: 0.9, confidenceLabel: "EXTRACTED", isGodNode: false, isSurprising: false, rawSnippet: "raw" }],
        __graphFindings: [{ nodeName: "B", confidence: 0.9, confidenceLabel: "EXTRACTED", isGodNode: false, isSurprising: false, rawSnippet: "raw" }],
      },
    });

    const stripped = stripTransientState(state);

    expect(stripped.attention.graphFindings).toBeUndefined();
    expect(stripped.attention.__graphFindings).toBeUndefined();
    expect(state.attention.graphFindings).toBeDefined();
  });

  it("section formatters format active entities and omit empty sections", () => {
    const fact = makeFact({ content: "fact", confidence: 0.95, source: "execution" });
    const decision = makeDecision({ content: "decision", rationale: "rationale" });
    const hypothesis = makeHypothesis({ content: "hypothesis", status: "testing" });
    const learning = makeLearningEntry({ description: "learning", rootCause: "cause", fix: "fix" });

    expect(formatWorkSection("goal", [makeWorkflowStep({ status: "active", description: "step" })])).toBe("[Work] goal | Step: step");
    expect(formatDecisionsSection([decision], true)).toContain("rationale: rationale");
    expect(formatBeliefsSection([fact], true)).toContain("src: execution");
    expect(formatHypothesesSection([hypothesis], true)).toContain("[testing]");
    expect(formatLearningSection([learning], true)).toContain("FAIL");
    expect(formatLearningSection([learning], false)).not.toContain("fix:");

    expect(formatWorkSection("", [])).toBeUndefined();
    expect(formatDecisionsSection([], true)).toBeUndefined();
    expect(formatBeliefsSection([], true)).toBeUndefined();
    expect(formatHypothesesSection([], true)).toBeUndefined();
    expect(formatLearningSection([], true)).toBeUndefined();
    expect(formatGraphSection([])).toBeUndefined();
  });

  it("section formatters cap and sort rendered sections", () => {
    const facts = [
      makeFact({ content: "low", confidence: 0.7, status: "active" }),
      makeFact({ content: "high", confidence: 0.95, status: "active" }),
      makeFact({ content: "archived", confidence: 0.95, status: "archived" }),
    ];
    const decisions = Array.from({ length: 6 }, (_, index) => makeDecision({ content: `decision-${index}` }));
    const hypotheses = Array.from({ length: 4 }, (_, index) => makeHypothesis({ content: `hypothesis-${index}`, status: "testing" }));
    const beliefs = formatBeliefsSection(facts, false);
    const formattedDecisions = formatDecisionsSection(decisions, false);
    const formattedHypotheses = formatHypothesesSection(hypotheses, false);

    expect(beliefs).toContain("high");
    expect(beliefs).not.toContain("low");
    expect(formattedDecisions?.split("\n").length).toBe(6);
    expect(formattedHypotheses?.split("\n").length).toBe(4);
  });
});
