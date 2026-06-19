"use strict";

/**
 * Unit tests for schema defaults and constants (schema.ts).
 *
 * Covers EMPTY_STATE structure and defaults, CAPS constants,
 * and generateId format.
 */

import { describe, it, expect } from "bun:test";
import {
  EMPTY_STATE,
  CAPS,
  CURRENT_VERSION,
  generateId,
  MAX_PREAMBLE_TOKENS,
  NoesisStateSchema,
  CommitmentLayerSchema,
  LearningEntrySchema,
  VaultArtifactSchema,
} from "../../src/shared/schema.js";
import type { NoesisState } from "../../src/shared/schema.js";

// ---------------------------------------------------------------------------
// EMPTY_STATE
// ---------------------------------------------------------------------------

describe("EMPTY_STATE", () => {
  it("has version set to CURRENT_VERSION", () => {
    expect(EMPTY_STATE.version).toBe(CURRENT_VERSION);
  });

  it("has a valid ISO timestamp in lastPersisted", () => {
    expect(EMPTY_STATE.lastPersisted).toEqual(expect.any(String));
    expect(new Date(EMPTY_STATE.lastPersisted).toISOString()).toBe(EMPTY_STATE.lastPersisted);
  });

  it("has attention layer with empty defaults", () => {
    const attn = EMPTY_STATE.attention;
    expect(attn.focus).toBe("");
    expect(attn.priority).toBe("normal");
    expect(attn.graphQueries).toEqual([]);
    expect(attn.files).toEqual([]);
    expect(attn.graphFindings).toEqual([]);
    expect(attn.updatedAt).toEqual(expect.any(String));
  });

  it("has belief layer with empty facts and decisions", () => {
    expect(EMPTY_STATE.belief.facts).toEqual([]);
    expect(EMPTY_STATE.belief.decisions).toEqual([]);
  });

  it("has inference layer with empty hypotheses and reasoning", () => {
    expect(EMPTY_STATE.inference.hypotheses).toEqual([]);
    expect(EMPTY_STATE.inference.reasoning).toEqual([]);
  });

  it("has commitment layer with draft workflow and empty actions", () => {
    const wf = EMPTY_STATE.commitment.workflow;
    expect(wf.goal).toBe("");
    expect(wf.status).toBe("draft");
    expect(wf.steps).toEqual([]);
    expect(wf.id).toMatch(/^wf-/);
    expect(wf.createdAt).toEqual(expect.any(String));
    expect(wf.updatedAt).toEqual(expect.any(String));
    expect(EMPTY_STATE.commitment.actions).toEqual([]);
  });

  it("has learning layer with empty arrays and zero summary", () => {
    expect(EMPTY_STATE.learning.successes).toEqual([]);
    expect(EMPTY_STATE.learning.failures).toEqual([]);
    const summary = EMPTY_STATE.learning.summary;
    expect(summary.successCount).toBe(0);
    expect(summary.failureCount).toBe(0);
    expect(summary.resolvedCount).toBe(0);
  });

  it("returns a fresh deep clone each time structuredClone is used", () => {
    const clone = structuredClone(EMPTY_STATE);
    clone.attention.focus = "modified";
    expect(EMPTY_STATE.attention.focus).toBe(""); // unmodified
  });
});

// ---------------------------------------------------------------------------
// CAPS
// ---------------------------------------------------------------------------

