"use strict";

/**
 * omp-noesis: Focus Resolver Unit Tests
 *
 * Tests resolveFocus and resolveFiles fallback chains
 * covering all uncovered branches at lines 27, 31, 35-37.
 */

import { describe, it, expect } from "bun:test";
import { resolveFocus, resolveFiles } from "../../../src/rendering/focus-resolver.js";
import { EMPTY_STATE } from "../../../src/shared/schema.js";
import type { NoesisState } from "../../../src/shared/schema.js";

// =============================================================================
// resolveFocus — fallback chain
// =============================================================================

describe("resolveFocus", () => {
  it("should return attention.focus when non-empty", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    state.attention.focus = "Current focus task";
    expect(resolveFocus(state)).toBe("Current focus task");
  });

  it("should fall back to workflow.goal when focus is empty", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    state.commitment.workflow.goal = "Workflow goal task";
    expect(resolveFocus(state)).toBe("Workflow goal task");
  });

  it("should fall back to workflow.goal when focus is empty but goal is non-empty", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    state.attention.focus = "";
    state.commitment.workflow.goal = "Goal task";
    expect(resolveFocus(state)).toBe("Goal task");
  });

  it("should prefer attention.focus over workflow.goal when both are non-empty", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    state.attention.focus = "Focus task";
    state.commitment.workflow.goal = "Goal task";
    expect(resolveFocus(state)).toBe("Focus task");
  });

  it("should fall back to first pending step description when focus and goal are empty", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    state.commitment.workflow.steps.push({
      id: "ws-1",
      description: "Pending step description",
      status: "pending",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(resolveFocus(state)).toBe("Pending step description");
  });

  it("should fall back to first active step when no pending steps exist", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    state.commitment.workflow.steps.push(
      {
        id: "ws-1",
        description: "Done step",
        status: "done",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "ws-2",
        description: "Active step description",
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    );
    expect(resolveFocus(state)).toBe("Active step description");
  });

  it("should return default when all sources are empty", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    expect(resolveFocus(state)).toBe("Investigate the current task");
  });

  it("should return default when only done/skipped steps exist (no pending or active)", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    state.commitment.workflow.steps.push(
      {
        id: "ws-1",
        description: "Skipped step",
        status: "skipped",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "ws-2",
        description: "Done step",
        status: "done",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    );
    expect(resolveFocus(state)).toBe("Investigate the current task");
  });

  it("should return default when EMPTY_STATE is used directly", () => {
    expect(resolveFocus(EMPTY_STATE)).toBe("Investigate the current task");
  });
});

// =============================================================================
// resolveFiles — file reference fallback
// =============================================================================

describe("resolveFiles", () => {
  it("should return attention.files when non-empty", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    state.attention.files = ["file1.ts", "file2.ts"];
    expect(resolveFiles(state)).toEqual(["file1.ts", "file2.ts"]);
  });

  it("should return empty array when files is empty", () => {
    expect(resolveFiles(EMPTY_STATE)).toEqual([]);
  });
});
