"use strict";

import { describe, it, expect } from "bun:test";
import { cloneState } from "../helpers/fixtures.js";
import { addFact, getActiveFacts } from "../../src/domains/belief/belief-domain.js";

describe("belief revision — AGM supersession chain", () => {
  it("should create an active belief fact", () => {
    const state = cloneState();

    const fact = addFact(state, {
      content: "TypeScript strict mode prevents common runtime errors",
      confidence: 0.9,
      source: "execution",
      tags: ["typescript", "safety"],
    });

    expect(fact.status).toBe("active");
    expect(fact.id).toMatch(/^bf-/);
    expect(fact.tags).toEqual(["typescript", "safety"]);
    expect(state.belief.facts).toHaveLength(1);
  });

  it("should supersede two existing facts when adding a contradictory fact", () => {
    const state = cloneState();

    const oldFact1 = addFact(state, {
      content: "Use callback-based file API",
      confidence: 0.7,
      source: "execution",
      tags: ["file-io"],
    });

    const oldFact2 = addFact(state, {
      content: "Synchronous I/O is acceptable for small files",
      confidence: 0.6,
      source: "user",
      tags: ["file-io"],
    });

    // New contradictory fact supersedes both old facts
    const newFact = addFact(state, {
      content: "Use async/await with modern file API for all I/O",
      confidence: 0.95,
      source: "inference",
      tags: ["file-io", "async"],
      evidence: "Node.js 22+ supports promise-based fs API",
      contradicts: [oldFact1.id, oldFact2.id],
    });

    // Reload old facts from state to get updated references
    const refreshedOld1 = state.belief.facts.find((f) => f.id === oldFact1.id)!;
    const refreshedOld2 = state.belief.facts.find((f) => f.id === oldFact2.id)!;

    // Old facts should be superseded
    expect(refreshedOld1.status).toBe("superseded");
    expect(refreshedOld1.supersededBy).toBe(newFact.id);
    expect(refreshedOld2.status).toBe("superseded");
    expect(refreshedOld2.supersededBy).toBe(newFact.id);

    // New fact should remain active
    const refreshedNew = state.belief.facts.find((f) => f.id === newFact.id)!;
    expect(refreshedNew.status).toBe("active");
  });

  it("should exclude superseded facts from getActiveFacts", () => {
    const state = cloneState();

    const oldFact = addFact(state, {
      content: "Manual memory management is required",
      confidence: 0.5,
      source: "user",
    });

    addFact(state, {
      content: "V8 garbage collector handles memory automatically",
      confidence: 0.9,
      source: "execution",
      contradicts: [oldFact.id],
    });

    const active = getActiveFacts(state);

    // Superseded fact should be excluded
    expect(active.find((f) => f.id === oldFact.id)).toBeUndefined();
    expect(active).toHaveLength(1);
  });

  it("should only supersede active facts (not already-superseded ones)", () => {
    const state = cloneState();

    const fact1 = addFact(state, {
      content: "First approach: XML config files",
      confidence: 0.6,
      source: "user",
    });

    // First supersession
    const fact2 = addFact(state, {
      content: "Second approach: YAML config files",
      confidence: 0.8,
      source: "user",
      contradicts: [fact1.id],
    });

    // Track the count before second supersession attempt
    const supersededBefore = state.belief.facts.filter((f) => f.status === "superseded").length;

    // Second supersession — only fact2 is still active, fact1 already superseded
    addFact(state, {
      content: "Final approach: JSON config files with Zod validation",
      confidence: 0.95,
      source: "inference",
      contradicts: [fact1.id, fact2.id],
    });

    const supersededCount = state.belief.facts.filter((f) => f.status === "superseded").length;
    // fact1 already superseded, only fact2 gets superseded now → count increases by 1
    expect(supersededCount - supersededBefore).toBe(1);

    // fact2 should now be superseded by the third fact
    const refreshedFact2 = state.belief.facts.find((f) => f.id === fact2.id)!;
    expect(refreshedFact2.status).toBe("superseded");
  });

  it("should support getActiveFacts with confidence and tag filters", () => {
    const state = cloneState();

    addFact(state, {
      content: "Important: use dependency injection",
      confidence: 0.9,
      source: "inference",
      tags: ["architecture", "di"],
    });

    addFact(state, {
      content: "Minor: prettier config preference",
      confidence: 0.4,
      source: "user",
      tags: ["style"],
    });

    // Filter by minimum confidence
    const highConf = getActiveFacts(state, 0.8);
    expect(highConf).toHaveLength(1);
    expect(highConf[0]!.content).toContain("dependency injection");

    // Filter by tag
    const archFacts = getActiveFacts(state, undefined, ["architecture"]);
    expect(archFacts).toHaveLength(1);
    expect(archFacts[0]!.tags).toContain("architecture");

    // No matching tags
    const noMatch = getActiveFacts(state, undefined, ["database"]);
    expect(noMatch).toHaveLength(0);
  });
});
