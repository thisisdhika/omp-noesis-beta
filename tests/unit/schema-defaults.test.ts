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
} from "../../src/schema.js";
import type { NoesisState } from "../../src/schema.js";

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
    expect(attn.contextUsage).toBe(0);
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
    expect(summary.diagnosedCount).toBe(0);
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
