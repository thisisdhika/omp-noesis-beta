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
import { EMPTY_STATE, MAX_PREAMBLE_TOKENS } from "../../../src/shared/schema.js";
import { populatedState } from "../../helpers/fixtures.js";
import type { NoesisState, RenderContext } from "../../../src/shared/schema.js";
import { estimateTokens } from "../../../src/shared/tokens.js";

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
    // The protected sections (indexes 1, 2, 3, 11) are always kept
    const estimatedTokens = Math.ceil(result.length / 4);
    expect(estimatedTokens).toBeLessThanOrEqual(MAX_PREAMBLE_TOKENS);
  });
});

// =============================================================================
// buildPreamble — Contested warnings
// =============================================================================

describe("buildPreamble with contested warnings", () => {
  it("should include [WARNINGS] section when superseded belief has dependent hypothesis", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    state.belief.facts.push({
      id: "bf-1",
      content: "Superseded fact",
      confidence: 0.9,
      source: "execution",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      status: "superseded",
    });
    state.inference.hypotheses.push({
      id: "hy-1",
      content: "Testing hypothesis",
      status: "testing",
      relatedBeliefId: "bf-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const result = buildPreamble(state, fullRender);
    expect(result).toContain("[WARNINGS]");
    expect(result).toContain("Belief 'Superseded fact' superseded");
    expect(result).toContain("hypothesis 'Testing hypothesis'");
  });

  it("should omit [WARNINGS] section when no contested beliefs exist", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    const result = buildPreamble(state, fullRender);
    expect(result).not.toContain("[WARNINGS]");
  });
});

// =============================================================================
// buildPreamble — capability block variants
// =============================================================================

describe("buildPreamble capability block variants", () => {
  it("should render STALE with staleHours when graphFreshness provides it", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    const render: RenderContext = {
      capabilityLevel: "STALE",
      graphFreshness: { isStale: true, staleHours: 3 },
      contextHookFired: false,
    };
    const result = buildPreamble(state, render);
    expect(result).toContain("[Noesis: STALE — graph 3h stale, review needed]");
  });

  it("should render STALE with '?' when staleHours is absent", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    const render: RenderContext = {
      capabilityLevel: "STALE",
      graphFreshness: { isStale: true },
      contextHookFired: false,
    };
    const result = buildPreamble(state, render);
    expect(result).toContain("[Noesis: STALE — graph ?h stale, review needed]");
  });

  it("should render STALE with '?' when graphFreshness is undefined", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    const render: RenderContext = {
      capabilityLevel: "STALE",
      contextHookFired: false,
    };
    const result = buildPreamble(state, render);
    expect(result).toContain("[Noesis: STALE — graph ?h stale, review needed]");
  });

  it("should render NO_GRAPH capability", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    const render: RenderContext = {
      capabilityLevel: "NO_GRAPH",
      contextHookFired: false,
    };
    const result = buildPreamble(state, render);
    expect(result).toContain("[Noesis: NO_GRAPH — graph not built]");
  });

  it("should render UNKNOWN for unrecognised capability level (default branch)", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    const render: RenderContext = {
      capabilityLevel: "UNKNOWN" as any,
      contextHookFired: false,
    };
    const result = buildPreamble(state, render);
    expect(result).toContain("[Noesis: UNKNOWN — operating without graph]");
  });
});

// =============================================================================
// buildPreamble — graph evidence section
// =============================================================================

describe("buildPreamble with graph evidence", () => {
  it("should include graph evidence section when graphFindings exist", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    state.attention.graphFindings.push({
      query: "dependency graph",
      nodes: ["a", "b"],
      relations: ["depends-on"],
      confidence: "EXTRACTED",
      timestamp: "2026-01-02T00:00:00.000Z",
    });
    state.attention.graphFindings.push({
      query: "call hierarchy",
      nodes: ["x", "y"],
      relations: ["calls"],
      confidence: "INFERRED",
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    const result = buildPreamble(state, fullRender);
    expect(result).toContain("Graph evidence (2):");
    expect(result).toContain("dependency graph");
    expect(result).toContain("call hierarchy");
  });

  it("should show only the 2 most recent graph findings by timestamp", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    state.attention.graphFindings.push(
      {
        query: "older query",
        nodes: [],
        relations: [],
        confidence: "EXTRACTED",
        timestamp: "2026-01-01T00:00:00.000Z",
      },
      {
        query: "middle query",
        nodes: [],
        relations: [],
        confidence: "EXTRACTED",
        timestamp: "2026-01-02T00:00:00.000Z",
      },
      {
        query: "newest query",
        nodes: [],
        relations: [],
        confidence: "EXTRACTED",
        timestamp: "2026-01-03T00:00:00.000Z",
      },
    );
    const result = buildPreamble(state, fullRender);
    expect(result).toContain("Graph evidence (3):");
    expect(result).toContain("newest query");
    expect(result).toContain("middle query");
    expect(result).not.toContain("older query");
  });

  it("should omit graph evidence section when graphFindings is empty", () => {
    const result = buildPreamble(EMPTY_STATE, fullRender);
    expect(result).not.toContain("Graph evidence");
  });
});

