import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestContext, type TestContext } from "../_harness/fixtures.js";
import { makeFact, makeDecision, makeState } from "../_harness/factories.js";
import {
  getActiveFacts,
  getActiveDecisions,
} from "../../src/domains/belief/belief-domain.js";

describe("Survivor discipline", () => {
  let ctx: TestContext & { cleanup: () => void };
  beforeEach(() => {
    ctx = createTestContext();
  });
  afterEach(() => {
    ctx.cleanup();
  });

  it("active beliefs ≥ 0.75 in survivor set", () => {
    const facts = [
      makeFact({ content: "high-1", confidence: 0.9, status: "active" }),
      makeFact({ content: "high-2", confidence: 0.8, status: "active" }),
      makeFact({ content: "threshold", confidence: 0.75, status: "active" }),
      makeFact({ content: "low-1", confidence: 0.6, status: "active" }),
      makeFact({ content: "low-2", confidence: 0.6, status: "active" }),
    ];
    const state = makeState({ belief: { facts, decisions: [] } });

    const survivors = getActiveFacts(state, 0.75);

    expect(survivors).toHaveLength(3);
    expect(survivors.map((f) => f.content).sort()).toEqual(
      ["high-1", "high-2", "threshold"].sort(),
    );
    for (const fact of survivors) {
      expect(fact.confidence).toBeGreaterThanOrEqual(0.75);
      expect(fact.status).toBe("active");
    }
  });

  it("active decisions all in survivor set", () => {
    const decisions = [
      makeDecision({ content: "active-1", status: "active" }),
      makeDecision({ content: "active-2", status: "active" }),
      makeDecision({ content: "active-3", status: "active" }),
      makeDecision({ content: "old-decision", status: "superseded" }),
    ];
    const state = makeState({ belief: { facts: [], decisions } });

    const survivors = getActiveDecisions(state);

    expect(survivors).toHaveLength(3);
    expect(survivors.map((d) => d.content).sort()).toEqual(
      ["active-1", "active-2", "active-3"].sort(),
    );
    for (const decision of survivors) {
      expect(decision.status).toBe("active");
    }
  });

  it("archived beliefs excluded from survivor", () => {
    const archivedFact = makeFact({
      content: "archived-knowledge",
      confidence: 0.95,
      status: "archived",
    });
    const activeFact = makeFact({
      content: "live-knowledge",
      confidence: 0.9,
      status: "active",
    });
    const state = makeState({
      belief: { facts: [archivedFact, activeFact], decisions: [] },
    });

    const survivors = getActiveFacts(state);

    expect(survivors).toHaveLength(1);
    expect(survivors[0]!.content).toBe("live-knowledge");
    expect(survivors.find((f) => f.status === "archived")).toBeUndefined();
  });
});
