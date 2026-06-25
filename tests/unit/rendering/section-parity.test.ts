"use strict";

/**
 * Section parity tests: verify that buildSectionList (used by both
 * preamble-builder and token-profile command) produces section names
 * that map to the correct token-accountant categories.
 */

import { describe, it, expect } from "bun:test";
import { buildSectionList } from "../../../src/rendering/preamble-builder.js";
import { categorizeSection, computeBudget } from "../../../src/rendering/token-accountant.js";
import { EMPTY_STATE } from "../../../src/shared/schema.js";
import { populatedState } from "../../helpers/fixtures.js";
import type { NoesisState, RenderContext } from "../../../src/shared/schema.js";

const baseRender: RenderContext = {
  capabilityLevel: "FULL",
  contextHookFired: false,
};

// =============================================================================
// buildSectionList with EMPTY_STATE
// =============================================================================

describe("buildSectionList with EMPTY_STATE", () => {
  it("returns only non-empty sections (capability + state pointer)", () => {
    const sections = buildSectionList(EMPTY_STATE, baseRender);
    expect(sections.length).toBeGreaterThanOrEqual(2);
    const names = sections.map((s) => s.name);
    expect(names).toContain("Capability Block");
    expect(names).toContain("State Pointer");
    // Variable sections should be absent when empty
    expect(names).not.toContain("Focus");
    expect(names).not.toContain("Active Decisions");
    expect(names).not.toContain("Active Beliefs");
    expect(names).not.toContain("Workflow");
    expect(names).not.toContain("Unresolved Hypotheses");
    expect(names).not.toContain("Top-Ranked Learning");
    expect(names).not.toContain("Graph Evidence");
    expect(names).not.toContain("Low Confidence Signal");
    expect(names).not.toContain("Contested Warnings");
  });

  it("all returned section names map to known token-accountant categories", () => {
    const sections = buildSectionList(EMPTY_STATE, baseRender);
    for (const s of sections) {
      const category = categorizeSection(s.name);
      // Every section should map to a valid category (not "reserve" for known names)
      expect(category).not.toBeUndefined();
    }
  });
});

// =============================================================================
// buildSectionList with populated state
// =============================================================================

describe("buildSectionList with populatedState", () => {
  it("includes all populated variable sections", () => {
    const sections = buildSectionList(populatedState(), baseRender);
    const names = sections.map((s) => s.name);
    expect(names).toContain("Active Decisions");
    expect(names).toContain("Active Beliefs");
    expect(names).toContain("Workflow");
    expect(names).toContain("Unresolved Hypotheses");
    expect(names).toContain("Top-Ranked Learning");
    expect(names).not.toContain("Focus"); // populatedState fixture has no focus
  });

  it("each section has non-empty content", () => {
    const sections = buildSectionList(populatedState(), baseRender);
    for (const s of sections) {
      expect(s.content.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// Category parity — every known section name maps correctly
// =============================================================================

describe("section name to category mapping parity", () => {
  const EXPECTED_CATEGORIES: Record<string, "core" | "session" | "working" | "reserve"> = {
    "Capability Block": "core",
    "Contested Warnings": "core",
    Focus: "working",
    "Active Decisions": "core",
    "Active Beliefs": "core",
    Workflow: "working",
    "Unresolved Hypotheses": "session",
    "Top-Ranked Learning": "working",
    "Graph Evidence": "core",
    "Low Confidence Signal": "session",
    "State Pointer": "core",
  };

  it("all known section names map to the correct category", () => {
    for (const [name, expectedCategory] of Object.entries(EXPECTED_CATEGORIES)) {
      expect(categorizeSection(name)).toBe(expectedCategory);
    }
  });
});

// =============================================================================
// Parity: token-profile sections == preamble builder sections
// =============================================================================

describe("token-profile section parity", () => {
  it("section names match token-accountant's CATEGORY_MAP patterns", () => {
    // CATEGORY_MAP keys are lowercased; section names should match after lowercasing
    const sections = buildSectionList(populatedState(), baseRender);
    for (const s of sections) {
      const cat = categorizeSection(s.name);
      expect(cat).not.toBe("reserve");
    }
  });

  it("empty and populated states both produce valid budgets", () => {
    const emptyBudget = computeBudget("", buildSectionList(EMPTY_STATE, baseRender));
    const popBudget = computeBudget("", buildSectionList(populatedState(), baseRender));

    // Empty state has only capability + state pointer sections
    expect(emptyBudget.length).toBeGreaterThanOrEqual(2);
    // Populated state has more sections
    expect(popBudget.length).toBeGreaterThan(emptyBudget.length);

    // All budget entries have valid categories
    for (const b of popBudget) {
      expect(["core", "session", "working", "reserve"]).toContain(b.category);
    }
  });
});
