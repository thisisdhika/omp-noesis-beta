"use strict";

/**
 * omp-noesis: Token Accountant Unit Tests
 *
 * Tests BUDGET constants, categorizeSection, and computeBudget.
 */

import { describe, it, expect } from "bun:test";
import {
  BUDGET,
  categorizeSection,
  computeBudget,
} from "../../../src/rendering/token-accountant.js";

// =============================================================================
// BUDGET
// =============================================================================

describe("BUDGET", () => {
  it("should have a total of exactly 2000", () => {
    const total = BUDGET.core + BUDGET.session + BUDGET.working + BUDGET.reserve;
    expect(total).toBe(2000);
  });

  it("should have non-zero allocations", () => {
    expect(BUDGET.core).toBeGreaterThan(0);
    expect(BUDGET.session).toBeGreaterThan(0);
    expect(BUDGET.working).toBeGreaterThan(0);
    expect(BUDGET.reserve).toBeGreaterThan(0);
  });
});

// =============================================================================
// categorizeSection
// =============================================================================

describe("categorizeSection", () => {
  it("should classify core sections", () => {
    expect(categorizeSection("Capability Block")).toBe("core");
    expect(categorizeSection("contested warnings")).toBe("core");
    expect(categorizeSection("ACTIVE DECISIONS")).toBe("core");
    expect(categorizeSection("Active Beliefs")).toBe("core");
    expect(categorizeSection("Graph Evidence")).toBe("core");
    expect(categorizeSection("State Pointer")).toBe("core");
  });

  it("should classify session sections", () => {
    expect(categorizeSection("Unresolved Hypotheses")).toBe("session");
    expect(categorizeSection("Low Confidence Signal")).toBe("session");
  });

  it("should classify working sections", () => {
    expect(categorizeSection("Focus")).toBe("working");
    expect(categorizeSection("Workflow")).toBe("working");
    expect(categorizeSection("Top-Ranked Learning")).toBe("working");
  });

  it("should fall back to reserve for unknown sections", () => {
    expect(categorizeSection("Unknown Section")).toBe("reserve");
    expect(categorizeSection("")).toBe("reserve");
    expect(categorizeSection("Custom Widget")).toBe("reserve");
  });
});

// =============================================================================
// computeBudget
// =============================================================================

describe("computeBudget", () => {
  it("should return empty array for no sections", () => {
    const result = computeBudget("", []);
    expect(result).toEqual([]);
  });

  it("should return empty array for empty sections", () => {
    const result = computeBudget("preamble", []);
    expect(result).toEqual([]);
  });

  it("should compute budget for a single section", () => {
    const result = computeBudget("", [{ name: "Active Beliefs", content: "fact one" }]);

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Active Beliefs");
    expect(result[0]!.category).toBe("core");
    expect(result[0]!.used).toBeGreaterThan(0);
    expect(result[0]!.allocated).toBeGreaterThan(0);
  });

  it("should compute budgets for multiple sections in same category", () => {
    const result = computeBudget("", [
      { name: "Active Beliefs", content: "fact a" },
      { name: "Active Decisions", content: "decision b" },
    ]);

    expect(result).toHaveLength(2);
    for (const b of result) {
      expect(b.category).toBe("core");
      expect(b.used).toBeGreaterThan(0);
      expect(b.allocated).toBeGreaterThan(0);
    }
  });

  it("should handle sections exceeding their budget", () => {
    // Generate a large content string to exceed the core budget (600)
    const largeContent = "word ".repeat(3000);
    const result = computeBudget("", [
      { name: "Active Beliefs", content: largeContent },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]!.used).toBeGreaterThan(600);
    // allocated should still reflect the proportion of the category budget
    expect(result[0]!.allocated).toBeGreaterThan(0);
  });

  it("should handle multiple categories", () => {
    const result = computeBudget("", [
      { name: "Active Beliefs", content: "fact" },
      { name: "Unresolved Hypotheses", content: "hypothesis" },
      { name: "Focus", content: "focus item" },
    ]);

    expect(result).toHaveLength(3);
    const categories = result.map((b) => b.category);
    expect(categories.filter((c) => c === "core").length).toBe(1);
    expect(categories.filter((c) => c === "session").length).toBe(1);
    expect(categories.filter((c) => c === "working").length).toBe(1);
  });

  it("should handle empty content gracefully", () => {
    const result = computeBudget("", [
      { name: "Focus", content: "" },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]!.used).toBe(0);
    expect(result[0]!.allocated).toBe(0);
  });
});
