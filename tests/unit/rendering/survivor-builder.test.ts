"use strict";

/**
 * omp-noesis: Survivor Builder Unit Tests
 *
 * Tests that buildSurvivorContext produces well-formed XML
 * under empty and populated states, stays within the 500-token
 * budget, and correctly includes attention, workflow, beliefs,
 * learning, and pointer sections.
 */

import { describe, it, expect } from "bun:test";
import { buildSurvivorContext } from "../../../src/rendering/survivor-builder.js";
import { EMPTY_STATE } from "../../../src/shared/schema.js";
import { populatedState } from "../../helpers/fixtures.js";
import type { NoesisState } from "../../../src/shared/schema.js";
import { estimateTokens } from "../../../src/shared/tokens.js";

// =============================================================================
// buildSurvivorContext — EMPTY_STATE
// =============================================================================

describe("buildSurvivorContext with EMPTY_STATE", () => {
  it("should return XML with attention, workflow, and pointer", () => {
    const result = buildSurvivorContext(EMPTY_STATE);
    expect(result).toContain("<noesis-state>");
    expect(result).toContain("</noesis-state>");
    expect(result).toContain("<attention>");
    expect(result).toContain("</attention>");
    expect(result).toContain("<workflow>");
    expect(result).toContain("</workflow>");
    expect(result).toContain("<pointer>");
  });

  it("should not include beliefs or learning when empty", () => {
    const result = buildSurvivorContext(EMPTY_STATE);
    expect(result).not.toContain("<beliefs>");
    expect(result).not.toContain("</beliefs>");
    expect(result).not.toContain("<learning>");
    expect(result).not.toContain("</learning>");
  });

  it("should produce well-formed XML (no unclosed tags)", () => {
    const result = buildSurvivorContext(EMPTY_STATE);
    // Count opening vs closing tags for the root element
    const openTags = (result.match(/<noesis-state>/g) || []).length;
    const closeTags = (result.match(/<\/noesis-state>/g) || []).length;
    expect(openTags).toBe(1);
    expect(closeTags).toBe(1);
    // Point element should be self-closing or properly closed
    expect(result).toContain("</pointer>");
  });
});

// =============================================================================
// buildSurvivorContext — populatedState
// =============================================================================

describe("buildSurvivorContext with populatedState", () => {
  it("should include beliefs and learning when data is present", () => {
    const state = populatedState();
    const result = buildSurvivorContext(state);
    expect(result).toContain("<beliefs>");
    expect(result).toContain("</beliefs>");
    expect(result).toContain("<learning>");
    expect(result).toContain("</learning>");
  });

  it("should include the populated workflow goal", () => {
    const state = populatedState();
    const result = buildSurvivorContext(state);
    expect(result).toContain("Implement cognitive substrate");
  });

  it("should produce well-formed XML with all tags balanced", () => {
    const state = populatedState();
    const result = buildSurvivorContext(state);
    // Extract all XML tags (opening and closing)
    const openTags = result.match(/<[^/][^>]*>/g) || [];
    const closeTags = result.match(/<\/[^>]+>/g) || [];
    // Every non-self-closing tag must have a matching close
    const selfClosing = openTags.filter((t) => t.endsWith("/>"));
    const nonSelfClosing = openTags.filter((t) => !t.endsWith("/>"));
    expect(nonSelfClosing.length).toBe(closeTags.length);
  });
});

// =============================================================================
// Budget enforcement
// =============================================================================

