"use strict";

import { describe, it, expect } from "bun:test";
import { resolveProvenance, type ProvenanceNode } from "../../../src/application/use-cases/resolve-provenance.js";
import type { NoesisState } from "../../../src/shared/schema.js";

function makeState(overrides?: Partial<NoesisState>): NoesisState {
  const ts = new Date("2026-01-01T00:00:00.000Z").toISOString();
  return {
    version: "1.0.0",
    lastPersisted: ts,
    attention: {
      focus: "test",
      priority: "normal",
      graphQueries: [],
      files: [],
      graphFindings: [],
      pendingEvidence: [],
      updatedAt: ts,
    },
    belief: {
      facts: [
        {
          id: "bf-alpha",
          content: "Original belief",
          confidence: 0.8,
          source: "user",
          createdAt: ts,
          updatedAt: ts,
          status: "superseded",
          supersededBy: "bf-beta",
          tags: [],
          evidence: "Initial evidence",
        },
        {
          id: "bf-beta",
          content: "Refined belief",
          confidence: 0.9,
          source: "inference",
          createdAt: ts,
          updatedAt: ts,
          status: "active",
          tags: [],
        },
        {
          id: "bf-gamma",
          content: "Unrelated belief",
          confidence: 0.7,
          source: "graph",
          createdAt: ts,
          updatedAt: ts,
          status: "active",
          tags: [],
        },
      ],
      decisions: [
        {
          id: "bd-d1",
          content: "A design decision",
          rationale: "Because it's better",
          source: "user",
          createdAt: ts,
          updatedAt: ts,
          status: "active",
          alternatives: [],
          tags: [],
        },
        {
          id: "bd-d2",
          content: "Superseded decision",
          rationale: "Old rationale",
          source: "inference",
          createdAt: ts,
          updatedAt: ts,
          status: "superseded",
          supersededBy: "bf-beta",
          alternatives: [],
          tags: [],
        },
      ],
    },
    inference: {
      hypotheses: [],
      reasoning: [],
    },
    commitment: {
      workflow: {
        id: "wf-test",
        goal: "test",
        status: "draft",
        steps: [],
        createdAt: ts,
        updatedAt: ts,
      },
      actions: [],
    },
    learning: {
      successes: [],
      failures: [],
      summary: { successCount: 0, failureCount: 0, resolvedCount: 0 },
    },
    ...overrides,
  } as NoesisState;
}

describe("resolveProvenance", () => {
  it("finds a belief fact by ID and returns its provenance node", () => {
    const state = makeState();
    const node = resolveProvenance(state, "bf-alpha");
    expect(node).not.toBeNull();
    expect(node!.beliefId).toBe("bf-alpha");
    expect(node!.content).toBe("Original belief");
    expect(node!.source).toBe("user");
    expect(node!.evidence).toBe("Initial evidence");
    expect(node!.supersededBy).toBe("bf-beta");
  });

  it("returns null for an unknown beliefId", () => {
    const state = makeState();
    const node = resolveProvenance(state, "bf-nonexistent");
    expect(node).toBeNull();
  });

  it("finds a decision by ID and returns its provenance node", () => {
    const state = makeState();
    const node = resolveProvenance(state, "bd-d1");
    expect(node).not.toBeNull();
    expect(node!.beliefId).toBe("bd-d1");
    expect(node!.content).toBe("A design decision");
    expect(node!.source).toBe("user");
    // decisions don't have evidence
    expect((node as ProvenanceNode).evidence).toBeUndefined();
  });

  it("includes supersession chain information", () => {
    const state = makeState();
    // bf-beta supersedes bf-alpha (alpha.supersededBy === beta)
    // bd-d2 is superseded by bf-beta (d2.supersededBy === beta)
    const node = resolveProvenance(state, "bf-beta");
    expect(node).not.toBeNull();
    // beta.supersedes should include alpha AND d2 since both point to beta
    expect(node!.supersedes).toContain("bf-alpha");
    expect(node!.supersedes).toContain("bd-d2");
    // beta is not superseded by anything
    expect(node!.supersededBy).toBeUndefined();
  });

  it("returns empty supersedes array when belief supersedes nothing", () => {
    const state = makeState();
    const node = resolveProvenance(state, "bf-gamma");
    expect(node).not.toBeNull();
    expect(node!.supersedes).toEqual([]);
  });
});
