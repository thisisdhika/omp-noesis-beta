import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestContext, type TestContext } from "../_harness/fixtures.js";
import { makeFact, makeState } from "../_harness/factories.js";
import { assertConfidenceIsExact, assertIsPreambleEligible } from "../_harness/assertions.js";
import { addFact } from "../../src/domains/belief/belief-domain.js";

describe("Confidence mapping contract", () => {
  let ctx: TestContext & { cleanup: () => void };
  beforeEach(() => {
    ctx = createTestContext();
  });
  afterEach(() => {
    ctx.cleanup();
  });

  it("graph source → confidence 1.0, preamble-eligible", () => {
    const state = makeState();
    const result = addFact(state, {
      type: "fact",
      content: "extracted fact from graph",
      confidence: 1.0,
      source: "graph",
    });

    assertConfidenceIsExact(result.created, 1.0);
    assertIsPreambleEligible(result.created, true);
  });

  it("INFERRED 0.95 → stored as 0.95, preamble-eligible", () => {
    const state = makeState();
    const result = addFact(state, {
      type: "fact",
      content: "high-confidence inferred fact",
      confidence: 0.95,
      source: "inference",
    });

    assertConfidenceIsExact(result.created, 0.95);
    assertIsPreambleEligible(result.created, true);
  });

  it("INFERRED 0.75 → stored as 0.75, preamble-eligible (at threshold)", () => {
    const state = makeState();
    const result = addFact(state, {
      type: "fact",
      content: "threshold-confidence inferred fact",
      confidence: 0.75,
      source: "inference",
    });

    assertConfidenceIsExact(result.created, 0.75);
    assertIsPreambleEligible(result.created, true);
  });

  it("INFERRED 0.65 → stored, NOT preamble-eligible", () => {
    const state = makeState();
    const result = addFact(state, {
      type: "fact",
      content: "below-threshold inferred fact",
      confidence: 0.65,
      source: "inference",
    });

    assertConfidenceIsExact(result.created, 0.65);
    assertIsPreambleEligible(result.created, false);
  });

  it("INFERRED 0.55 → stored, NOT preamble-eligible", () => {
    const state = makeState();
    const result = addFact(state, {
      type: "fact",
      content: "low-confidence inferred fact",
      confidence: 0.55,
      source: "inference",
    });

    assertConfidenceIsExact(result.created, 0.55);
    assertIsPreambleEligible(result.created, false);
  });

  it("execution source → default 1.0", () => {
    const state = makeState();
    const result = addFact(state, {
      type: "fact",
      content: "fact from code execution",
      confidence: 1.0,
      source: "execution",
    });

    assertConfidenceIsExact(result.created, 1.0);
    assertIsPreambleEligible(result.created, true);
  });

  it("inference source → stores at 0.5 minimum", () => {
    const state = makeState();
    const result = addFact(state, {
      type: "fact",
      content: "minimum-confidence inference",
      confidence: 0.5,
      source: "inference",
    });

    assertConfidenceIsExact(result.created, 0.5);
    assertIsPreambleEligible(result.created, false);
  });

  it("user source → stores at 1.0, overridable to 0.6", () => {
    const stateDefault = makeState();
    const resultDefault = addFact(stateDefault, {
      type: "fact",
      content: "user-stated fact default",
      confidence: 1.0,
      source: "user",
    });
    assertConfidenceIsExact(resultDefault.created, 1.0);
    assertIsPreambleEligible(resultDefault.created, true);

    const stateOverride = makeState();
    const resultOverride = addFact(stateOverride, {
      type: "fact",
      content: "user-stated fact overridden",
      confidence: 0.6,
      source: "user",
    });
    assertConfidenceIsExact(resultOverride.created, 0.6);
    assertIsPreambleEligible(resultOverride.created, false);
  });

  it("vault source → stores at given confidence", () => {
    const state = makeState();
    const result = addFact(state, {
      type: "fact",
      content: "fact pulled from vault",
      confidence: 0.8,
      source: "vault",
    });

    assertConfidenceIsExact(result.created, 0.8);
    assertIsPreambleEligible(result.created, true);
  });
});
