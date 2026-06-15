"use strict";

/**
 * Integration tests for hook registration via mock ExtensionAPI.
 *
 * Verifies that all 5 noesis hooks register on their expected events.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createMockPi } from "../helpers/mock-pi.js";
import { createRuntime, type NoesisRuntime } from "../../src/runtime.js";
import { registerHooks } from "../../src/hooks/index.js";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Mock pi with test helper methods. */
interface MockPi {
  logger: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
  };
  registerTool(def: Record<string, unknown>): void;
  registerCommand(name: string, opts: Record<string, unknown>): void;
  on(event: string, handler: (...args: unknown[]) => unknown): void;
  _toolCount(): number;
  _getTool(name: string): Record<string, unknown> | undefined;
  _getHooks(event: string): Array<(...args: unknown[]) => unknown>;
}

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
  // Remove prior state so createRuntime starts fresh
  const statePath = join(process.cwd(), ".omp", "noesis", "state.json");
  try {
    if (existsSync(statePath)) unlinkSync(statePath);
  } catch {
    // best-effort
  }

  const raw = createMockPi();
  // Unsafe cast: mock structurally matches ExtensionAPI for test purposes.
  pi = raw as unknown as MockPi;
  runtime = await createRuntime(pi as unknown as ExtensionAPI);
  registerHooks(pi as unknown as ExtensionAPI, runtime);
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
    expect(pi._getHooks("session_start")).toHaveLength(0);
    expect(pi._getHooks("agent_start")).toHaveLength(0);
    expect(pi._getHooks("message_start")).toHaveLength(0);
  });
});