describe("buildSurvivorContext budget enforcement", () => {
  it("should stay under 500 tokens for EMPTY_STATE", () => {
    const result = buildSurvivorContext(EMPTY_STATE);
    const estimatedTokens = estimateTokens(result);
    expect(estimatedTokens).toBeLessThanOrEqual(500);
  });

  it("should stay under 500 tokens for populatedState", () => {
    const state = populatedState();
    const result = buildSurvivorContext(state);
    const estimatedTokens = estimateTokens(result);
    expect(estimatedTokens).toBeLessThanOrEqual(500);
  });

  it("should stay under 500 tokens even with very large state", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    state.attention.focus = "x".repeat(500);
    state.commitment.workflow.goal = "x".repeat(200);
    state.commitment.workflow.status = "active";
    for (let i = 0; i < 20; i++) {
      state.commitment.workflow.steps.push({
        id: `s-${i}`,
        status: "active",
        description: "x".repeat(200),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    for (let i = 0; i < 20; i++) {
      state.belief.facts.push({
        id: `bf-${i}`,
        content: "x".repeat(200),
        confidence: 0.95,
        source: "execution",
        status: "active",
        scope: "local" as const,
        revision: 0,
        epistemicStatus: "speculative" as const,
        reviewRequired: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    const result = buildSurvivorContext(state);
    const tokenCount = estimateTokens(result);
    expect(tokenCount).toBeLessThanOrEqual(500);
  });

  it("should keep the always-kept fallback (attention + workflow + pointer) under 500 tokens for maximal realistic inputs", () => {
    // The survivor builder's last-resort fallback strips beliefs and learning,
    // keeping only attention + workflow + pointer. This test asserts that
    // skeleton stays ≤500 tokens under maximum plausible field sizes.
    const state: NoesisState = structuredClone(EMPTY_STATE);
    // Maximise attention fields
    state.attention.focus = "Implement user authentication flow for the admin dashboard including JWT token refresh".repeat(5);
    state.attention.priority = "high";
    state.attention.files = [
      "src/server/auth.ts",
      "src/server/middleware.ts",
      "src/client/login.tsx",
      "src/client/dashboard.tsx",
      "src/shared/types.ts",
      "docs/ARCHITECTURE.md",
    ];
    // Maximise workflow (survivor caps at 3 steps)
    state.commitment.workflow.goal =
      "Deliver the authentication rewrite before the sprint end; coordinate with QA for regression suite".repeat(3);
    state.commitment.workflow.status = "active";
    for (let i = 0; i < 10; i++) {
      state.commitment.workflow.steps.push({
        id: `step-${i}`,
        status: i < 3 ? "active" : "pending",
        description: "Refactor the authentication middleware chain to support both session cookies and JWT tokens seamlessly".repeat(3),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    // Blow up beliefs and learning so builder is forced to the fallback
    for (let i = 0; i < 100; i++) {
      state.belief.facts.push({
        id: `bf-${i}`,
        content: "The authentication system MUST validate tokens on every protected route. ".repeat(20),
        confidence: 0.95,
        source: "execution",
        status: "active",
        scope: "local" as const,
        revision: 0,
        epistemicStatus: "speculative" as const,
        reviewRequired: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    for (let i = 0; i < 100; i++) {
      state.learning.successes.push({
        id: `le-${i}`,
        description: "Learned that JWT refresh tokens must be rotated every 15 minutes for security compliance. ".repeat(5),
        status: "resolved",
        capturedAt: new Date().toISOString(),
      });
    }
    for (let i = 0; i < 100; i++) {
      state.learning.failures.push({
        id: `lf-${i}`,
        description: "Failed: Token validation bypassed for WebSocket connections leading to auth hole. ".repeat(5),
        status: "resolved",
        capturedAt: new Date().toISOString(),
      });
    }

    const result = buildSurvivorContext(state);
    const tokenCount = estimateTokens(result);
    expect(tokenCount).toBeLessThanOrEqual(500);
  });
});

// =============================================================================
// XML structure integrity
// =============================================================================

describe("buildSurvivorContext XML structure", () => {
  it("should have the correct top-level wrapper tag", () => {
    const result = buildSurvivorContext(EMPTY_STATE);
    expect(result).toStartWith("<noesis-state>");
    expect(result).toEndWith("</noesis-state>");
  });

  it("should include the pointer line", () => {
    const result = buildSurvivorContext(EMPTY_STATE);
    expect(result).toContain(".omp/noesis/state.json");
  });

  it("should escape XML special characters in focus", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    state.attention.focus = 'focus with <special> & "quotes"';
    const result = buildSurvivorContext(state);
    expect(result).not.toContain("<special>");
    expect(result).toContain("&lt;special&gt;");
    expect(result).toContain("&amp;");
    expect(result).toContain("&quot;");
  });
});

// =============================================================================
// buildSurvivorContext — budget eviction paths
// =============================================================================

describe("buildSurvivorContext learning eviction", () => {
  it("should evict learning section when payload exceeds 500 tokens", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    state.commitment.workflow.goal = "test";
    state.commitment.workflow.status = "active";
    // Add 3 learning entries with wordy descriptions to exceed budget
    for (let i = 0; i < 3; i++) {
      state.learning.successes.push({
        id: `le-${i}`,
        description: "wordy learning entry description that consumes token budget ".repeat(40),
        status: "resolved",
        capturedAt: "2026-01-01T00:00:00.000Z",
      });
    }

    const result = buildSurvivorContext(state);

    // Result must be within budget
    expect(estimateTokens(result)).toBeLessThanOrEqual(500);
    // Learning section should have been evicted
    expect(result).not.toContain("<learning>");
    // Core sections (attention, workflow, pointer) survive
    expect(result).toContain("<attention>");
    expect(result).toContain("<workflow>");
    expect(result).toContain("<pointer>");
  });

  it("should keep learning section when payload is within budget", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    state.commitment.workflow.goal = "test";
    state.commitment.workflow.status = "active";
    state.learning.successes.push({
      id: "le-1",
      description: "small learning entry",
      status: "resolved",
      capturedAt: "2026-01-01T00:00:00.000Z",
    });

    const result = buildSurvivorContext(state);

    expect(estimateTokens(result)).toBeLessThanOrEqual(500);
    // Learning should be present since budget allows it
    expect(result).toContain("<learning>");
  });
});

describe("buildSurvivorContext beliefs eviction", () => {
  it("should evict both learning and beliefs when both exceed budget", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    state.commitment.workflow.goal = "task";
    state.commitment.workflow.status = "active";
    // Add 5 large beliefs (max shown) to push budget well over on their own
    for (let i = 0; i < 5; i++) {
      state.belief.facts.push({
        id: `bf-${i}`,
        content: "wordy belief content that consumes many tokens indeed ".repeat(30),
        confidence: 0.95,
        source: "execution",
        status: "active",
        scope: "local" as const,
        revision: 0,
        epistemicStatus: "speculative" as const,
        reviewRequired: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
    }
    // Add 3 large learning entries
    for (let i = 0; i < 3; i++) {
      state.learning.successes.push({
        id: `le-${i}`,
        description: "wordy learning entry description that consumes token budget ".repeat(30),
        status: "resolved",
        capturedAt: "2026-01-01T00:00:00.000Z",
      });
    }

    const result = buildSurvivorContext(state);

    // Must be within budget
    expect(estimateTokens(result)).toBeLessThanOrEqual(500);
    // Learning and beliefs were evicted
    expect(result).not.toContain("<learning>");
    expect(result).not.toContain("<beliefs>");
    // Attention + workflow + pointer survive
    expect(result).toContain("<attention>");
    expect(result).toContain("<workflow>");
    expect(result).toContain("<pointer>");
  });

  it("should keep beliefs but evict learning when beliefs alone keep under budget", () => {
    const state: NoesisState = structuredClone(EMPTY_STATE);
    state.commitment.workflow.goal = "task";
    state.commitment.workflow.status = "active";
    // Modest beliefs (stay under 500 minus base)
    for (let i = 0; i < 3; i++) {
      state.belief.facts.push({
        id: `bf-${i}`,
        content: "modest belief content ".repeat(5),
        confidence: 0.95,
        source: "execution",
        status: "active",
        scope: "local" as const,
        revision: 0,
        epistemicStatus: "speculative" as const,
        reviewRequired: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
    }
    // Large learning entries to trigger eviction
    for (let i = 0; i < 3; i++) {
      state.learning.successes.push({
        id: `le-${i}`,
        description: "wordy learning entry description that consumes token budget ".repeat(40),
        status: "resolved",
        capturedAt: "2026-01-01T00:00:00.000Z",
      });
    }

    const result = buildSurvivorContext(state);

    expect(estimateTokens(result)).toBeLessThanOrEqual(500);
    // Learning should be evicted
    expect(result).not.toContain("<learning>");
    // Beliefs should survive (under budget when learning removed)
    expect(result).toContain("<beliefs>");
  });
});
