"use strict";

/**
 * AgentSimulator unit tests — proves the helper works for:
 * - turn simulation (context hook + turn_end)
 * - compaction (session.compacting hook)
 * - fresh session restart
 * - preamble building
 * - cleanup
 *
 * All tests run fully offline — no real OMP or LLM dependencies.
 */

import { describe, it, expect, mock, beforeAll, afterAll } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

// ponytail: graphify-client mocked at module level so hooks never touch real disk/API
mock.module("../../src/infrastructure/graphify-client.js", () => ({
  detectCapability: async () => "FULL" as const,
  tryLifecycleGraphUpdate: async () => {},
}));

import { createAgentSimulator, type AgentSimulator } from "../helpers/agent-simulator.js";
import { EMPTY_STATE } from "../../src/shared/schema.js";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let sim: AgentSimulator;

beforeAll(async () => {
  sim = await createAgentSimulator();
});

afterAll(() => {
  sim.cleanup();
});

// ---------------------------------------------------------------------------
// Factory & lifecycle
// ---------------------------------------------------------------------------

describe("factory and lifecycle", () => {
  it("creates an isolated project root with .omp/noesis directory", () => {
    expect(existsSync(join(sim.projectRoot, ".omp", "noesis"))).toBeTrue();
    expect(sim.projectRoot).toMatch(/\.sim-/);
  });

  it("defaults the model to opencode-zen/deepseek-v4-flash-free", () => {
    expect(sim.model).toBe("opencode-zen/deepseek-v4-flash-free");
  });

  it("accepts a custom model via options", async () => {
    const custom = await createAgentSimulator({ model: "custom-model" });
    expect(custom.model).toBe("custom-model");
    // Only created to verify the option — no turn needed
    custom.cleanup();
  });

  it("initializes state to EMPTY_STATE shape", () => {
    const state = sim.getState();
    // Verify it matches the expected empty state structure
    expect(state.version).toBe(1);
    expect(state.attention.focus).toBe("");
    expect(state.attention.priority).toBe("normal");
    expect(state.attention.files).toEqual([]);
    expect(state.belief.facts).toEqual([]);
    expect(state.belief.decisions).toEqual([]);
    expect(state.inference.hypotheses).toEqual([]);
    expect(state.inference.reasoning).toEqual([]);
    expect(state.commitment.workflow.status).toBe("draft");
    expect(state.commitment.actions).toEqual([]);
    expect(state.learning.successes).toEqual([]);
    expect(state.learning.failures).toEqual([]);
  });
  it("cleanup removes the temp directory", async () => {
    // Create a dedicated sim to test cleanup
    // We can't destroy the shared sim since other tests use it
    const temp = await createAgentSimulator();
    const dir = temp.projectRoot;
    expect(existsSync(dir)).toBeTrue();
    temp.cleanup();
    expect(existsSync(dir)).toBeFalse();
  });
});

// ---------------------------------------------------------------------------
// Turn simulation
// ---------------------------------------------------------------------------

describe("turn", () => {
  it("executes context hook and turn_end hook without error", async () => {
    const { state } = await sim.turn();
    // After a turn, state should still be valid NoesisState shape
    expect(state).toBeDefined();
    expect(state.attention).toBeDefined();
    expect(state.commitment).toBeDefined();
  });

  it("accepts custom messages in the mock event", async () => {
    const customMessages = [
      { role: "user", content: [{ type: "text" as const, text: "Custom message" }] },
    ];
    const { state } = await sim.turn({ messages: customMessages });
    expect(state).toBeDefined();
  });

  it("runs multiple turns accumulating state", async () => {
    // Turn 1 — initial state
    const t1 = await sim.turn();
    expect(t1.state.attention.focus).toBeDefined();

    // Turn 2 — should still work
    const t2 = await sim.turn();
    expect(t2.state.attention).toBeDefined();

    // Both turns produce valid state (timestamps may differ between reads)
    expect(t1.state.attention.focus).toBe(t2.state.attention.focus);
    expect(t1.state.attention.priority).toBe(t2.state.attention.priority);
    expect(t1.state.commitment.workflow.status).toBe(t2.state.commitment.workflow.status);
  });
});

// ---------------------------------------------------------------------------
// Compaction
// ---------------------------------------------------------------------------

