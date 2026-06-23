"use strict";

/**
 * Unit tests for the retainToOmp bridge — end-to-end from executeBelieveFact
 * through runtime.retainToOmp to memoryRuntime.save.
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { MemoryRuntimeContext } from "@oh-my-pi/pi-coding-agent/memory-backend/types";
import { createMockPi, toExtensionAPI } from "../helpers/mock-pi.js";
import { createRuntime, type NoesisRuntime } from "../../src/runtime.js";
import { executeBelieveFact } from "../../src/tools/believe-tool.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Remove persisted state between tests so each starts clean. */
function cleanState(): void {
  const statePath = join(process.cwd(), ".omp", "noesis", "state.json");
  if (existsSync(statePath)) unlinkSync(statePath);
}

async function setup(): Promise<{ runtime: NoesisRuntime }> {
  cleanState();
  const pi = createMockPi();
  const runtime = await createRuntime(toExtensionAPI(pi));
  return { runtime };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("retainToOmp bridge", () => {
  beforeEach(() => {
    cleanState();
  });

  // ── runtime-level behavior ─────────────────────────────────────────────

  it("exists on runtime and forwards to memoryRuntime.save when attached", async () => {
    const { runtime } = await setup();

    // retainToOmp is always defined on the returned runtime object
    expect(runtime.retainToOmp).toBeDefined();
    expect(typeof runtime.retainToOmp).toBe("function");
    expect(runtime.attachMemoryRuntime).toBeDefined();
    expect(typeof runtime.attachMemoryRuntime).toBe("function");

    // Without an attached memory runtime, retainToOmp is a no-op
    const save = mock(async (_input: { content: string; context?: string }) => ({
      backend: "off" as const,
      stored: 1,
    }));

    const memoryRuntime = {
      status: async () => ({
        backend: "off" as const,
        active: false,
        writable: false,
        searchable: false,
      }),
      search: async () => ({
        backend: "off" as const,
        query: "",
        count: 0,
        items: [],
      }),
      save,
    } satisfies MemoryRuntimeContext;

    // No-op before attach
    await runtime.retainToOmp?.([{ content: "noop", context: "pre-attach" }]);
    expect(save).toHaveBeenCalledTimes(0);

    // Attach and verify forwarding
    runtime.attachMemoryRuntime?.(memoryRuntime);

    await runtime.retainToOmp?.([
      { content: "Forwarded fact A", context: "source: execution" },
      { content: "Forwarded fact B" },
    ]);

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenNthCalledWith(1, {
      content: "Forwarded fact A",
      context: "source: execution",
    });
    expect(save).toHaveBeenNthCalledWith(2, {
      content: "Forwarded fact B",
      context: undefined,
    });
  });

  // ── executeBelieveFact integration ─────────────────────────────────────

  it("calls retainToOmp when believe_fact confidence >= 0.6", async () => {
    const { runtime } = await setup();
    const retainToOmp = mock(() => Promise.resolve());
    runtime.retainToOmp = retainToOmp;

    await executeBelieveFact(runtime, {
      content: "Confident fact",
      confidence: 0.6,
      source: "execution",
    });

    expect(retainToOmp).toHaveBeenCalledTimes(1);
    expect(retainToOmp).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining("[Noesis Belief] Confident fact"),
        context: expect.stringMatching(/source: execution/),
      }),
    ]);
  });

  it("does not call retainToOmp when believe_fact confidence <= 0.59", async () => {
    const { runtime } = await setup();
    const retainToOmp = mock(() => Promise.resolve());
    runtime.retainToOmp = retainToOmp;

    await executeBelieveFact(runtime, {
      content: "Shaky fact",
      confidence: 0.59,
      source: "inference",
    });

    expect(retainToOmp).not.toHaveBeenCalled();
  });

  it("does not call retainToOmp when it is undefined regardless of confidence", async () => {
    const { runtime } = await setup();
    // retainToOmp is always defined after createRuntime, but simulate
    // the path where it was never set / is explicitly undefined.
    delete runtime.retainToOmp;

    const result = await executeBelieveFact(runtime, {
      content: "No bridge fact",
      confidence: 0.95,
      source: "user",
    });

    expect(result.isError).toBe(false);
  });

  // ── vaultStore.push called alongside retainToOmp ──────────────────────

  it("calls vaultStore.push alongside retainToOmp", async () => {
    const { runtime } = await setup();
    const retainToOmp = mock(() => Promise.resolve());
    const vaultPush = mock(() => Promise.resolve());
    runtime.retainToOmp = retainToOmp;
    runtime.vaultStore.push = vaultPush;

    await executeBelieveFact(runtime, {
      content: "Dual persist fact",
      confidence: 0.8,
      source: "user",
    });

    expect(retainToOmp).toHaveBeenCalledTimes(1);
    expect(vaultPush).toHaveBeenCalledTimes(1);
  });

  it("calls vaultStore.push even when retainToOmp threshold not met (confidence 0.55)", async () => {
    const { runtime } = await setup();
    const retainToOmp = mock(() => Promise.resolve());
    const vaultPush = mock(() => Promise.resolve());
    runtime.retainToOmp = retainToOmp;
    runtime.vaultStore.push = vaultPush;

    await executeBelieveFact(runtime, {
      content: "Low confidence vault fact",
      confidence: 0.55,
      source: "inference",
    });

    // retainToOmp should not be called below the 0.6 threshold
    expect(retainToOmp).not.toHaveBeenCalled();
    // vaultStore.push should still fire regardless
    expect(vaultPush).toHaveBeenCalledTimes(1);
  });

  // ── Graceful rejection handling ───────────────────────────────────────

  it("does not throw when retainToOmp rejects", async () => {
    const { runtime } = await setup();
    runtime.retainToOmp = mock(() => Promise.reject(new Error("OMP backend unreachable")));

    const result = await executeBelieveFact(runtime, {
      content: "Bridge failure fact",
      confidence: 0.9,
      source: "user",
    });

    // The tool must succeed even when the OMP bridge fails
    expect(result.content).toBeDefined();
    expect(JSON.stringify(result.content)).toContain("Created fact:");
  });

  it("does not throw when vaultStore.push rejects", async () => {
    const { runtime } = await setup();
    runtime.vaultStore.push = mock(() => Promise.reject(new Error("Vault unreachable")));

    const result = await executeBelieveFact(runtime, {
      content: "Vault failure fact",
      confidence: 0.9,
      source: "user",
    });

    expect(result.isError).toBe(false);
    expect(JSON.stringify(result.content)).toContain("Created fact:");
  });

  it("does not throw when both retainToOmp and vaultStore.push reject", async () => {
    const { runtime } = await setup();
    runtime.retainToOmp = mock(() => Promise.reject(new Error("OMP down")));
    runtime.vaultStore.push = mock(() => Promise.reject(new Error("Vault down")));

    const result = await executeBelieveFact(runtime, {
      content: "Everything fails fact",
      confidence: 0.85,
      source: "execution",
    });

    // Even when both side-effects fail, the tool creates the fact and succeeds
    expect(result.isError).toBe(false);
    expect(JSON.stringify(result.content)).toContain("Created fact:");
  });
});
