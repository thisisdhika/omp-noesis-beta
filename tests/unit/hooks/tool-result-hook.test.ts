"use strict";

/**
 * Unit tests for tool-result-hook.ts — captures tool execution outcomes
 * as learning entries.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { createMockPi, toExtensionAPI } from "../../helpers/mock-pi.js";
import { createRuntime, type NoesisRuntime } from "../../../src/runtime.js";
import { registerToolResultHook } from "../../../src/hooks/tool-result-hook.js";
import { EMPTY_STATE } from "../../../src/shared/schema.js";
import { deepClone } from "../../../src/shared/clone.js";
import { cleanPersistedState } from "../../helpers/fixtures.js";
import type { MockPi } from "../../helpers/mock-pi.js";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe("registerToolResultHook", () => {
  it("registers a tool_result event handler", async () => {
    cleanPersistedState();
    const pi = createMockPi();
    const runtime = await createRuntime(toExtensionAPI(pi));
    registerToolResultHook(toExtensionAPI(pi), runtime);

    const hooks = pi._getHooks("tool_result");
    expect(hooks.length).toBeGreaterThanOrEqual(1);
  });

  it("does not create learning entry for successful tool results", async () => {
    cleanPersistedState();
    const pi = createMockPi();
    const runtime = await createRuntime(toExtensionAPI(pi));
    registerToolResultHook(toExtensionAPI(pi), runtime);

    // Reset state to clean baseline
    await runtime.stateManager.mutate((s) => {
      Object.assign(s, deepClone(EMPTY_STATE));
    });

    const handler = pi._getHooks("tool_result")[0]!;
    const before = runtime.stateManager.read().learning.failures.length;

    await handler({
      toolName: "read",
      isError: false,
      content: [{ type: "text", text: "File contents here" }],
    });

    const after = runtime.stateManager.read().learning.failures.length;
    expect(after).toBe(before);
  });

  it("creates learning entry when tool result has isError=true", async () => {
    cleanPersistedState();
    const pi = createMockPi();
    const runtime = await createRuntime(toExtensionAPI(pi));
    registerToolResultHook(toExtensionAPI(pi), runtime);

    await runtime.stateManager.mutate((s) => {
      Object.assign(s, deepClone(EMPTY_STATE));
    });

    const handler = pi._getHooks("tool_result")[0]!;
    const before = runtime.stateManager.read().learning.failures.length;

    await handler({
      toolName: "bash",
      isError: true,
      content: [{ type: "text", text: "Command not found" }],
    });

    const state = runtime.stateManager.read();
    expect(state.learning.failures.length).toBe(before + 1);
    expect(state.learning.failures.at(-1)!.toolName).toBe("bash");
    expect(state.learning.failures.at(-1)!.description).toContain("bash failed");
  });

  it("creates learning entry when content has error keyword", async () => {
    cleanPersistedState();
    const pi = createMockPi();
    const runtime = await createRuntime(toExtensionAPI(pi));
    registerToolResultHook(toExtensionAPI(pi), runtime);

    await runtime.stateManager.mutate((s) => {
      Object.assign(s, deepClone(EMPTY_STATE));
    });

    const handler = pi._getHooks("tool_result")[0]!;
    const before = runtime.stateManager.read().learning.failures.length;

    await handler({
      toolName: "read",
      isError: false,
      content: [{ type: "text", text: "error: file not found" }],
    });

    expect(runtime.stateManager.read().learning.failures.length).toBe(before + 1);
  });

  it("detects 'cannot' keyword in content", async () => {
    cleanPersistedState();
    const pi = createMockPi();
    const runtime = await createRuntime(toExtensionAPI(pi));
    registerToolResultHook(toExtensionAPI(pi), runtime);

    await runtime.stateManager.mutate((s) => {
      Object.assign(s, deepClone(EMPTY_STATE));
    });

    const handler = pi._getHooks("tool_result")[0]!;
    const before = runtime.stateManager.read().learning.failures.length;

    await handler({
      toolName: "bash",
      isError: false,
      content: [{ type: "text", text: "cannot connect to host" }],
    });

    expect(runtime.stateManager.read().learning.failures.length).toBe(before + 1);
  });

  it("detects 'unable' keyword in content", async () => {
    cleanPersistedState();
    const pi = createMockPi();
    const runtime = await createRuntime(toExtensionAPI(pi));
    registerToolResultHook(toExtensionAPI(pi), runtime);

    await runtime.stateManager.mutate((s) => {
      Object.assign(s, deepClone(EMPTY_STATE));
    });

    const handler = pi._getHooks("tool_result")[0]!;
    const before = runtime.stateManager.read().learning.failures.length;

    await handler({
      toolName: "bash",
      isError: false,
      content: [{ type: "text", text: "unable to resolve" }],
    });

    expect(runtime.stateManager.read().learning.failures.length).toBe(before + 1);
  });

  it("detects 'not found' keyword in content", async () => {
    cleanPersistedState();
    const pi = createMockPi();
    const runtime = await createRuntime(toExtensionAPI(pi));
    registerToolResultHook(toExtensionAPI(pi), runtime);

    await runtime.stateManager.mutate((s) => {
      Object.assign(s, deepClone(EMPTY_STATE));
    });

    const handler = pi._getHooks("tool_result")[0]!;
    const before = runtime.stateManager.read().learning.failures.length;

    await handler({
      toolName: "search",
      isError: false,
      content: [{ type: "text", text: "pattern not found" }],
    });

    expect(runtime.stateManager.read().learning.failures.length).toBe(before + 1);
  });

  it("is case-insensitive for error keywords", async () => {
    cleanPersistedState();
    const pi = createMockPi();
    const runtime = await createRuntime(toExtensionAPI(pi));
    registerToolResultHook(toExtensionAPI(pi), runtime);

    await runtime.stateManager.mutate((s) => {
      Object.assign(s, deepClone(EMPTY_STATE));
    });

    const handler = pi._getHooks("tool_result")[0]!;
    const before = runtime.stateManager.read().learning.failures.length;

    await handler({
      toolName: "bash",
      isError: false,
      content: [{ type: "text", text: "FAILED to execute" }],
    });

    expect(runtime.stateManager.read().learning.failures.length).toBe(before + 1);
  });

  it("uses 'unknown' toolName when none provided", async () => {
    cleanPersistedState();
    const pi = createMockPi();
    const runtime = await createRuntime(toExtensionAPI(pi));
    registerToolResultHook(toExtensionAPI(pi), runtime);

    await runtime.stateManager.mutate((s) => {
      Object.assign(s, deepClone(EMPTY_STATE));
    });

    const handler = pi._getHooks("tool_result")[0]!;

    await handler({
      isError: true,
      content: [{ type: "text", text: "something went wrong" }],
    });

    const entry = runtime.stateManager.read().learning.failures.at(-1)!;
    expect(entry.toolName).toBe("unknown");
  });
});
