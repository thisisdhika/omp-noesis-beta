"use strict";

import { describe, it, expect, mock } from "bun:test";
import type { MemoryRuntimeContext } from "@oh-my-pi/pi-coding-agent/memory-backend/types";
import { createMockPi, toExtensionAPI } from "../helpers/mock-pi.js";
import { createRuntime } from "../../src/runtime.js";

describe("createRuntime retainToOmp bridge", () => {
  it("forwards retained items to the active memory runtime", async () => {
    const pi = createMockPi();
    const runtime = await createRuntime(toExtensionAPI(pi));
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

    runtime.attachMemoryRuntime?.(memoryRuntime);

    await runtime.retainToOmp?.([
      { content: "Retained fact A", context: "source: execution" },
      { content: "Retained fact B" },
    ]);

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenNthCalledWith(1, {
      content: "Retained fact A",
      context: "source: execution",
    });
    expect(save).toHaveBeenNthCalledWith(2, {
      content: "Retained fact B",
      context: undefined,
    });
  });
});
