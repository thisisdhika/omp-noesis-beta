"use strict";

/**
 * omp-noesis: Sandbox Lifecycle Tests
 *
 * Behavioral tests for speculative sandbox lifecycle:
 * create, explore, merge, discard.
 */

import { describe, it, expect } from "bun:test";
import { cloneState } from "../helpers/fixtures.js";
import { now } from "../../src/shared/time.js";
import { createSandbox, exploreInSandbox, mergeSandbox, discardSandbox, getActiveSandboxes } from "../../src/domains/sandbox/sandbox-domain.js";
import type { NoesisState } from "../../src/shared/schema.js";
import type { BeliefFact } from "../../src/domains/belief/schema.js";

describe("speculative sandbox lifecycle", () => {
  describe("createSandbox", () => {
    it("creates a sandbox snapshotting current beliefs and hypotheses", () => {
      const state = cloneState();
      state.belief.facts.push({
        id: "bf-test-1",
        content: "Existing fact",
        confidence: 0.9,
        source: "execution",
        createdAt: now(),
        updatedAt: now(),
        status: "active",
        epistemicStatus: "certain",
        reviewRequired: false,
        scope: "local",
        revision: 0,
      });
      state.inference.hypotheses.push({
        id: "hy-test-1",
        content: "Active hypothesis",
        status: "testing",
        createdAt: now(),
        updatedAt: now(),
      });

      const sandbox = createSandbox(state, { name: "test-sb", description: "Testing sandbox creation" });

      expect(sandbox.name).toBe("test-sb");
      expect(sandbox.description).toBe("Testing sandbox creation");
      expect(sandbox.status).toBe("active");
      expect(sandbox.id).toMatch(/^sb-/);
      expect(sandbox.createdAt).toBeDefined();
      expect(sandbox.mergedAt).toBeUndefined();
      // Should have snapshotted the existing belief
      expect(sandbox.facts).toHaveLength(1);
      expect(sandbox.facts[0]!.content).toBe("Existing fact");
      expect(sandbox.hypotheses).toHaveLength(1);
      expect(sandbox.hypotheses[0]!.content).toBe("Active hypothesis");
      // Sandbox should be separate from the empty starting state
      expect(sandbox.decisions).toHaveLength(0);
    });

    it("creates a sandbox without description when omitted", () => {
      const state = cloneState();
      const sandbox = createSandbox(state, { name: "minimal" });
      expect(sandbox.name).toBe("minimal");
      expect(sandbox.description).toBeUndefined();
    });
  });

  describe("exploreInSandbox", () => {
    it("adds a speculative belief fact within the sandbox", () => {
      const sandbox = createSandbox(cloneState(), { name: "explore-test" });
      const initialCount = sandbox.facts.length;

      const fact = exploreInSandbox(sandbox, {
        content: "Speculative belief in sandbox",
        confidence: 0.6,
        source: "inference",
        tags: ["test"],
        evidence: "Exploratory reasoning",
      });

      expect(fact.id).toMatch(/^bf-/);
      expect(fact.content).toBe("Speculative belief in sandbox");
      expect(fact.confidence).toBe(0.6);
      expect(fact.source).toBe("inference");
      expect(fact.tags).toEqual(["test"]);
      expect(fact.evidence).toBe("Exploratory reasoning");
      expect(fact.status).toBe("active");
    });

    it("does not modify the sandbox itself (caller pushes the fact)", () => {
      const sandbox = createSandbox(cloneState(), { name: "non-mutating" });
      const initialCount = sandbox.facts.length;

      exploreInSandbox(sandbox, {
        content: "New fact",
        confidence: 0.5,
        source: "inference",
      });

      // Sandbox facts unchanged — caller responsibility to push
      expect(sandbox.facts).toHaveLength(initialCount);
    });
  });

  describe("mergeSandbox", () => {
    it("promotes sandbox facts and decisions to main state, marks merged", () => {
      const state = cloneState();
      const sandbox = createSandbox(state, { name: "merge-test" });

      // Add a fact within the sandbox
      const fact = exploreInSandbox(sandbox, {
        content: "Belief to promote",
        confidence: 0.85,
        source: "inference",
      });
      sandbox.facts.push(fact);

      expect(state.belief.facts).toHaveLength(0);

      const result = mergeSandbox(sandbox, state);

      expect(result.promotedFacts).toBe(1);
      expect(result.promotedDecisions).toBe(0);
      expect(state.belief.facts).toHaveLength(1);
      expect(state.belief.facts[0]!.content).toBe("Belief to promote");
      expect(sandbox.status).toBe("merged");
      expect(sandbox.mergedAt).toBeDefined();
      expect(sandbox.promotedFactIds).toContain(fact.id);
    });

    it("promotes decisions to main state", () => {
      const state = cloneState();
      const sandbox = createSandbox(state, { name: "merge-decisions" });

      sandbox.decisions.push({
        id: "bd-sandbox-1",
        content: "Sandbox decision",
        rationale: "Test rationale",
        source: "user",
        createdAt: now(),
        updatedAt: now(),
        status: "active",
        scope: "local",
        revision: 0,
      });

      const result = mergeSandbox(sandbox, state);

      expect(result.promotedFacts).toBe(0);
      expect(result.promotedDecisions).toBe(1);
      expect(state.belief.decisions).toHaveLength(1);
      expect(state.belief.decisions[0]!.content).toBe("Sandbox decision");
    });

    it("skips duplicate facts by content", () => {
      const state = cloneState();
      state.belief.facts.push({
        id: "bf-existing-1",
        content: "Existing belief",
        confidence: 0.8,
        source: "execution",
        createdAt: now(),
        updatedAt: now(),
        status: "active",
        epistemicStatus: "speculative",
        reviewRequired: false,
        scope: "local",
        revision: 0,
      });

      const sandbox = createSandbox(state, { name: "dedup" });
      const fact = exploreInSandbox(sandbox, {
        content: "Existing belief", // same content as existing
        confidence: 0.9,
        source: "inference",
      });
      sandbox.facts.push(fact);

      const result = mergeSandbox(sandbox, state);

      // Should have skipped the duplicate
      expect(result.promotedFacts).toBe(0);
      // Should still mark as merged
      expect(sandbox.status).toBe("merged");
    });

    it("skips non-active facts", () => {
      const state = cloneState();
      const sandbox = createSandbox(state, { name: "skip-superseded" });

      sandbox.facts.push({
        id: "bf-archived-1",
        content: "Archived fact",
        confidence: 0.7,
        source: "user",
        createdAt: now(),
        updatedAt: now(),
        status: "superseded",
        epistemicStatus: "speculative",
        reviewRequired: false,
        scope: "local",
        revision: 0,
      });

      const result = mergeSandbox(sandbox, state);

      expect(result.promotedFacts).toBe(0);
    });

    it("returns zero counts for an empty sandbox", () => {
      const state = cloneState();
      const sandbox = createSandbox(state, { name: "empty-sb" });

      const result = mergeSandbox(sandbox, state);

      expect(result.promotedFacts).toBe(0);
      expect(result.promotedDecisions).toBe(0);
      expect(sandbox.status).toBe("merged");
    });
  });

  describe("discardSandbox", () => {
    it("marks sandbox as discarded without promoting data", () => {
      const state = cloneState();
      const sandbox = createSandbox(state, { name: "discard-test" });

      sandbox.facts.push({
        id: "bf-discard-1",
        content: "Will be discarded",
        confidence: 0.8,
        source: "inference",
        createdAt: now(),
        updatedAt: now(),
        status: "active",
        epistemicStatus: "speculative",
        reviewRequired: false,
        scope: "local",
        revision: 0,
      });

      discardSandbox(sandbox);

      expect(sandbox.status).toBe("discarded");
      expect(sandbox.mergedAt).toBeUndefined();
      // Main state untouched
      expect(state.belief.facts).toHaveLength(0);
    });
  });

  describe("getActiveSandboxes", () => {
    it("returns only active sandboxes", () => {
      const state = cloneState();
      const sb1 = createSandbox(state, { name: "active-1" });
      state.sandbox.sandboxes.push(sb1);

      const sb2 = createSandbox(state, { name: "merged-sb" });
      state.sandbox.sandboxes.push(sb2);

      const sb3 = createSandbox(state, { name: "discarded-sb" });
      state.sandbox.sandboxes.push(sb3);

      // Simulate merge and discard
      mergeSandbox(sb2, state);
      discardSandbox(sb3);

      const active = getActiveSandboxes(state);
      expect(active).toHaveLength(1);
      expect(active[0]!.id).toBe(sb1.id);
    });

    it("returns empty array when no active sandboxes exist", () => {
      const state = cloneState();
      expect(getActiveSandboxes(state)).toEqual([]);
    });
  });
});
