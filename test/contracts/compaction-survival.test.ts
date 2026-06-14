import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestContext, type TestContext } from "../_harness/fixtures.js";
import { makeFact } from "../_harness/factories.js";
import { getActiveFacts } from "../../src/domains/belief/belief-domain.js";

describe("Compaction survival", () => {
  let ctx: TestContext & { cleanup: () => void };
  beforeEach(() => {
    ctx = createTestContext();
  });
  afterEach(() => {
    ctx.cleanup();
  });

  it("compaction preserves active beliefs ≥ 0.75", () => {
    const highFact = makeFact({ content: "high confidence fact", confidence: 0.9 });
    const midFact = makeFact({ content: "mid confidence fact", confidence: 0.8 });
    const lowFact = makeFact({ content: "low confidence fact", confidence: 0.6 });

    ctx.state.mutate((current) => {
      current.belief.facts.push(highFact, midFact, lowFact);
    });

    ctx.state.invalidateAfterCompaction();
    const reloaded = ctx.state.read();

    const survivors = getActiveFacts(reloaded, 0.75);

    expect(survivors).toHaveLength(2);
    expect(survivors.map((f) => f.id)).toContain(highFact.id);
    expect(survivors.map((f) => f.id)).toContain(midFact.id);
    expect(survivors.map((f) => f.id)).not.toContain(lowFact.id);
  });

  it("compaction preserves workflow commitment", () => {
    const goal = "Fix auth token expiry check";

    ctx.state.mutate((current) => {
      current.commitment.workflow.goal = goal;
      current.commitment.workflow.status = "active";
    });

    ctx.state.invalidateAfterCompaction();
    const reloaded = ctx.state.read();

    expect(reloaded.commitment.workflow.goal).toBe(goal);
    expect(reloaded.commitment.workflow.status).toBe("active");
  });

  it("state reloads from disk after compaction", () => {
    ctx.state.mutate((current) => {
      current.belief.facts.push(makeFact({ content: "persisted fact", confidence: 0.95 }));
    });

    ctx.state.invalidateAfterCompaction();
    const reloaded = ctx.state.read();

    expect(reloaded.belief.facts).toHaveLength(1);
    expect(reloaded.belief.facts[0]!.content).toBe("persisted fact");
    expect(reloaded.belief.facts[0]!.confidence).toBe(0.95);
  });
});