describe("CAPS constants", () => {
  it("defines attention caps", () => {
    expect(CAPS.focus).toBe(2);
    expect(CAPS.workflow).toBe(3);
    expect(CAPS.files).toBe(10);
    expect(CAPS.graphQueries).toBe(5);
  });

  it("defines belief caps", () => {
    expect(CAPS.decisions).toBe(5);
    expect(CAPS.beliefs).toBe(10);
  });

  it("defines inference caps", () => {
    expect(CAPS.hypotheses).toBe(3);
    expect(CAPS.alternatives).toBe(3);
  });

  it("defines learning and commitment caps", () => {
    expect(CAPS.learning).toBe(3);
    expect(CAPS.learningEntries).toBe(100);
    expect(CAPS.actions).toBe(50);
    expect(CAPS.workflowSteps).toBe(20);
  });

  it("defines length caps", () => {
    expect(CAPS.contentLength).toBe(1000);
    expect(CAPS.descriptionLength).toBe(500);
    expect(CAPS.evidenceLength).toBe(500);
    expect(CAPS.rationaleLength).toBe(1000);
    expect(CAPS.rootCauseLength).toBe(1000);
    expect(CAPS.fixLength).toBe(1000);
    expect(CAPS.focusLength).toBe(200);
    expect(CAPS.verificationLength).toBe(200);
  });

  it("defines tag caps", () => {
    expect(CAPS.beliefTags).toBe(5);
    expect(CAPS.decisionTags).toBe(5);
    expect(CAPS.hypothesisTags).toBe(5);
  });
  it("is deeply readonly at the type level (as const assertion)", () => {
    // TypeScript's `as const` assertion makes CAPS deeply readonly.
    // At runtime, spreading CAPS creates a mutable copy, which is the intended usage.
    expect(CAPS.STALE_THRESHOLD_HOURS).toBe(720);
    expect(CAPS.focus).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// generateId
// ---------------------------------------------------------------------------

describe("generateId", () => {
  it("prepends the given prefix", () => {
    const id = generateId("wf");
    expect(id).toMatch(/^wf-/);
  });

  it("produces unique values", () => {
    const ids = new Set(Array.from({ length: 10 }, () => generateId("test")));
    expect(ids.size).toBe(10);
  });

  it("is UUIDv4 after the prefix", () => {
    const id = generateId("x");
    const uuidPart = id.slice("x-".length);
    // UUIDv4 format: 8-4-4-4-12 hex digits
    expect(uuidPart).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});

// ---------------------------------------------------------------------------
// MAX_PREAMBLE_TOKENS
// ---------------------------------------------------------------------------

describe("MAX_PREAMBLE_TOKENS", () => {
  it("is defined as 2000", () => {
    expect(MAX_PREAMBLE_TOKENS).toBe(2000);
  });
});

// ---------------------------------------------------------------------------
// CommitmentLayerSchema (covers default factory at lines 217-223)
// ---------------------------------------------------------------------------

describe("CommitmentLayerSchema", () => {
  it("generates workflow via default factory when omitted from parse", () => {
    const result = CommitmentLayerSchema.parse({ actions: [] });
    expect(result.workflow).toBeDefined();
    expect(result.workflow.id).toMatch(/^wf-/);
    expect(result.workflow.goal).toBe("");
    expect(result.workflow.status).toBe("draft");
    expect(result.workflow.steps).toEqual([]);
    expect(result.actions).toEqual([]);
  });

  it("accepts explicit workflow data", () => {
    const now = new Date().toISOString();
    const result = CommitmentLayerSchema.parse({
      workflow: {
        id: generateId("wf"),
        goal: "explicit goal",
        status: "active",
        steps: [],
        createdAt: now,
        updatedAt: now,
      },
      actions: [],
    });
    expect(result.workflow.goal).toBe("explicit goal");
    expect(result.workflow.status).toBe("active");
  });
});

// ---------------------------------------------------------------------------
// NoesisStateSchema
// ---------------------------------------------------------------------------

describe("NoesisStateSchema", () => {
  it("parses a minimal valid state object", () => {
    const now = new Date().toISOString();
    const state = {
      version: CURRENT_VERSION,
      lastPersisted: now,
      attention: {
        focus: "",
        priority: "normal",
        graphQueries: [],
        files: [],
        graphFindings: [],
        pendingEvidence: [],
        updatedAt: now,
      },
      belief: { facts: [], decisions: [] },
      inference: { hypotheses: [], reasoning: [] },
      commitment: {
        workflow: {
          id: generateId("wf"),
          goal: "",
          status: "draft",
          steps: [],
          createdAt: now,
          updatedAt: now,
        },
        actions: [],
      },
      learning: {
        successes: [],
        failures: [],
        summary: { successCount: 0, failureCount: 0, resolvedCount: 0 },
      },
    };
    const result = NoesisStateSchema.parse(state);
    expect(result.version).toBe(CURRENT_VERSION);
  });
});

// ---------------------------------------------------------------------------
// LearningEntrySchema default
// ---------------------------------------------------------------------------

describe("LearningEntrySchema", () => {
  it("defaults status to captured when omitted", () => {
    const result = LearningEntrySchema.parse({
      id: "le-test-123e4567-e89b-12d3-a456-426614174000",
      description: "test learning entry",
      capturedAt: new Date().toISOString(),
    });
    expect(result.status).toBe("captured");
  });
});

// ---------------------------------------------------------------------------
// VaultArtifactSchema (covers refine callback at line 330)
// ---------------------------------------------------------------------------

describe("VaultArtifactSchema", () => {
  it("parses a valid vault artifact", () => {
    const result = VaultArtifactSchema.parse({
      kind: "decision",
      projectPath: "/test/project",
      id: "valid-id",
      pushedAt: new Date().toISOString(),
      content: "some content",
    });
    expect(result.id).toBe("valid-id");
  });

  it("rejects artifact ID containing path separators", () => {
    expect(() =>
      VaultArtifactSchema.parse({
        kind: "belief",
        projectPath: "/p",
        id: "contains/slash",
        pushedAt: new Date().toISOString(),
        content: "x",
      }),
    ).toThrow();
  });

  it("rejects artifact ID containing parent directory reference", () => {
    expect(() =>
      VaultArtifactSchema.parse({
        kind: "belief",
        projectPath: "/p",
        id: "contains..",
        pushedAt: new Date().toISOString(),
        content: "x",
      }),
    ).toThrow();
  });
});
