"use strict";

/**
 * Unit tests for the Attention Domain (attention-domain.ts).
 *
 * Tests setFocus, setGraphQueries, storeGraphFindings, clearGraphFindings,
 * and setFiles — including cap enforcement, deduplication, and empty states.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  setFocus,
  setGraphQueries,
  storeGraphFindings,
  clearGraphFindings,
  setFiles,
} from "../../../src/domains/attention/attention-domain.js";
import type { NoesisState, GraphFinding } from "../../../src/schema.js";
import { EMPTY_STATE, CAPS } from "../../../src/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freshState(): NoesisState {
  return structuredClone(EMPTY_STATE);
}

// ---------------------------------------------------------------------------
// setFocus
// ---------------------------------------------------------------------------

describe("setFocus", () => {
  it("sets the focus string and default priority", () => {
    const state = freshState();
    setFocus(state, "My current task", "high");

    expect(state.attention.focus).toBe("My current task");
    expect(state.attention.priority).toBe("high");
    expect(state.attention.updatedAt).toBeDefined();
  });

  it("defaults to existing priority when none provided", () => {
    const state = freshState();
    expect(state.attention.priority).toBe("normal");

    setFocus(state, "Just focus, no priority");
    expect(state.attention.focus).toBe("Just focus, no priority");
    expect(state.attention.priority).toBe("normal");
  });

  it("truncates focus beyond CAPS.focusLength", () => {
    const state = freshState();
    const longFocus = "x".repeat(CAPS.focusLength + 50);
    setFocus(state, longFocus);

    expect(state.attention.focus.length).toBe(CAPS.focusLength);
    expect(state.attention.focus).toBe("x".repeat(CAPS.focusLength));
  });

  it("handles empty focus string", () => {
    const state = freshState();
    setFocus(state, "");
    expect(state.attention.focus).toBe("");
  });
});

// ---------------------------------------------------------------------------
// setGraphQueries
// ---------------------------------------------------------------------------

describe("setGraphQueries", () => {
  it("replaces existing graph queries", () => {
    const state = freshState();
    state.attention.graphQueries = ["old-query"];
    setGraphQueries(state, ["q1", "q2"]);

    expect(state.attention.graphQueries).toEqual(["q1", "q2"]);
  });

  it("caps queries at CAPS.graphQueries entries", () => {
    const state = freshState();
    const manyQueries = Array.from({ length: CAPS.graphQueries + 10 }, (_, i) => `q${i}`);
    setGraphQueries(state, manyQueries);

    expect(state.attention.graphQueries.length).toBe(CAPS.graphQueries);
  });

  it("handles empty query array", () => {
    const state = freshState();
    state.attention.graphQueries = ["existing"];
    setGraphQueries(state, []);

    expect(state.attention.graphQueries).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// storeGraphFindings
// ---------------------------------------------------------------------------

describe("storeGraphFindings", () => {
  it("appends new findings", () => {
    const state = freshState();
    const findings: GraphFinding[] = [
      { query: "q1", nodes: [], relations: [], confidence: "EXTRACTED", timestamp: new Date().toISOString() },
    ];

    storeGraphFindings(state, findings);

    expect(state.attention.graphFindings).toHaveLength(1);
    expect(state.attention.graphFindings[0]!.query).toBe("q1");
  });

  it("skips duplicates by query string", () => {
    const state = freshState();
    const first: GraphFinding[] = [
      { query: "q1", nodes: ["A"], relations: [], confidence: "EXTRACTED", timestamp: new Date().toISOString() },
    ];
    const second: GraphFinding[] = [
      { query: "q1", nodes: ["B"], relations: [], confidence: "INFERRED", timestamp: new Date().toISOString() },
    ];

    storeGraphFindings(state, first);
    storeGraphFindings(state, second);

    // Only the first should be kept (duplicate query skipped)
    expect(state.attention.graphFindings).toHaveLength(1);
    expect(state.attention.graphFindings[0]!.nodes).toEqual(["A"]);
  });

  it("handles empty findings array", () => {
    const state = freshState();
    storeGraphFindings(state, []);
    expect(state.attention.graphFindings).toEqual([]);
  });

  it("appends multiple unique queries", () => {
    const state = freshState();
    const batch1: GraphFinding[] = [
      { query: "q1", nodes: [], relations: [], confidence: "EXTRACTED", timestamp: new Date().toISOString() },
      { query: "q2", nodes: [], relations: [], confidence: "INFERRED", timestamp: new Date().toISOString() },
    ];
    const batch2: GraphFinding[] = [
      { query: "q3", nodes: [], relations: [], confidence: "AMBIGUOUS", timestamp: new Date().toISOString() },
    ];

    storeGraphFindings(state, batch1);
    storeGraphFindings(state, batch2);

    expect(state.attention.graphFindings).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// clearGraphFindings
// ---------------------------------------------------------------------------

describe("clearGraphFindings", () => {
  it("empties the graph findings array", () => {
    const state = freshState();
    state.attention.graphFindings = [
      { query: "q", nodes: [], relations: [], confidence: "EXTRACTED", timestamp: new Date().toISOString() },
    ];

    clearGraphFindings(state);

    expect(state.attention.graphFindings).toEqual([]);
  });

  it("is idempotent when already empty", () => {
    const state = freshState();
    clearGraphFindings(state);
    expect(state.attention.graphFindings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// setFiles
// ---------------------------------------------------------------------------

describe("setFiles", () => {
  it("replaces existing file references", () => {
    const state = freshState();
    state.attention.files = ["old.ts"];
    setFiles(state, ["a.ts", "b.ts"]);

    expect(state.attention.files).toEqual(["a.ts", "b.ts"]);
  });

  it("caps files at CAPS.files entries", () => {
    const state = freshState();
    const manyFiles = Array.from({ length: CAPS.files + 20 }, (_, i) => `${i}.ts`);
    setFiles(state, manyFiles);

    expect(state.attention.files.length).toBe(CAPS.files);
  });

  it("handles empty file array", () => {
    const state = freshState();
    state.attention.files = ["keep-me.ts"];
    setFiles(state, []);
    expect(state.attention.files).toEqual([]);
  });
});
