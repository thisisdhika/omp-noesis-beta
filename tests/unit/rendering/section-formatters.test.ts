"use strict";

/**
 * omp-noesis: Section Formatters Unit Tests
 *
 * Tests for each format function under empty, non-empty, boundary,
 * and error conditions.
 */

import { describe, it, expect } from "bun:test";
import {
  formatCapability,
  formatFocus,
  formatWorkflow,
  formatDecisions,
  formatBeliefs,
  formatHypotheses,
  formatLearning,
  formatGraphEvidence,
} from "../../../src/rendering/section-formatters.js";
import { CAPS } from "../../../src/schema.js";
import type {
  BeliefDecision,
  BeliefFact,
  GraphFinding,
  Hypothesis,
  LearningEntry,
  WorkflowStep,
} from "../../../src/schema.js";

// =============================================================================
// formatCapability
// =============================================================================

describe("formatCapability", () => {
  it("should format FULL with version string", () => {
    const result = formatCapability("FULL", "1.2.3");
    expect(result).toBe(
      "Capability: FULL — Graph available and current (v1.2.3)",
    );
  });

  it("should format FULL without version", () => {
    const result = formatCapability("FULL");
    expect(result).toBe(
      "Capability: FULL — Graph available and current",
    );
  });

  it("should format STALE with stale hours", () => {
    const result = formatCapability("STALE", undefined, 4);
    expect(result).toBe(
      "Capability: STALE — Graph data is stale (4h old)",
    );
  });

  it("should format STALE without stale hours", () => {
    const result = formatCapability("STALE");
    expect(result).toBe(
      "Capability: STALE — Graph data is stale",
    );
  });

  it("should format NO_GRAPH", () => {
    const result = formatCapability("NO_GRAPH");
    expect(result).toBe(
      "Capability: NO_GRAPH — No graphify integration available",
    );
  });

  it("should format DEGRADED", () => {
    const result = formatCapability("DEGRADED");
    expect(result).toBe(
      "Capability: DEGRADED — Context hook not yet fired",
    );
  });
});

// =============================================================================
// formatFocus
// =============================================================================

describe("formatFocus", () => {
  it("should format a short focus string", () => {
    expect(formatFocus("Fix authentication bug")).toBe(
      "Focus: Fix authentication bug",
    );
  });

  it("should truncate a long focus string to CAPS.focusLength", () => {
    const long = "x".repeat(CAPS.focusLength * 2);
    const result = formatFocus(long);
    expect(result).toStartWith("Focus: ");
    const body = result.slice("Focus: ".length);
    expect(body.length).toBeLessThanOrEqual(CAPS.focusLength);
    // Should end with the truncation marker
    expect(body).toMatch(/…$/);
  });

  it("should not truncate when exactly at limit", () => {
    const exact = "x".repeat(CAPS.focusLength);
    const result = formatFocus(exact);
    expect(result).toBe(`Focus: ${exact}`);
  });
});

// =============================================================================
// formatWorkflow
// =============================================================================

