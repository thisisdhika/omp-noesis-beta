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
import { EMPTY_STATE } from "../../../src/schema.js";
import { populatedState } from "../../helpers/fixtures.js";
import type { NoesisState } from "../../../src/schema.js";
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
    const estimatedTokens = Math.ceil(result.length / 4);
    expect(estimatedTokens).toBeLessThanOrEqual(500);
  });

  it("should stay under 500 tokens for populatedState", () => {
    const state = populatedState();
    const result = buildSurvivorContext(state);
    const estimatedTokens = Math.ceil(result.length / 4);
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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