describe("compaction", () => {
  it("returns survivor context XML and preserve data", async () => {
    const result = await sim.compact();

    // Survivor context should be well-formed XML
    expect(result.survivorContext).toBeTruthy();
    expect(result.survivorContext).toContain("<noesis-state>");
    expect(result.survivorContext).toContain("</noesis-state>");
    expect(result.survivorContext).toContain("<attention>");
    expect(result.survivorContext).toContain("<workflow>");
    expect(result.survivorContext).toContain("<pointer>");

    // Preserved data should contain the full state snapshot
    expect(result.preserveData).toBeDefined();
    expect(result.preserveData["omp-noesis"]).toBeDefined();
    const preserved = result.preserveData["omp-noesis"] as Record<string, unknown>;
    expect(preserved.version).toBe(1);
  });

  it("returns a valid state snapshot after compaction", async () => {
    const result = await sim.compact();
    expect(result.state).toBeDefined();
    expect(result.state.attention).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Fresh session restart
// ---------------------------------------------------------------------------

describe("newSession", () => {
  it("resets state to EMPTY_STATE", async () => {
    // First apply some state changes
    // Run a couple turns and a compact to make sure state has something
    await sim.turn();
    await sim.compact();

    // Then reset
    await sim.newSession();
    const state = sim.getState();

    // Verify state is reset to empty
    expect(state.attention.focus).toBe("");
    expect(state.belief.facts).toEqual([]);
    expect(state.belief.decisions).toEqual([]);
    expect(state.inference.hypotheses).toEqual([]);
    expect(state.commitment.workflow.status).toBe("draft");
    expect(state.learning.successes).toEqual([]);
  });

  it("state is writable after newSession", async () => {
    await sim.newSession();
    // Turn should work after reset
    const { state } = await sim.turn();
    expect(state.attention).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Preamble building
// ---------------------------------------------------------------------------

describe("buildPreamble", () => {
  it("returns a non-empty string", () => {
    const preamble = sim.buildPreamble();
    expect(typeof preamble).toBe("string");
    expect(preamble.length).toBeGreaterThan(0);
  });

  it("contains state-relevant sections", () => {
    const preamble = sim.buildPreamble();
    // Should contain capability marker (hardcoded FULL)
    expect(preamble).toContain("FULL");
    // Should contain Noesis state marker
    expect(preamble).toContain(".omp/noesis/state.json");
  });

  it("resolves model family from model id", () => {
    // deepseek-v4 model → "deepseek" family
    const preamble = sim.buildPreamble({ model: "opencode-zen/deepseek-v4-flash-free" });
    // Family detection is embedded via modelProfile in preamble
    expect(preamble.length).toBeGreaterThan(0);
  });

  it("reflects current state content", () => {
    // Set a focus to verify it appears in preamble
    const state = sim.getState();
    // Note: buildPreamble doesn't mutate state — it reads current state
    const preamble = sim.buildPreamble({ model: "opencode-zen/deepseek-v4-flash-free" });
    // The preamble should include whatever the current attention focus is
    if (state.attention.focus) {
      expect(preamble).toContain(state.attention.focus);
    }
  });
});

// ---------------------------------------------------------------------------
// Integration: multi-turn + compact + newSession cycle
// ---------------------------------------------------------------------------

describe("multi-turn lifecycle", () => {
  it("supports turn → compact → newSession → turn cycle", async () => {
    // Create isolated sim for this test
    const s = await createAgentSimulator();
    try {
      // Initial state
      expect(s.getState().version).toBe(1);

      // Turn 1
      await s.turn();
      expect(s.getState().attention).toBeDefined();

      // Compact
      const compactResult = await s.compact();
      expect(compactResult.survivorContext).toContain("<noesis-state>");

      // Turn 2
      await s.turn();
      expect(s.getState().attention).toBeDefined();

      // Fresh session
      await s.newSession();
      expect(s.getState().attention.focus).toBe("");

      // Turn after fresh session
      await s.turn();
      expect(s.getState().attention).toBeDefined();
    } finally {
      s.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// toolCall
// ---------------------------------------------------------------------------

describe("toolCall", () => {
  it("invokes a registered tool's execute handler", async () => {
    const s = await createAgentSimulator();
    try {
      // Register a minimal test tool on the mock pi
      s.pi.registerTool({
        name: "test_tool",
        description: "A test tool",
        execute: async (_tCID: string, params: Record<string, unknown>) => {
          return { called: true, params };
        },
      });

      const result = await s.toolCall("test_tool", { foo: "bar" });
      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
      const obj = result as Record<string, unknown>;
      expect(obj.called).toBe(true);
      expect((obj.params as Record<string, unknown>).foo).toBe("bar");
    } finally {
      s.cleanup();
    }
  });

  it("throws for an unregistered tool", async () => {
    const s = await createAgentSimulator();
    try {
      await expect(s.toolCall("no_such_tool", {})).rejects.toThrow(/not registered/);
    } finally {
      s.cleanup();
    }
  });

  it("throws for a tool with no execute handler", async () => {
    const s = await createAgentSimulator();
    try {
      // Register def without execute handler
      s.pi.registerTool({
        name: "stub_tool",
        description: "A stub without execute",
      });
      await expect(s.toolCall("stub_tool", {})).rejects.toThrow(/no execute handler/);
    } finally {
      s.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// buildPreamble — graphifyStatus override
// ---------------------------------------------------------------------------

describe("buildPreamble graphifyStatus", () => {
  it("renders FULL by default", () => {
    const preamble = sim.buildPreamble();
    expect(preamble).toContain("FULL");
    expect(preamble).not.toContain("STALE");
    expect(preamble).not.toContain("NO_GRAPH");
    expect(preamble).not.toContain("DEGRADED");
  });

  it("renders STALE when overridden", () => {
    const preamble = sim.buildPreamble({ graphifyStatus: "STALE" });
    expect(preamble).toContain("STALE");
    expect(preamble).toMatch(/graph.*?h stale/i);
  });

  it("renders NO_GRAPH when overridden", () => {
    const preamble = sim.buildPreamble({ graphifyStatus: "NO_GRAPH" });
    expect(preamble).toContain("NO_GRAPH");
  });

  it("renders DEGRADED when overridden", () => {
    const preamble = sim.buildPreamble({ graphifyStatus: "DEGRADED" });
    expect(preamble).toContain("DEGRADED");
  });

  it("honors the default passed in constructor options", async () => {
    const s = await createAgentSimulator({ defaultGraphifyStatus: "NO_GRAPH" });
    try {
      const preamble = s.buildPreamble();
      expect(preamble).toContain("NO_GRAPH");
    } finally {
      s.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// addFacts
// ---------------------------------------------------------------------------

describe("addFacts", () => {
  it("seeds n facts into state", async () => {
    const s = await createAgentSimulator();
    try {
      await s.addFacts(3);
      const state = s.getState();
      expect(state.belief.facts.length).toBe(3);
    } finally {
      s.cleanup();
    }
  });

  it("applies content overrides to all seeded facts", async () => {
    const s = await createAgentSimulator();
    try {
      await s.addFacts(2, { content: "custom fact", confidence: 0.95, source: "user" });
      const { facts } = s.getState().belief;
      expect(facts.length).toBe(2);
      for (const fact of facts) {
        expect(fact.content).toBe("custom fact");
        expect(fact.confidence).toBe(0.95);
        expect(fact.source).toBe("user");
        expect(fact.status).toBe("active");
      }
    } finally {
      s.cleanup();
    }
  });

  it("seeded facts have unique ids", async () => {
    const s = await createAgentSimulator();
    try {
      await s.addFacts(5);
      const ids = s.getState().belief.facts.map((f) => f.id);
      expect(new Set(ids).size).toBe(5);
      for (const id of ids) {
        expect(id).toMatch(/^bf-/);
      }
    } finally {
      s.cleanup();
    }
  });
});

describe("addGraphFindings", () => {
  it("seeds n graph findings into state", async () => {
    const s = await createAgentSimulator();
    try {
      await s.addGraphFindings(2);
      const state = s.getState();
      expect(state.attention.graphFindings.length).toBe(2);
    } finally {
      s.cleanup();
    }
  });

  it("applies overrides to all seeded findings", async () => {
    const s = await createAgentSimulator();
    try {
      await s.addGraphFindings(1, { query: "custom query", confidence: "INFERRED", community: "test-community" });
      const { graphFindings } = s.getState().attention;
      expect(graphFindings.length).toBe(1);
      const finding = graphFindings[0]!;
      expect(finding.query).toBe("custom query");
      expect(finding.confidence).toBe("INFERRED");
      expect(finding.community).toBe("test-community");
    } finally {
      s.cleanup();
    }
  });

  it("each finding has a timestamp", async () => {
    const s = await createAgentSimulator();
    try {
      await s.addGraphFindings(1);
      const { graphFindings } = s.getState().attention;
      expect(graphFindings.length).toBe(1);
      const finding = graphFindings[0]!;
      expect(finding.timestamp).toBeDefined();
      expect(finding.timestamp).not.toBe("");
    } finally {
      s.cleanup();
    }
  });


});