describe("formatWorkflow", () => {
  it("should return empty string when goal is empty", () => {
    expect(formatWorkflow("", [], "draft")).toBe("");
  });

  it("should return header-only when goal is set but steps are empty", () => {
    expect(formatWorkflow("Complete task", [], "active")).toBe(
      "Workflow: Complete task",
    );
  });

  it("should include steps when provided", () => {
    const steps: WorkflowStep[] = [
      { status: "active", description: "Research", id: "s1", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { status: "pending", description: "Implement", id: "s2", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ];
    const result = formatWorkflow("Build feature", steps, "active");
    const lines = result.split("\n");
    expect(lines[0]).toBe("Workflow: Build feature");
    expect(lines).toContain("  [active] Research");
    expect(lines).toContain("  [pending] Implement");
  });
});

// =============================================================================
// formatDecisions
// =============================================================================

describe("formatDecisions", () => {
  it("should return empty string for empty array", () => {
    expect(formatDecisions([], 5)).toBe("");
  });

  it("should format decisions up to max", () => {
    const decisions: BeliefDecision[] = [
      {
        id: "bd-1",
        content: "Use Postgres",
        rationale: "",
        source: "user",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "bd-2",
        content: "Use Redis cache",
        rationale: "",
        source: "user",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    const result = formatDecisions(decisions, 5);
    expect(result).toBe("Decisions:\n  - Use Postgres\n  - Use Redis cache");
  });

  it("should cap decisions at max", () => {
    const decisions: BeliefDecision[] = Array.from({ length: 10 }, (_, i) => ({
      id: `bd-${i}`,
      content: `Decision ${i}`,
      rationale: "",
      source: "user",
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    const result = formatDecisions(decisions, 3);
    const lines = result.split("\n");
    expect(lines.length).toBe(4); // header + 3 decisions
    expect(lines[3]).toBe("  - Decision 2");
  });
});

// =============================================================================
// formatBeliefs
// =============================================================================

describe("formatBeliefs", () => {
  it("should return empty string for empty array", () => {
    expect(formatBeliefs([], 5, 0.75)).toBe("");
  });

  it("should filter by minimum confidence", () => {
    const facts: BeliefFact[] = [
      {
        id: "bf-1",
        content: "Low confidence",
        confidence: 0.5,
        source: "execution",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "bf-2",
        content: "High confidence",
        confidence: 0.9,
        source: "execution",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    // Only the 0.9 fact should appear
    const result = formatBeliefs(facts, 10, 0.75);
    expect(result).toContain("High confidence");
    expect(result).not.toContain("Low confidence");
  });

  it("should format beliefs with confidence values", () => {
    const facts: BeliefFact[] = [
      {
        id: "bf-1",
        content: "User prefers dark mode",
        confidence: 0.85,
        source: "graph",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    const result = formatBeliefs(facts, 5, 0.75);
    expect(result).toContain("Beliefs (\u22650.75):");
    expect(result).toContain("[0.85]");
    expect(result).toContain("User prefers dark mode");
  });
});

// =============================================================================
// formatHypotheses
// =============================================================================

describe("formatHypotheses", () => {
  it("should return empty string for empty array", () => {
    expect(formatHypotheses([], 3)).toBe("");
  });

  it("should format hypotheses with status", () => {
    const hypotheses: Hypothesis[] = [
      {
        id: "hy-1",
        content: "Hypothesis A",
        status: "testing",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        evidence: "",
      },
    ];
    const result = formatHypotheses(hypotheses, 5);
    expect(result).toBe("Hypotheses:\n  - [testing] Hypothesis A");
  });
});

// =============================================================================
// formatLearning
// =============================================================================

describe("formatLearning", () => {
  it("should return empty string for empty array", () => {
    expect(formatLearning([], 3)).toBe("");
  });

  it("should format learning entries", () => {
    const entries: LearningEntry[] = [
      {
        id: "le-1",
        description: "Learned X",
        status: "resolved",
        capturedAt: new Date().toISOString(),
      },
    ];
    const result = formatLearning(entries, 5);
    expect(result).toBe("Learning:\n  - Learned X");
  });
});

// =============================================================================
// formatGraphEvidence
// =============================================================================

describe("formatGraphEvidence", () => {
  it("should return empty string for empty findings", () => {
    expect(formatGraphEvidence([], 5)).toBe("");
  });

  it("should format findings with total count", () => {
    const findings: GraphFinding[] = [
      {
        query: "auth patterns",
        nodes: ["n1", "n2"],
        relations: [],
        confidence: "EXTRACTED",
        timestamp: new Date().toISOString(),
      },
    ];
    const result = formatGraphEvidence(findings, 5);
    expect(result).toBe(
      "Graph evidence (1):\n  - auth patterns: 2 nodes",
    );
  });

  it("should cap findings at max", () => {
    const findings: GraphFinding[] = Array.from({ length: 10 }, (_, i) => ({
      query: `query-${i}`,
      nodes: [`n${i}`],
      relations: [],
      confidence: "EXTRACTED" as const,
      timestamp: new Date().toISOString(),
    }));
    const result = formatGraphEvidence(findings, 3);
    const lines = result.split("\n");
    expect(lines[0]).toContain("Graph evidence (10):");
    // Only 3 findings shown
    expect(lines.length).toBe(4); // header + 3 findings
  });
});
