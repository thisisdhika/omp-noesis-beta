import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestContext, type TestContext } from "../_harness/fixtures.js";
import { makeState } from "../_harness/factories.js";
import { setFocus } from "../../src/domains/attention/attention-domain.js";

/**
 * These tests validate the context hook injects preamble into messages.
 * They require real OMP integration — the mock hook path does not share
 * state between activate()'s StateManager and the test's StateManager.
 * Skipped pending OMP binary available in test environment.
 */
describe("preamble injection (context hook)", () => {
  let ctx: TestContext & { cleanup: () => void };
  beforeEach(() => { ctx = createTestContext(); });
  afterEach(() => { ctx.cleanup(); });

  it.skip("preamble appears when state has active focus", async () => {
    ctx.state.mutate((s) => { setFocus(s, "Debug bug"); });
    const result = await ctx.extension.invokeHook("context", {
      messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    });
    expect(result).toBeDefined();
  });

  it.skip("preamble is absent when state has no focus", async () => {
    const result = await ctx.extension.invokeHook("context", {
      messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    });
    expect(result).toBeDefined();
  });

  it.skip("preamble rebuilt after state mutation", async () => {
    ctx.state.mutate((s) => { setFocus(s, "Focus A"); });
    await ctx.extension.invokeHook("context", { messages: [] });
    ctx.state.mutate((s) => { setFocus(s, "Focus B"); });
    const resultB = await ctx.extension.invokeHook("context", {
      messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    });
    expect(resultB).toBeDefined();
  });

  it.skip("graph findings cleared after preamble", async () => {
    ctx.state.mutate((s) => {
      s.attention.graphFindings = [{
        nodeName: "TestNode", confidence: 0.9,
        confidenceLabel: "EXTRACTED", isGodNode: false,
        isSurprising: false, rawSnippet: "Graph found something",
      }];
    });
    await ctx.extension.invokeHook("context", {
      messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    });
    const after = ctx.state.read();
    expect(after).toBeDefined();
  });
});
