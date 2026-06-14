import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestContext, type TestContext } from "../_harness/fixtures.js";
import { makeFact, makeStateWithFacts } from "../_harness/factories.js";
import {
  assertFactActive,
  assertFactSuperseded,
  assertOneActivePerClaim,
} from "../_harness/assertions.js";
import { addFact } from "../../src/domains/belief/belief-domain.js";

describe("AGM Belief Revision Postulates", () => {
  let ctx: TestContext & { cleanup: () => void };

  beforeEach(() => {
    ctx = createTestContext();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  // -------------------------------------------------------------------------
  // K*2 Success: a new fact is always added to the belief set as active
  // -------------------------------------------------------------------------
  it("K*2 Success — new fact always added as active", () => {
    const state = ctx.emptyState;
    const params = {
      type: "fact" as const,
      content: "The auth service uses JWT tokens",
      confidence: 0.95,
      source: "execution" as const,
    };

    const result = addFact(state, params);

    expect(result.created.status).toBe("active");
    expect(result.superseded).toHaveLength(0);

    // Also verify via assertion helper against the state's facts array
    const found = assertFactActive(state.belief.facts, params.content);
    expect(found.id).toBe(result.created.id);
    expect(found.confidence).toBe(0.95);
  });

  // -------------------------------------------------------------------------
  // K*3 Inclusion: active set = old − contradicted + new
  // Seed 3 active facts, add a 4th that contradicts 2 of them.
  // Result: 2 active (1 untouched original + 1 new).
  // -------------------------------------------------------------------------
  it("K*3 Inclusion — active set is old minus contradicted plus new", () => {
    const fact1 = makeFact({ content: "API uses REST", confidence: 0.9 });
    const fact2 = makeFact({ content: "Database is PostgreSQL", confidence: 0.85 });
    const fact3 = makeFact({ content: "Auth uses OAuth2", confidence: 0.8 });
    const state = makeStateWithFacts([fact1, fact2, fact3]);

    const result = addFact(state, {
      type: "fact",
      content: "API uses GraphQL",
      confidence: 0.95,
      source: "user" as const,
      contradictsIds: [fact1.id, fact2.id],
    });

    // 2 superseded (fact1, fact2)
    expect(result.superseded).toHaveLength(2);

    // Active facts: fact3 (untouched) + result.created
    const activeFacts = state.belief.facts.filter((f) => f.status === "active");
    expect(activeFacts).toHaveLength(2);
    expect(activeFacts.map((f) => f.id).sort()).toEqual(
      [fact3.id, result.created.id].sort(),
    );
  });

  // -------------------------------------------------------------------------
  // K*4 Preservation: adding a non-contradicting fact loses no existing beliefs
  // Seed 3 active facts, add a 4th with no contradictsIds.
  // All 4 remain active.
  // -------------------------------------------------------------------------
  it("K*4 Preservation — non-contradicting addition preserves all", () => {
    const fact1 = makeFact({ content: "Uses TypeScript", confidence: 0.95 });
    const fact2 = makeFact({ content: "Runs on Node 20", confidence: 0.9 });
    const fact3 = makeFact({ content: "Tests use Vitest", confidence: 0.85 });
    const state = makeStateWithFacts([fact1, fact2, fact3]);

    const result = addFact(state, {
      type: "fact",
      content: "Builds with esbuild",
      confidence: 0.8,
      source: "execution" as const,
    });

    expect(result.superseded).toHaveLength(0);

    const activeFacts = state.belief.facts.filter((f) => f.status === "active");
    expect(activeFacts).toHaveLength(4);
    assertOneActivePerClaim(state.belief.facts);
  });

  // -------------------------------------------------------------------------
  // K*5 Consistency: a contradicted belief is always superseded before the
  // new belief is added. The superseded fact links to the new one.
  // -------------------------------------------------------------------------
  it("K*5 Consistency — contradicted fact superseded before new is added", () => {
    const oldFact = makeFact({ content: "Package manager is npm", confidence: 0.9 });
    const state = makeStateWithFacts([oldFact]);

    const result = addFact(state, {
      type: "fact",
      content: "Package manager is pnpm",
      confidence: 0.95,
      source: "user" as const,
      contradictsIds: [oldFact.id],
    });

    expect(result.superseded).toHaveLength(1);

    // Old fact is superseded and chains to the new fact
    assertFactSuperseded(
      state.belief.facts,
      oldFact.id,
      result.created.id,
    );

    // New fact is active
    expect(result.created.status).toBe("active");
  });

  // -------------------------------------------------------------------------
  // K*6 Equivalence: adding a fact with identical content+tags to an existing
  // active fact is a no-op — the duplicate is silently dropped.
  // -------------------------------------------------------------------------
  it("K*6 Equivalence — identical content+tags is no-op", () => {
    const state = ctx.emptyState;

    const first = addFact(state, {
      type: "fact",
      content: "X",
      confidence: 0.9,
      source: "execution" as const,
      tags: ["a"],
    });
    expect(first.created.status).toBe("active");
    expect(state.belief.facts).toHaveLength(1);

    // Second call with identical content and overlapping tags
    const second = addFact(state, {
      type: "fact",
      content: "X",
      confidence: 0.95,
      source: "user" as const,
      tags: ["a"],
    });

    // Dedup: nothing superseded, no new fact added
    expect(second.superseded).toHaveLength(0);
    expect(state.belief.facts).toHaveLength(1);

    // The returned created fact has NOT been pushed (id remains the
    // pre-revision placeholder, status is still "active" from construction,
    // but it is absent from the state's facts array)
    expect(state.belief.facts.find((f) => f.id === second.created.id)).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Revision through an older superseded id should walk to the current active
  // head before applying the contradiction.
  // -------------------------------------------------------------------------
  it("walks from an older superseded id to the active head before superseding", () => {
    const state = makeStateWithFacts([]);

    const first = addFact(state, {
      type: "fact",
      content: "Uses REST",
      confidence: 0.8,
      source: "user",
      tags: ["api"],
    });
    const second = addFact(state, {
      type: "fact",
      content: "Uses GraphQL",
      confidence: 0.9,
      source: "execution",
      tags: ["api"],
      contradictsIds: [first.created.id],
    });
    const third = addFact(state, {
      type: "fact",
      content: "Uses gRPC",
      confidence: 0.95,
      source: "execution",
      tags: ["api"],
      contradictsIds: [first.created.id],
    });

    expect(third.superseded).toHaveLength(1);
    expect(third.superseded[0]!.id).toBe(second.created.id);
    assertFactSuperseded(state.belief.facts, first.created.id, second.created.id);
    assertFactSuperseded(state.belief.facts, second.created.id, third.created.id);
    const activeFacts = state.belief.facts.filter((fact) => fact.status === "active");
    expect(activeFacts).toHaveLength(1);
    expect(activeFacts[0]!.id).toBe(third.created.id);
  });
  // -------------------------------------------------------------------------
  // Relevance: only the targeted contradicting beliefs are revised;
  // unrelated beliefs are left untouched.
  // -------------------------------------------------------------------------
  it("Relevance — only contradicting beliefs revised", () => {
    const target = makeFact({ content: "Uses ESBuild", confidence: 0.9 });
    const bystander1 = makeFact({ content: "Logs to stdout", confidence: 0.85 });
    const bystander2 = makeFact({ content: "Port 3000", confidence: 0.8 });
    const state = makeStateWithFacts([target, bystander1, bystander2]);

    const result = addFact(state, {
      type: "fact",
      content: "Uses SWC",
      confidence: 0.95,
      source: "user" as const,
      contradictsIds: [target.id],
    });

    expect(result.superseded).toHaveLength(1);
    expect(result.superseded[0]!.id).toBe(target.id);

    // Only the targeted fact is superseded
    assertFactSuperseded(state.belief.facts, target.id, result.created.id);

    // Bystanders remain active
    const b1 = state.belief.facts.find((f) => f.id === bystander1.id)!;
    const b2 = state.belief.facts.find((f) => f.id === bystander2.id)!;
    expect(b1.status).toBe("active");
    expect(b2.status).toBe("active");
  });

  // -------------------------------------------------------------------------
  // Core-Retainment: beliefs that are not contradicted by the revision
  // are always retained in the active set.
  // -------------------------------------------------------------------------
  it("Core-Retainment — uncontradicted beliefs kept", () => {
    const kept1 = makeFact({ content: "Framework is Hono", confidence: 0.9 });
    const kept2 = makeFact({ content: "ORM is Drizzle", confidence: 0.85 });
    const revised = makeFact({ content: "Cache is Redis", confidence: 0.8 });
    const state = makeStateWithFacts([kept1, kept2, revised]);

    const result = addFact(state, {
      type: "fact",
      content: "Cache is Memcached",
      confidence: 0.9,
      source: "execution" as const,
      contradictsIds: [revised.id],
    });

    // Only the targeted fact superseded
    expect(result.superseded).toHaveLength(1);

    // The two uncontradicted facts are still active
    const k1 = state.belief.facts.find((f) => f.id === kept1.id)!;
    const k2 = state.belief.facts.find((f) => f.id === kept2.id)!;
    expect(k1.status).toBe("active");
    expect(k2.status).toBe("active");

    // Total active: kept1 + kept2 + result.created
    const activeFacts = state.belief.facts.filter((f) => f.status === "active");
    expect(activeFacts).toHaveLength(3);
  });
});