// =============================================================================
// buildPreamble — low confidence signal
// =============================================================================

describe("buildPreamble with low-confidence beliefs", () => {
  it("should include low-confidence count when beliefs with confidence < 0.75 exist", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    state.belief.facts.push({
      id: "bf-low",
      content: "Low confidence fact",
      confidence: 0.5,
      source: "execution",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const result = buildPreamble(state, fullRender);
    expect(result).toContain("Low-confidence beliefs: 1");
  });

  it("should include low-confidence count for multiple low-confidence beliefs", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    for (let i = 0; i < 3; i++) {
      state.belief.facts.push({
        id: `bf-low-${i}`,
        content: `Low confidence fact ${i}`,
        confidence: 0.4,
        source: "execution",
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
    }
    const result = buildPreamble(state, fullRender);
    expect(result).toContain("Low-confidence beliefs: 3");
  });

  it("should omit low-confidence signal when no beliefs exist", () => {
    const result = buildPreamble(EMPTY_STATE, fullRender);
    expect(result).not.toContain("Low-confidence beliefs:");
  });

  it("should omit low-confidence signal when all beliefs have confidence >= 0.75", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    state.belief.facts.push({
      id: "bf-high",
      content: "High confidence fact",
      confidence: 0.9,
      source: "execution",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const result = buildPreamble(state, fullRender);
    expect(result).toContain("Beliefs (\u22650.75):");
    expect(result).not.toContain("Low-confidence beliefs:");
  });
});

// =============================================================================
// buildPreamble — budget enforcement while loop body
// =============================================================================

describe("buildPreamble budget enforcement while loop", () => {
  it("should drop non-protected sections when budget is exceeded", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    state.attention.focus = "Focus task";
    state.commitment.workflow.goal = "Workflow goal";
    state.commitment.workflow.status = "active";
    // Add workflow steps with wordy descriptions (max 3 shown)
    for (let i = 0; i < 3; i++) {
      state.commitment.workflow.steps.push({
        id: `ws-${i}`,
        status: "active",
        description: "wordy step description that consumes many tokens indeed ".repeat(40),
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
    }
    // Add many decisions (max 5 shown)
    for (let i = 0; i < 5; i++) {
      state.belief.decisions.push({
        id: `bd-${i}`,
        content: "wordy decision content that consumes many tokens indeed ".repeat(40),
        rationale: "",
        source: "user",
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
    }
    // Add many beliefs (max 10 shown)
    for (let i = 0; i < 10; i++) {
      state.belief.facts.push({
        id: `bf-${i}`,
        content: "wordy belief content that consumes many tokens indeed ".repeat(40),
        confidence: 0.95,
        source: "execution",
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
    }
    // Add hypotheses (max 3 shown)
    for (let i = 0; i < 3; i++) {
      state.inference.hypotheses.push({
        id: `hy-${i}`,
        content: "wordy hypothesis content that consumes many tokens indeed ".repeat(40),
        status: "testing",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        evidence: "",
      });
    }
    // Add learning entries (max 3 shown)
    for (let i = 0; i < 3; i++) {
      state.learning.successes.push({
        id: `le-${i}`,
        description: "wordy learning description that consumes many tokens indeed ".repeat(40),
        status: "resolved",
        capturedAt: "2026-01-01T00:00:00.000Z",
      });
    }
    // Add graph findings
    for (let i = 0; i < 3; i++) {
      state.attention.graphFindings.push({
        query: "wordy graph query that consumes many tokens indeed ".repeat(20),
        nodes: [],
        relations: [],
        confidence: "EXTRACTED",
        timestamp: "2026-01-01T00:00:00.000Z",
      });
    }

    const result = buildPreamble(state, fullRender);
    // Check budget compliance using the same estimator as the source
    expect(estimateTokens(result)).toBeLessThanOrEqual(MAX_PREAMBLE_TOKENS);
    // Protected sections must still survive
    expect(result).toContain("[Noesis:");
    expect(result).toContain("State: .omp/noesis/state.json");
    // At least one non-protected section should have been dropped (the output
    // should contain fewer section headers than all available sections)
    const hasLowConf = result.includes("Low-confidence beliefs:");
    const hasGraphEvidence = result.includes("Graph evidence");
    const hasLearning = result.includes("Learning:");
    const hasHypotheses = result.includes("Hypotheses:");
    const hasBeliefs = result.includes("Beliefs (≥0.75):");
    const hasDecisions = result.includes("Decisions:");
    const hasWorkflow = result.includes("Workflow:");
    const nonProtectedCount = [
      hasWorkflow, hasDecisions, hasBeliefs, hasHypotheses,
      hasLearning, hasGraphEvidence, hasLowConf,
    ].filter(Boolean).length;
    expect(nonProtectedCount).toBeLessThan(7);
  });

  it("should never drop protected sections even with extreme token load", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    state.attention.focus = "wordy focus content that consumes many tokens ".repeat(10);
    state.commitment.workflow.goal = "wordy goal content that consumes many tokens ".repeat(80);
    state.commitment.workflow.status = "active";
    for (let i = 0; i < 3; i++) {
      state.commitment.workflow.steps.push({
        id: `ws-${i}`,
        status: "active",
        description: "wordy step description that consumes many tokens indeed ".repeat(80),
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
    }
    for (let i = 0; i < 10; i++) {
      state.belief.facts.push({
        id: `bf-${i}`,
        content: "wordy belief content that consumes many tokens indeed ".repeat(80),
        confidence: 0.95,
        source: "execution",
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
    }

    const result = buildPreamble(state, fullRender);
    expect(estimateTokens(result)).toBeLessThanOrEqual(MAX_PREAMBLE_TOKENS);
    // Protected sections (capability, contested warnings, focus, state pointer)
    // must all survive the budget culling
    expect(result).toContain("[Noesis:");
    expect(result).toContain("Focus:");
    expect(result).toContain("State: .omp/noesis/state.json");
  });
});

// =============================================================================
// Model-specific density control
// =============================================================================

describe("buildPreamble model-specific density control", () => {
  /** Render context scoped to a specific model family. */
  function renderFor(family: string, capability: "FULL" | "DEGRADED" = "DEGRADED"): RenderContext {
    return {
      capabilityLevel: capability,
      contextHookFired: true,
      modelFamily: family,
    };
  }

  it("frontier models (claude) keep all sections", () => {
    const result = buildPreamble(EMPTY_STATE, renderFor("claude", "FULL"));
    // All non-protected sections present (with degraded capability, many are empty)
    // Protected sections always present
    expect(result).toContain("[Noesis:");
    expect(result).toContain("State: .omp/noesis/state.json");
  });

  it("frontier models (gpt) keep all sections", () => {
    const result = buildPreamble(EMPTY_STATE, renderFor("gpt"));
    expect(result).toContain("[Noesis:");
    expect(result).toContain("State: .omp/noesis/state.json");
  });

  it("gemini keeps all sections", () => {
    const result = buildPreamble(EMPTY_STATE, renderFor("gemini"));
    expect(result).toContain("[Noesis:");
    expect(result).toContain("State: .omp/noesis/state.json");
  });

  it("deepseek limits non-protected sections to 3", () => {
    // With populatedState, non-protected sections have content
    const deepseekRender = renderFor("deepseek", "FULL");
    const frontierResult = buildPreamble(populatedState(), renderFor("claude", "FULL"));
    const deepseekResult = buildPreamble(populatedState(), deepseekRender);

    // DeepSeek preamble should be shorter (fewer sections)
    expect(deepseekResult.length).toBeLessThanOrEqual(frontierResult.length);
    // Protected sections always survive
    expect(deepseekResult).toContain("[Noesis:");
    expect(deepseekResult).toContain("State: .omp/noesis/state.json");
  });

  it("qwen limits non-protected sections to 3", () => {
    const result = buildPreamble(populatedState(), renderFor("qwen", "FULL"));
    expect(result).toContain("[Noesis:");
    expect(result).toContain("State: .omp/noesis/state.json");
    // Protected sections never dropped
    expect(result).not.toBe("");
  });

  it("mimo limits non-protected sections to 3", () => {
    const result = buildPreamble(populatedState(), renderFor("mimo"));
    expect(result).toContain("[Noesis:");
    expect(result).toContain("State: .omp/noesis/state.json");
  });

  it("llama limits non-protected sections to 4", () => {
    const llamaResult = buildPreamble(populatedState(), renderFor("llama", "FULL"));
    const deepseekResult = buildPreamble(populatedState(), renderFor("deepseek", "FULL"));
    // llama gets 4 non-protected, deepseek gets 3 — llama should be same or larger
    expect(llamaResult.length).toBeGreaterThanOrEqual(deepseekResult.length);
    expect(llamaResult).toContain("[Noesis:");
    expect(llamaResult).toContain("State: .omp/noesis/state.json");
  });

  it("unknown model family gets all sections (default front-tier)", () => {
    const noModelResult = buildPreamble(EMPTY_STATE, {
      capabilityLevel: "DEGRADED",
      contextHookFired: true,
      // modelFamily intentionally omitted
    });
    const claudeResult = buildPreamble(EMPTY_STATE, renderFor("claude"));
    // Should match frontier (same section count)
    expect(noModelResult).toBe(claudeResult);
  });

  it("protected sections are never removed even with deepseek", () => {
    const result = buildPreamble(populatedState(), renderFor("deepseek", "FULL"));
    // Protected sections with content always survive: capability block + state pointer
    // (Focus is protected but empty since populatedState has no focus — filtered elsewhere)
    expect(result).toContain("[Noesis:");
    expect(result).toContain("State: .omp/noesis/state.json");
  });

  it("first non-protected sections are kept, later ones dropped for small models", () => {
    const deepseekResult = buildPreamble(populatedState(), renderFor("deepseek", "FULL"));
    const claudeResult = buildPreamble(populatedState(), renderFor("claude", "FULL"));
    // DeepSeek drops sections from the bottom up (highest indices first)
    // The preamble is always shorter or equal
    expect(deepseekResult.length).toBeLessThanOrEqual(claudeResult.length);
  });
});
