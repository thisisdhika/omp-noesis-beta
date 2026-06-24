"use strict";

/**
 * Integration tests for hook registration via mock ExtensionAPI.
 *
 * Verifies that all 5 noesis hooks register on their expected events.
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanPersistedState } from "../helpers/fixtures.js";
import { createMockPi, toExtensionAPI, type MockPi } from "../helpers/mock-pi.js";
import { createRuntime, type NoesisRuntime } from "../../src/runtime.js";

mock.module("../../src/infrastructure/graphify-client.js", () => ({
  detectCapability: async () => "FULL",
  tryLifecycleGraphUpdate: async () => true,
}));

import { registerHooks } from "../../src/hooks/index.js";
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let pi: MockPi;
let runtime: NoesisRuntime;

const EXPECTED_EVENTS = [
  "context",
  "session.compacting",
  "tool_result",
  "before_agent_start",
  "turn_end",
] as const;

beforeEach(async () => {
  cleanPersistedState();

  pi = createMockPi();
  runtime = await createRuntime(toExtensionAPI(pi));
  registerHooks(toExtensionAPI(pi), runtime);
});


// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("hook registration", () => {
  it("registers a handler on the context event", () => {
    const handlers = pi._getHooks("context");
    expect(handlers).toBeDefined();
    expect(handlers.length).toBe(1);
  });

  it("registers a handler on the session.compacting event", () => {
    const handlers = pi._getHooks("session.compacting");
    expect(handlers).toBeDefined();
    expect(handlers.length).toBe(1);
  });

  it("registers a handler on the tool_result event", () => {
    const handlers = pi._getHooks("tool_result");
    expect(handlers).toBeDefined();
    expect(handlers.length).toBe(1);
  });

  it("registers a handler on the before_agent_start event", () => {
    const handlers = pi._getHooks("before_agent_start");
    expect(handlers).toBeDefined();
    expect(handlers.length).toBe(1);
  });

  it("registers a handler on the turn_end event", () => {
    const handlers = pi._getHooks("turn_end");
    expect(handlers).toBeDefined();
    expect(handlers.length).toBe(1);
  });

  it("does not register handlers on unrelated events", () => {
    // Verify no stray registrations on events we do not listen to
    expect(pi._getHooks("agent_start")).toHaveLength(0);
    expect(pi._getHooks("message_start")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Before Agent Start execution
// ---------------------------------------------------------------------------

describe("before_agent_start execution", () => {
  it("chains OMP system prompt and appends capability + MCP footer", async () => {
    const handler = pi._getHooks("before_agent_start")[0]!;
    const event = { systemPrompt: ["OMPSystemPrompt"] } as Record<string, unknown>;
    const result = (await handler(event)) as { systemPrompt?: string[] };

    expect(result.systemPrompt).toBeDefined();
    expect(result.systemPrompt!.length).toBe(3);
    // First block: chained OMP system prompt (includes RULES.md content natively)
    expect(result.systemPrompt![0]).toBe("OMPSystemPrompt");
    // Second block: capability footer
    expect(result.systemPrompt![1]).toContain("Noesis capability:");
    // Third block: state file reference
    expect(result.systemPrompt![2]).toContain("Noesis state:");
  });
});

// ---------------------------------------------------------------------------
// Compaction execution
// ---------------------------------------------------------------------------

describe("compaction execution", () => {
  it("returns survivor context and preserveData", async () => {
    const handler = pi._getHooks("session.compacting")[0]!;
    const event = {} as Record<string, unknown>;
    const result = (await handler(event)) as {
      context: string[];
      preserveData: Record<string, unknown>;
    };

    expect(result).toBeDefined();
    expect(Array.isArray(result.context)).toBe(true);
    expect(result.context.length).toBeGreaterThanOrEqual(1);
    expect(typeof result.context[0]).toBe("string");
    expect(result.context[0]).toContain("<noesis-state>");

    expect(result.preserveData).toBeDefined();
    expect(result.preserveData["omp-noesis"]).toBeDefined();
  });

  it("includes beliefs in survivor context when populated", async () => {
    // Add a belief fact to state
    await runtime.stateManager.mutate((state) => {
      state.belief.facts.push({
        id: "bf-test-belief-001",
        content: "Test belief for compaction",
        confidence: 0.85,
        source: "user",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "active",
        epistemicStatus: "speculative" as const,
        reviewRequired: false,
        scope: "local" as const,
        revision: 0,
      });
    });

    const handler = pi._getHooks("session.compacting")[0]!;
    const event = {} as Record<string, unknown>;
    const result = (await handler(event)) as {
      context: string[];
      preserveData: Record<string, unknown>;
    };

    const preserved = result.preserveData["omp-noesis"] as {
      belief: { facts: Array<{ id: string; content: string }> };
    };
    expect(preserved.belief.facts.length).toBeGreaterThanOrEqual(1);
    expect(preserved.belief.facts.some((f) => f.id === "bf-test-belief-001")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Context execution
// ---------------------------------------------------------------------------

describe("context execution", () => {
  it("prepends cognitive preamble to messages", async () => {
    const handler = pi._getHooks("context")[0]!;
    const event = {
      messages: [{ role: "user" as const, content: [{ type: "text" as const, text: "existing message" }] }],
    };
    const result = (await handler(event)) as {
      messages: Array<{
        role: string;
        content: Array<{ type: string; text: string }>;
      }>;
    };

    expect(result.messages).toBeDefined();
    // Preamble is prepended, so we have original + 1
    expect(result.messages.length).toBe(event.messages.length + 1);

    const preambleMessage = result.messages[0]!;
    expect(preambleMessage.role).toBe("user");
    expect(Array.isArray(preambleMessage.content)).toBe(true);
    expect(preambleMessage.content.length).toBeGreaterThanOrEqual(1);

    // Verify preamble text references Noesis
    const preambleText = preambleMessage.content[0]!.text;
    expect(preambleText).toContain("Noesis");

    // Verify original message is still present (as second message)
    expect(result.messages[1]!.role).toBe("user");
  });

  it("includes focus content when focus is set", async () => {
    // Set a focus value
    await runtime.stateManager.mutate((state) => {
      state.attention.focus = "Implement user authentication flow";
      state.attention.updatedAt = new Date().toISOString();
    });

    const handler = pi._getHooks("context")[0]!;
    const event = {
      messages: [{ role: "user" as const, content: [{ type: "text" as const, text: "test" }] }],
    };
    const result = (await handler(event)) as {
      messages: Array<{
        role: string;
        content: Array<{ type: string; text: string }>;
      }>;
    };

    const preambleText = result.messages[0]!.content[0]!.text;
    expect(preambleText).toContain("Focus:");
    expect(preambleText).toContain("Implement user authentication flow");
  });
});


// ---------------------------------------------------------------------------
// Tool result execution
// ---------------------------------------------------------------------------

describe("tool_result execution", () => {
  it("captures tool failure as learning entry", async () => {
    // Capture initial failure count
    const before = runtime.stateManager.read().learning.failures.length;

    const handler = pi._getHooks("tool_result")[0]!;
    const event = {
      toolName: "test_tool_fail",
      isError: true,
      content: [{ type: "text" as const, text: "Something went wrong" }],
    };
    await handler(event);

    const after = runtime.stateManager.read().learning.failures.length;
    expect(after).toBe(before + 1);

    // Verify the entry was stored with correct tool name
    const state = runtime.stateManager.read();
    const lastFailure = state.learning.failures[state.learning.failures.length - 1]!;
    expect(lastFailure.toolName).toBe("test_tool_fail");
  });

  it("does not capture tool success as learning entry", async () => {
    const before = runtime.stateManager.read().learning.successes.length;

    const handler = pi._getHooks("tool_result")[0]!;
    const event = {
      toolName: "test_tool_ok",
      isError: false,
      content: [{ type: "text" as const, text: "Operation completed successfully" }],
    };
    await handler(event);

    const after = runtime.stateManager.read().learning.successes.length;
    // Tool-result-hook only captures failures, not successful results
    expect(after).toBe(before);
  });

  it("detects failure from error keywords in content", async () => {
    const beforeFail = runtime.stateManager.read().learning.failures.length;

    const handler = pi._getHooks("tool_result")[0]!;
    // isError is false but content contains "error" keyword
    const event = {
      toolName: "query_tool",
      isError: false,
      content: [{ type: "text" as const, text: "An error occurred while processing the request" }],
    };
    await handler(event);

    const afterFail = runtime.stateManager.read().learning.failures.length;
    expect(afterFail).toBe(beforeFail + 1);

    const state = runtime.stateManager.read();
    const lastFailure = state.learning.failures[state.learning.failures.length - 1]!;
    expect(lastFailure.toolName).toBe("query_tool");
  });
});

// ---------------------------------------------------------------------------
// Turn end execution
// ---------------------------------------------------------------------------

describe("turn_end execution", () => {
  it("triggers state cleanup without error", async () => {
    const handler = pi._getHooks("turn_end")[0]!;

    // Should not throw
    await expect(handler({})).resolves.toBeUndefined();
  });

  it("removes stale entries after cleanup", async () => {
    const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000;
    const staleTimestamp = new Date(Date.now() - THIRTY_ONE_DAYS_MS).toISOString();
    const freshTimestamp = new Date().toISOString();

    // Add stale and fresh entries directly via state mutation
    await runtime.stateManager.mutate((state) => {
      state.learning.failures.push({
        id: "le-stale-001",
        description: "Old stale failure",
        status: "captured",
        capturedAt: staleTimestamp,
      });
      state.learning.failures.push({
        id: "le-fresh-002",
        description: "Recent failure",
        status: "captured",
        capturedAt: freshTimestamp,
      });
      state.learning.summary.failureCount += 2;
    });

    const handler = pi._getHooks("turn_end")[0]!;
    await handler({});

    const state = runtime.stateManager.read();
    expect(state.learning.failures.find((e) => e.id === "le-stale-001")).toBeUndefined();
    expect(state.learning.failures.find((e) => e.id === "le-fresh-002")).toBeDefined();
  });
});
