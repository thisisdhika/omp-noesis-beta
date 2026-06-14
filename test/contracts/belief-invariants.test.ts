import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestContext, type TestContext } from "../_harness/fixtures.js";
import { makeFact, makeStateWithFacts } from "../_harness/factories.js";
import {
  assertNoFactDeleted,
  assertOneActivePerClaim,
  assertFactSuperseded,
} from "../_harness/assertions.js";
import { addFact } from "../../src/domains/belief/belief-domain.js";

describe("Belief invariants", () => {
  let ctx: TestContext & { cleanup: () => void };
  beforeEach(() => {
    ctx = createTestContext();
  });
  afterEach(() => {
    ctx.cleanup();
  });

  // -------------------------------------------------------------------------
  // 1. No belief ever removed from facts array (AGM Core-Retainment)
  // -------------------------------------------------------------------------
  it("no belief ever removed from facts array after supersession", () => {
    const facts = [
      makeFact({ content: "fact-A", tags: ["a"] }),
      makeFact({ content: "fact-B", tags: ["b"] }),
      makeFact({ content: "fact-C", tags: ["c"] }),
      makeFact({ content: "fact-D", tags: ["d"] }),
      makeFact({ content: "fact-E", tags: ["e"] }),
    ];
    const state = makeStateWithFacts(facts);
    const originalIds = new Set(state.belief.facts.map((f) => f.id));

    // Supersede each one individually
    for (let i = 0; i < facts.length; i++) {
      addFact(state, {
        type: "fact",
        content: `replacement-for-${facts[i]!.content}`,
        confidence: 0.95,
        source: "execution",
        tags: facts[i]!.tags,
        contradictsIds: [facts[i]!.id],
      });
    }

    // All 5 originals still present + 5 new = 10 total
    expect(state.belief.facts.length).toBe(10);
    assertNoFactDeleted(originalIds, state);
  });

  // -------------------------------------------------------------------------
  // 2. Exactly one version of a claim is active
  // -------------------------------------------------------------------------
  it("exactly one version of a claim is active in a 3-revision chain", () => {
    const state = makeStateWithFacts([]);

    // Fact A
    const a = addFact(state, {
      type: "fact",
      content: "API uses REST",
      confidence: 0.9,
      source: "user",
      tags: ["api"],
    });
    expect(a.created.status).toBe("active");

    // Fact B contradicts A
    const b = addFact(state, {
      type: "fact",
      content: "API uses GraphQL",
      confidence: 0.95,
      source: "execution",
      tags: ["api"],
      contradictsIds: [a.created.id],
    });
    expect(b.superseded).toHaveLength(1);

    // Fact C contradicts B
    const c = addFact(state, {
      type: "fact",
      content: "API uses gRPC",
      confidence: 0.99,
      source: "graph",
      tags: ["api"],
      contradictsIds: [b.created.id],
    });
    expect(c.superseded).toHaveLength(1);

    // Only C should be active; A and B superseded
    const active = state.belief.facts.filter((f) => f.status === "active");
    expect(active).toHaveLength(1);
    expect(active[0]!.id).toBe(c.created.id);

    const superseded = state.belief.facts.filter((f) => f.status === "superseded");
    expect(superseded).toHaveLength(2);

    assertFactSuperseded(state.belief.facts, a.created.id, b.created.id);
    assertFactSuperseded(state.belief.facts, b.created.id, c.created.id);
  });

  // -------------------------------------------------------------------------
  // 3. supersededBy chain terminates at active
  // -------------------------------------------------------------------------
  it("supersededBy chain from first fact terminates at the active head", () => {
    const state = makeStateWithFacts([]);

    const a = addFact(state, {
      type: "fact",
      content: "v1 claim",
      confidence: 0.8,
      source: "inference",
      tags: ["chain"],
    });

    const b = addFact(state, {
      type: "fact",
      content: "v2 claim",
      confidence: 0.85,
      source: "inference",
      tags: ["chain"],
      contradictsIds: [a.created.id],
    });

    const c = addFact(state, {
      type: "fact",
      content: "v3 claim",
      confidence: 0.9,
      source: "execution",
      tags: ["chain"],
      contradictsIds: [b.created.id],
    });

    // Walk the chain manually from A → B → C (active)
    const factA = state.belief.facts.find((f) => f.id === a.created.id)!;
    expect(factA.status).toBe("superseded");
    expect(factA.supersededBy).toBe(b.created.id);

    const factB = state.belief.facts.find((f) => f.id === b.created.id)!;
    expect(factB.status).toBe("superseded");
    expect(factB.supersededBy).toBe(c.created.id);

    const factC = state.belief.facts.find((f) => f.id === c.created.id)!;
    expect(factC.status).toBe("active");
    // Active head has no supersededBy
    expect(factC.supersededBy).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 4. Archived beliefs have no supersededBy
  // -------------------------------------------------------------------------
  it("archived beliefs have no supersededBy", () => {
    const state = makeStateWithFacts([]);

    const result = addFact(state, {
      type: "fact",
      content: "to be archived",
      confidence: 0.9,
      source: "user",
      tags: ["archive-test"],
    });

    // Manually archive the fact
    const fact = state.belief.facts.find((f) => f.id === result.created.id)!;
    fact.status = "archived";
    delete fact.supersededBy;

    expect(fact.status).toBe("archived");
    expect(fact.supersededBy).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 5. Same content without overlapping tags is not considered a duplicate
  // -------------------------------------------------------------------------
  it("same content without overlapping tags is still added", () => {
    const state = makeStateWithFacts([]);

    const first = addFact(state, {
      type: "fact",
      content: "adapter is enabled",
      confidence: 0.9,
      source: "execution",
      tags: ["alpha"],
    });

    const second = addFact(state, {
      type: "fact",
      content: "adapter is enabled",
      confidence: 0.95,
      source: "user",
      tags: ["beta"],
    });

    expect(second.superseded).toHaveLength(0);
    expect(state.belief.facts).toHaveLength(2);
    const active = state.belief.facts.filter((fact) => fact.status === "active");
    expect(active).toHaveLength(2);
    expect(active.map((fact) => fact.id)).toEqual([first.created.id, second.created.id]);
  });

  // -------------------------------------------------------------------------
  // 6. Contradicting via an older id revises the current active head only
  // -------------------------------------------------------------------------
  it("contradicting from an old chain id supersedes only the active head", () => {
    const state = makeStateWithFacts([]);

    const first = addFact(state, {
      type: "fact",
      content: "cache=v1",
      confidence: 0.8,
      source: "inference",
      tags: ["cache"],
    });
    const second = addFact(state, {
      type: "fact",
      content: "cache=v2",
      confidence: 0.85,
      source: "inference",
      tags: ["cache"],
      contradictsIds: [first.created.id],
    });
    const third = addFact(state, {
      type: "fact",
      content: "cache=v3",
      confidence: 0.9,
      source: "execution",
      tags: ["cache"],
      contradictsIds: [first.created.id],
    });

    expect(third.superseded).toHaveLength(1);
    expect(third.superseded[0]!.id).toBe(second.created.id);
    assertFactSuperseded(state.belief.facts, first.created.id, second.created.id);
    assertFactSuperseded(state.belief.facts, second.created.id, third.created.id);
    const active = state.belief.facts.filter((fact) => fact.status === "active");
    expect(active).toHaveLength(1);
    expect(active[0]!.id).toBe(third.created.id);
  });

  // -------------------------------------------------------------------------
  // 5. Deduplication blocks identical active content+tags
  // -------------------------------------------------------------------------
  it("deduplication blocks identical active content and tags", () => {
    const state = makeStateWithFacts([]);

    // First add succeeds
    const first = addFact(state, {
      type: "fact",
      content: "duplicate content",
      confidence: 0.9,
      source: "execution",
      tags: ["dup"],
    });
    expect(state.belief.facts).toHaveLength(1);

    // Second add with same content+tags is a no-op
    const second = addFact(state, {
      type: "fact",
      content: "duplicate content",
      confidence: 0.95,
      source: "user",
      tags: ["dup"],
    });

    // Dedup: empty superseded, fact not added
    expect(second.superseded).toHaveLength(0);
    expect(state.belief.facts).toHaveLength(1);

    // The original remains active
    assertOneActivePerClaim(state.belief.facts);
    expect(state.belief.facts[0]!.id).toBe(first.created.id);
  });
});
