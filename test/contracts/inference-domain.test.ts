import { describe, it, expect } from "vitest";
import { makeHypothesis, makeState } from "../_harness/factories.js";
import {
  addHypothesis,
  updateHypothesisStatus,
  confirmHypothesis,
  getUnresolvedHypotheses,
  addReasoningStep,
} from "../../src/domains/inference/inference-domain.js";

describe("inference-domain contracts", () => {
  it("addHypothesis appends hypothesis and returns it", () => {
    const state = makeState();
    const hypothesis = addHypothesis(state, "test hypothesis", "evidence");

    expect(state.inference.hypotheses).toContain(hypothesis);
    expect(hypothesis.content).toBe("test hypothesis");
    expect(hypothesis.evidence).toBe("evidence");
    expect(hypothesis.status).toBe("testing");
    expect(hypothesis.id).toBeDefined();
  });

  it("addHypothesis appends multiple hypotheses", () => {
    const state = makeState();
    const h1 = addHypothesis(state, "h1");
    const h2 = addHypothesis(state, "h2");

    expect(state.inference.hypotheses.length).toBe(2);
    expect(state.inference.hypotheses[0]).toBe(h1);
    expect(state.inference.hypotheses[1]).toBe(h2);
  });

  it("updateHypothesisStatus updates status and evidence", () => {
    const state = makeState();
    const hypothesis = addHypothesis(state, "test");
    const updated = updateHypothesisStatus(state, hypothesis.id, "confirmed", "new evidence");

    expect(updated).not.toBeNull();
    expect(updated.status).toBe("confirmed");
    expect(updated.evidence).toBe("new evidence");
  });

  it("updateHypothesisStatus returns null for unknown id", () => {
    const state = makeState();
    const result = updateHypothesisStatus(state, "unknown-id", "confirmed");

    expect(result).toBeNull();
  });

  it("updateHypothesisStatus preserves existing evidence when omitted", () => {
    const state = makeState();
    const hypothesis = addHypothesis(state, "test", "original evidence");
    const updated = updateHypothesisStatus(state, hypothesis.id, "confirmed");

    expect(updated).not.toBeNull();
    expect(updated.evidence).toBe("original evidence");
  });

  it("confirmHypothesis creates belief fact and updates hypothesis", () => {
    const state = makeState();
    const hypothesis = addHypothesis(state, "test hypothesis");
    const result = confirmHypothesis(state, hypothesis.id);

    expect(result).not.toBeNull();
    expect(result.hypothesis.status).toBe("confirmed");
    expect(result.belief.content).toBe("test hypothesis");
    expect(result.belief.confidence).toBeCloseTo(0.75);
    expect(result.belief.source).toBe("inference");
    expect(state.belief.facts.length).toBe(1);
  });

  it("confirmHypothesis returns null for unknown id", () => {
    const state = makeState();
    const result = confirmHypothesis(state, "unknown-id");

    expect(result).toBeNull();
  });

  it("getUnresolvedHypotheses returns only testing hypotheses up to max", () => {
    const state = makeState();
    const h1 = addHypothesis(state, "h1");
    const h2 = addHypothesis(state, "h2");
    const h3 = addHypothesis(state, "h3");
    const h4 = addHypothesis(state, "h4");
    updateHypothesisStatus(state, h3.id, "confirmed");

    const unresolved = getUnresolvedHypotheses(state, 2);

    expect(unresolved.length).toBe(2);
    expect(unresolved.every((h) => h.status === "testing")).toBe(true);
  });

  it("getUnresolvedHypotheses returns empty when none testing", () => {
    const state = makeState();
    const h1 = addHypothesis(state, "h1");
    const h2 = addHypothesis(state, "h2");
    updateHypothesisStatus(state, h1.id, "confirmed");
    updateHypothesisStatus(state, h2.id, "refuted");

    const unresolved = getUnresolvedHypotheses(state);

    expect(unresolved.length).toBe(0);
  });

  it("addReasoningStep appends step and returns it", () => {
    const state = makeState();
    const step = addReasoningStep(state, "reasoning content", "related-id");

    expect(state.inference.reasoning).toContain(step);
    expect(step.content).toBe("reasoning content");
    expect(step.relatesTo).toBe("related-id");
    expect(step.id).toBeDefined();
  });
});
