import { describe, it, expect } from "vitest";
import { makeStateWithFacts } from "../_harness/factories.js";
import { addFact } from "../../src/domains/belief/belief-domain.js";

describe("Scenario D: Contradictory evidence", () => {
  it("believes REST → discovers GraphQL → old fact superseded, new active, chain intact", () => {
    // Step 1: Add "API uses REST" fact
    const state = makeStateWithFacts([]);
    const result1 = addFact(state, {
      type: "fact" as const,
      content: "API uses REST",
      confidence: 0.9,
      source: "execution",
    });
    const firstId = result1.created.id;
    expect(result1.created.status).toBe("active");
    expect(result1.superseded).toHaveLength(0);

    // Step 2: Add "API uses GraphQL" contradicting the first fact
    const result2 = addFact(state, {
      type: "fact" as const,
      content: "API uses GraphQL",
      confidence: 0.85,
      source: "execution",
      contradictsIds: [firstId],
    });
    const secondId = result2.created.id;

    // Both facts still in facts array (no data loss)
    expect(state.belief.facts).toHaveLength(2);

    // First fact is superseded
    const firstFact = state.belief.facts.find((f) => f.id === firstId)!;
    expect(firstFact.status).toBe("superseded");
    expect(firstFact.supersededBy).toBe(secondId);

    // Second fact is active
    const secondFact = state.belief.facts.find((f) => f.id === secondId)!;
    expect(secondFact.status).toBe("active");
    expect(secondFact.content).toBe("API uses GraphQL");
    expect(secondFact.supersededBy).toBeUndefined();

    // Tool result confirmed the supersession
    expect(result2.superseded).toHaveLength(1);
    expect(result2.superseded[0]!.id).toBe(firstId);
  });
});
