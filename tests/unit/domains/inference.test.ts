"use strict";

/**
 * Unit tests for the Inference Domain (inference-domain.ts).
 *
 * Tests addHypothesis, updateHypothesis, confirmHypothesis,
 * refuteHypothesis, and addReasoning — including autoPromote
 * behaviour, missing-ID paths, and edge cases.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  addHypothesis,
  updateHypothesis,
  confirmHypothesis,
  refuteHypothesis,
  addReasoning,
} from "../../../src/domains/inference/inference-domain.js";
import type { NoesisState } from "../../../src/schema.js";
import { EMPTY_STATE } from "../../../src/schema.js";
import { freshState } from "../../helpers/fixtures.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// addHypothesis
// ---------------------------------------------------------------------------

describe("addHypothesis", () => {
  it("creates a hypothesis with testing status", () => {
    const state = freshState();
    const h = addHypothesis(state, {
      content: "Parallel submits reduce latency",
      evidence: "Observed 2x throughput on dev",
      tags: ["performance"],
    });

    expect(h.id).toMatch(/^hy-/);
    expect(h.content).toBe("Parallel submits reduce latency");
    expect(h.status).toBe("testing");
    expect(h.evidence).toBe("Observed 2x throughput on dev");
    expect(h.tags).toEqual(["performance"]);
    expect(h.createdAt).toBeDefined();
    expect(h.updatedAt).toBeDefined();

    expect(state.inference.hypotheses).toHaveLength(1);
  });

  it("handles optional evidence and tags omitted", () => {
    const state = freshState();
    const h = addHypothesis(state, { content: "Bare hypothesis" });

    expect(h.evidence).toBeUndefined();
    expect(h.tags).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// updateHypothesis
// ---------------------------------------------------------------------------

describe("updateHypothesis", () => {
  it("updates specified fields on an existing hypothesis", () => {
    const state = freshState();
    const h = addHypothesis(state, { content: "test" });

    const updated = updateHypothesis(state, h.id, {
      status: "confirmed",
      evidence: "New evidence",
      relatedBeliefId: "bf-123",
    });

    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("confirmed");
    expect(updated!.evidence).toBe("New evidence");
    expect(updated!.relatedBeliefId).toBe("bf-123");
  });

  it("returns null for a non-existent hypothesis", () => {
    const state = freshState();
    const result = updateHypothesis(state, "nonexistent", { status: "confirmed" });
    expect(result).toBeNull();
  });

  it("only changes provided fields", () => {
    const state = freshState();
    const h = addHypothesis(state, { content: "Original", evidence: "orig" });

    const updated = updateHypothesis(state, h.id, { status: "abandoned" });
    expect(updated!.status).toBe("abandoned");
    expect(updated!.evidence).toBe("orig");
    expect(updated!.relatedBeliefId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// confirmHypothesis
// ---------------------------------------------------------------------------

describe("confirmHypothesis", () => {
  it("marks hypothesis as confirmed and auto-promotes belief by default", () => {
    const state = freshState();
    const h = addHypothesis(state, { content: "Confirmed hypothesis", evidence: "Strong evidence" });

    const result = confirmHypothesis(state, h.id);

    expect(result).not.toBeNull();
    expect(result!.hypothesis.status).toBe("confirmed");

    // Belief fact was created
    expect(result!.beliefFact).toBeDefined();
    expect(result!.beliefFact!.content).toBe("Confirmed hypothesis");
    expect(result!.beliefFact!.confidence).toBe(0.85);
    expect(result!.beliefFact!.source).toBe("inference");
    expect(result!.beliefFact!.status).toBe("active");

    // State is updated
    expect(state.belief.facts).toHaveLength(1);
    expect(state.inference.hypotheses[0]!.relatedBeliefId).toBe(result!.beliefFact!.id);
  });

  it("returns null for a non-existent hypothesis", () => {
    const state = freshState();
    expect(confirmHypothesis(state, "ghost-id")).toBeNull();
  });

  it("skips belief creation when autoPromote is false", () => {
    const state = freshState();
    const h = addHypothesis(state, { content: "No auto-promote" });

    const result = confirmHypothesis(state, h.id, false);

    expect(result).not.toBeNull();
    expect(result!.hypothesis.status).toBe("confirmed");
    expect(result!.beliefFact).toBeUndefined();
    expect(state.belief.facts).toHaveLength(0);
  });

  it("links the belief fact id on the hypothesis", () => {
    const state = freshState();
    const h = addHypothesis(state, { content: "Linked" });

    const result = confirmHypothesis(state, h.id);

    expect(result!.hypothesis.relatedBeliefId).toBe(result!.beliefFact!.id);
  });
});

// ---------------------------------------------------------------------------
// refuteHypothesis
// ---------------------------------------------------------------------------

describe("refuteHypothesis", () => {
  it("marks hypothesis as refuted", () => {
    const state = freshState();
    const h = addHypothesis(state, { content: "Refutable" });

    const refuted = refuteHypothesis(state, h.id);
    expect(refuted).not.toBeNull();
    expect(refuted!.status).toBe("refuted");
    expect(state.inference.hypotheses[0]!.status).toBe("refuted");
  });

  it("returns null for a non-existent hypothesis", () => {
    const state = freshState();
    expect(refuteHypothesis(state, "ghost-id")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// addReasoning
// ---------------------------------------------------------------------------

describe("addReasoning", () => {
  it("creates a reasoning step with optional relatesTo", () => {
    const state = freshState();
    const step = addReasoning(state, "Deduced X from Y", "hy-001");

    expect(step.id).toMatch(/^rs-/);
    expect(step.content).toBe("Deduced X from Y");
    expect(step.relatesTo).toBe("hy-001");
    expect(step.createdAt).toBeDefined();

    expect(state.inference.reasoning).toHaveLength(1);
  });

  it("creates a reasoning step without relatesTo", () => {
    const state = freshState();
    const step = addReasoning(state, "Standalone thought");

    expect(step.relatesTo).toBeUndefined();
  });
});
