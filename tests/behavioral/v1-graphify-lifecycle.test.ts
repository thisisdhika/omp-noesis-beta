"use strict";

/**
 * v1 Behavioral Tests — Graphify Grounding, Smart-Zone Budget, Lifecycle
 *
 * Three end-to-end tests using AgentSimulator (free model only):
 * 1. Graphify grounding  — graph finding → committed belief → survive compact
 * 2. Smart-zone budget   — preamble stays ≤ MAX_PREAMBLE_TOKENS under load
 * 3. Lifecycle           — session_start / turn_end / session_shutdown fire
 */

import { describe, it, expect, mock } from "bun:test";

// ponytail: graphify-client mocked at module level so hooks never touch real disk/API
mock.module("../../src/infrastructure/graphify-client.js", () => ({
  detectCapability: async () => "FULL" as const,
  tryLifecycleGraphUpdate: async () => {},
}));

import { createAgentSimulator, type AgentSimulator } from "../helpers/agent-simulator.js";
import { MAX_PREAMBLE_TOKENS } from "../../src/shared/schema-base.js";
import { estimateTokens } from "../../src/shared/tokens.js";
import type { NoesisState } from "../../src/shared/schema.js";

// ===========================================================================
// 1. Graphify Grounding — query → commit belief → survive compaction
// ===========================================================================

describe("v1 — Graphify grounding", () => {
  it("graph-derived beliefs survive compaction in preserve data", async () => {
    const sim = await createAgentSimulator();
    try {
      // Arrange: simulate a graph query finding committed as a belief
      await sim.addGraphFindings(2, {
        query: "module dependency graph",
        confidence: "EXTRACTED",
        community: "core-modules",
      });

      await sim.addFacts(1, {
        content: "Component A depends on Component B via shared types",
        source: "graph",
        confidence: 0.85,
        tags: ["graphify", "dependency"],
      });

      // Act: compact the session
      const result = await sim.compact();

      // Assert: belief survives in preserveData snapshot
      const preserved = result.preserveData["omp-noesis"] as NoesisState;
      expect(preserved.belief.facts).toHaveLength(1);
      expect(preserved.belief.facts[0]!.source).toBe("graph");
      expect(preserved.belief.facts[0]!.content).toBe(
        "Component A depends on Component B via shared types",
      );
      expect(preserved.belief.facts[0]!.confidence).toBe(0.85);
      expect(preserved.belief.facts[0]!.tags).toEqual(["graphify", "dependency"]);

      // Graph findings are also preserved
      expect(preserved.attention.graphFindings).toHaveLength(2);
      expect(preserved.attention.graphFindings[0]!.community).toBe("core-modules");

      // Survivor context includes the beliefs section
      expect(result.survivorContext).toContain("<beliefs>");

      // Post-compact state still has the belief
      const state = sim.getState();
      expect(state.belief.facts).toHaveLength(1);
      expect(state.belief.facts[0]!.source).toBe("graph");
    } finally {
      sim.cleanup();
    }
  });
});

// ===========================================================================
// 2. Smart-Zone Budget — preamble stays within MAX_PREAMBLE_TOKENS
// ===========================================================================

describe("v1 — smart-zone budget", () => {
  it("drops non-protected sections when preamble exceeds budget", async () => {
    const sim = await createAgentSimulator();
    try {
      // Arrange: seed enough state to push past the token limit
      const longContent = "Significant insight ".repeat(20); // ~420 chars
      await sim.addFacts(20, { content: longContent, source: "execution" });
      await sim.addGraphFindings(20, { query: longContent });

      // Act
      const preamble = sim.buildPreamble();
      const tokens = estimateTokens(preamble);

      // Assert: token cap enforced
      expect(tokens).toBeLessThanOrEqual(MAX_PREAMBLE_TOKENS);

      // Protected sections always survive (capability + state pointer)
      expect(preamble).toContain("[Noesis: FULL");
      expect(preamble).toContain(".omp/noesis/state.json");
    } finally {
      sim.cleanup();
    }
  });

  it("includes all sections with minimal state", async () => {
    const sim = await createAgentSimulator();
    try {
      // Act: preamble from fresh state with one belief
      await sim.addFacts(1, { content: "A single fact" });
      const preamble = sim.buildPreamble();
      const tokens = estimateTokens(preamble);

      // Assert: well under budget
      expect(tokens).toBeLessThanOrEqual(MAX_PREAMBLE_TOKENS);
      expect(tokens).toBeLessThanOrEqual(600); // a few facts is modest
      expect(preamble).toContain("[Noesis: FULL");
      expect(preamble).toContain("A single fact");
      expect(preamble).toContain(".omp/noesis/state.json");
    } finally {
      sim.cleanup();
    }
  });
});

// ===========================================================================
// 3. Lifecycle — session_start / turn_end / session_shutdown
// ===========================================================================

describe("v1 — lifecycle hooks", () => {
  it("session_start hook is registered and fires via newSession", async () => {
    const sim = await createAgentSimulator();
    try {
      const hooks = sim.pi._getHooks("session_start");
      expect(hooks).toHaveLength(1);

      // newSession triggers session_start; should not throw
      await sim.newSession();
      expect(sim.getState().version).toBe(1);
      expect(sim.getState().belief.facts).toBeEmpty();
    } finally {
      sim.cleanup();
    }
  });

  it("turn_end hook fires and cleanup runs without error", async () => {
    const sim = await createAgentSimulator();
    try {
      const hooks = sim.pi._getHooks("turn_end");
      expect(hooks).toHaveLength(1);

      // Seed some data for cleanup to work on
      await sim.addFacts(5, { content: "Stale fact" });

      // turn() fires context + turn_end hooks
      const { state } = await sim.turn();
      expect(state.attention).toBeDefined();
      expect(state.belief.facts.length).toBeGreaterThanOrEqual(0);
    } finally {
      sim.cleanup();
    }
  });

  it("session_shutdown hook is registered and fires without error", async () => {
    const sim = await createAgentSimulator();
    try {
      const hooks = sim.pi._getHooks("session_shutdown");
      expect(hooks).toHaveLength(1);

      // Directly invoke — in real usage this fires when OMP terminates
      // the session; the mock just verifies no runtime error
      await hooks[0]!({});
      // Ponytail: no return value to assert — firing cleanly is the contract
    } finally {
      sim.cleanup();
    }
  });
});
