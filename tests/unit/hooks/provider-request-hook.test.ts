"use strict";

/**
 * Unit tests for provider-request-hook.ts — hooks into before_provider_request.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { createMockPi, toExtensionAPI } from "../../helpers/mock-pi.js";
import { registerProviderRequestHook } from "../../../src/hooks/provider-request-hook.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("registerProviderRequestHook", () => {
  it("registers a before_provider_request event handler", () => {
    const pi = createMockPi();
    registerProviderRequestHook(toExtensionAPI(pi));

    const hooks = pi._getHooks("before_provider_request");
    expect(hooks.length).toBeGreaterThanOrEqual(1);
  });

  it("handler returns adapted payload for deepseek model", async () => {
    const pi = createMockPi();
    registerProviderRequestHook(toExtensionAPI(pi));

    const handler = pi._getHooks("before_provider_request")[0]!;
    const payload = {
      model: "deepseek/deepseek-v4-pro",
      messages: [{ role: "user", content: "test" }],
      tools: [
        {
          type: "function",
          function: {
            name: "test_tool",
            description: "Test tool",
            parameters: {
              type: "object",
              properties: { x: { type: "string" } },
              additionalProperties: false,
            },
          },
        },
      ],
    };

    const result = (await handler({ type: "before_provider_request", payload: structuredClone(payload) })) as any;
    // deepseek: additionalProperties should be stripped
    expect(result.tools[0].function.parameters.additionalProperties).toBeUndefined();
    expect(result.tools[0].function.parameters.properties.x.type).toBe("string");
  });

  it("handler returns unchanged payload for claude model", async () => {
    const pi = createMockPi();
    registerProviderRequestHook(toExtensionAPI(pi));

    const handler = pi._getHooks("before_provider_request")[0]!;
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [],
      tools: [
        {
          type: "function",
          function: {
            name: "test_tool",
            description: "Test",
            parameters: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
          },
        },
      ],
    };

    const result = (await handler({ type: "before_provider_request", payload: structuredClone(payload) })) as any;
    // claude: no changes
    expect(result.tools[0].function.parameters.additionalProperties).toBe(false);
  });

  it("handler does not mutate original payload", async () => {
    const pi = createMockPi();
    registerProviderRequestHook(toExtensionAPI(pi));

    const handler = pi._getHooks("before_provider_request")[0]!;
    const payload = {
      model: "Qwen/Qwen3.6-Plus",
      messages: [],
      tools: [
        {
          type: "function",
          function: {
            name: "test_tool",
            description: "A".repeat(300),
            parameters: { type: "object", properties: {} },
          },
        },
      ],
    };

    const payloadClone = structuredClone(payload);
    await handler({ type: "before_provider_request", payload });
    // Original payload reference should be unchanged (adapter now clones before mutating)
    expect(payload).toEqual(payloadClone);
  });
});
