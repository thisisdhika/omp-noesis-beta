"use strict";

/**
 * omp-noesis: Preamble Builder Unit Tests
 *
 * Tests that buildPreamble correctly assembles the context preamble
 * under empty and populated states, respects budget enforcement,
 * and maintains correct section ordering.
 */

import { describe, it, expect } from "bun:test";
import { buildPreamble } from "../../../src/rendering/preamble-builder.js";
import { EMPTY_STATE, MAX_PREAMBLE_TOKENS } from "../../../src/schema.js";
import { populatedState } from "../../helpers/fixtures.js";
import type { NoesisState, RenderContext } from "../../../src/schema.js";

// =============================================================================
// Shared test data
// =============================================================================

const fullRender: RenderContext = {
  capabilityLevel: "FULL",
  graphifyVersion: "1.0.0",
  graphFreshness: { isStale: false },
  staleReviewFlags: [],
  contextHookFired: true,
};

const degradedRender: RenderContext = {
  capabilityLevel: "DEGRADED",
  contextHookFired: false,
};

// =============================================================================
// buildPreamble — EMPTY_STATE
// =============================================================================

describe("buildPreamble with EMPTY_STATE", () => {
  it("should return a preamble with capability block and state pointer", () => {
    const result = buildPreamble(EMPTY_STATE, fullRender);
    expect(result).toBeTruthy();
    expect(result).toContain("[Noesis: FULL — graph-aware");
    expect(result).toContain("State: .omp/noesis/state.json");
  });

  it("should return a preamble with DEGRADED capability when no graph", () => {
    const result = buildPreamble(EMPTY_STATE, degradedRender);
    expect(result).toContain("[Noesis: DEGRADED");
    expect(result).toContain("State: .omp/noesis/state.json");
  });

  it("should skip empty sections for EMPTY_STATE", () => {
    const result = buildPreamble(EMPTY_STATE, fullRender);
    // All variable sections (focus, workflow, decisions, beliefs, etc.) should be absent
    expect(result).not.toContain("Focus:");
    expect(result).not.toContain("Workflow:");
    expect(result).not.toContain("Decisions:");
    expect(result).not.toContain("Beliefs");
    expect(result).not.toContain("Hypotheses:");
    expect(result).not.toContain("Learning:");
    expect(result).not.toContain("Graph evidence");
    expect(result).not.toContain("Low-confidence beliefs:");
  });
});

// =============================================================================
// buildPreamble — populatedState
// =============================================================================

describe("buildPreamble with populatedState", () => {
  it("should include all non-empty sections", () => {
    const state = populatedState();
    const result = buildPreamble(state, fullRender);
    expect(result).toContain("[Noesis: FULL — graph-aware");
    expect(result).toContain("Workflow:");
    expect(result).toContain("Implement cognitive substrate");
    // The populated state includes a belief with confidence >= 0.75
    expect(result).toContain("Beliefs (\u22650.75):");
    // Populated state has a decision
    expect(result).toContain("Decisions:");
    // Populated state has a hypothesis
    expect(result).toContain("Hypotheses:");
    // Populated state has a learning entry
    expect(result).toContain("Learning:");
    // State pointer
    expect(result).toContain("State: .omp/noesis/state.json");
  });

  it("should maintain correct section ordering", () => {
    const state = populatedState();
    const result = buildPreamble(state, fullRender);
    const lines = result.split("\n").filter((l) => l.length > 0);
    // The first non-empty line should be the capability block
    expect(lines[0]).toContain("[Noesis:");
    // State pointer should be the last non-empty block
    expect(lines[lines.length - 1]).toContain("State: .omp/noesis/state.json");
  });
});

// =============================================================================
// Budget enforcement
// =============================================================================

describe("buildPreamble budget enforcement", () => {
  it("should stay under MAX_PREAMBLE_TOKENS for a populated state", () => {
    const state = populatedState();
    const result = buildPreamble(state, fullRender);
    const estimatedTokens = Math.ceil(result.length / 4);
    expect(estimatedTokens).toBeLessThanOrEqual(MAX_PREAMBLE_TOKENS);
  });

  it("should stay under budget with a state that maximises all sections", () => {
    // Build a state with many entries to push towards the budget
    const state: NoesisState = structuredClone(EMPTY_STATE);
    state.attention.focus = "x".repeat(200);
    state.commitment.workflow.goal = "Very long goal ".repeat(40);
    state.commitment.workflow.status = "active";
    for (let i = 0; i < 20; i++) {
      state.commitment.workflow.steps.push({
        id: `s-${i}`,
        status: "active",
        description: "Step " + "x".repeat(100),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    for (let i = 0; i < 20; i++) {
      state.belief.facts.push({
        id: `bf-${i}`,
        content: "Fact " + "x".repeat(200),
        confidence: 0.95,
        source: "execution",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    for (let i = 0; i < 20; i++) {
      state.belief.decisions.push({
        id: `bd-${i}`,
        content: "Decision " + "x".repeat(200),
        rationale: "",
        source: "user",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    for (let i = 0; i < 20; i++) {
      state.inference.hypotheses.push({
        id: `hy-${i}`,
        content: "Hypothesis " + "x".repeat(200),
        status: "testing",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        evidence: "",
      });
    }
    for (let i = 0; i < 20; i++) {
      state.learning.successes.push({
        id: `le-${i}`,
        description: "Success " + "x".repeat(200),
        status: "resolved",
        capturedAt: new Date().toISOString(),
      });
    }

    const result = buildPreamble(state, fullRender);
    const estimatedTokens = Math.ceil(result.length / 4);
    expect(estimatedTokens).toBeLessThanOrEqual(MAX_PREAMBLE_TOKENS);
  });

  it("should never drop the protected sections (capability + state pointer)", () => {
    // Force-blow the budget with huge content so non-protected sections get dropped
    const state: NoesisState = structuredClone(EMPTY_STATE);
    state.commitment.workflow.goal = "Test";
    state.commitment.workflow.status = "active";
    // Add huge workflow content that would be dropped
    for (let i = 0; i < 50; i++) {
      state.commitment.workflow.steps.push({
        id: `s-${i}`,
        status: "active",
        description: "x".repeat(500),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    // Add huge beliefs
    for (let i = 0; i < 50; i++) {
      state.belief.facts.push({
        id: `bf-${i}`,
        content: "x".repeat(500),
        confidence: 0.95,
        source: "execution",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    const result = buildPreamble(state, fullRender);
    expect(result).toContain("[Noesis:");
    expect(result).toContain("State: .omp/noesis/state.json");
    // The protected sections (indexes 1, 2, 10) are always kept
    const estimatedTokens = Math.ceil(result.length / 4);
    expect(estimatedTokens).toBeLessThanOrEqual(MAX_PREAMBLE_TOKENS);
  });
});
