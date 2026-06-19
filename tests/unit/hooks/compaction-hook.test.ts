"use strict";

/**
 * Unit tests for compaction-hook.ts — verifies session.compacting handler
 * registration and that the handler returns survivor context with
 * preserveData containing the full state snapshot.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { createMockPi, toExtensionAPI } from "../../helpers/mock-pi.js";
import type { MockPi } from "../../helpers/mock-pi.js";
import { createRuntime, type NoesisRuntime } from "../../../src/runtime.js";
import { registerCompactionHook } from "../../../src/hooks/compaction-hook.js";
import { cleanPersistedState } from "../../helpers/fixtures.js";
import type { NoesisState } from "../../../src/shared/schema.js";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let pi: MockPi;
let runtime: NoesisRuntime;

beforeEach(async () => {
  cleanPersistedState();
  pi = createMockPi();
  runtime = await createRuntime(toExtensionAPI(pi));
  registerCompactionHook(toExtensionAPI(pi), runtime);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("registerCompactionHook", () => {
  it("registers a session.compacting event handler", () => {
    const hooks = pi._getHooks("session.compacting");
    expect(hooks).toHaveLength(1);
    expect(typeof hooks[0]).toBe("function");
  });

  it("returns context array with survivor string", async () => {
    const handler = pi._getHooks("session.compacting")[0]!;
    const result = (await handler({})) as {
      context: string[];
      preserveData: { "omp-noesis": NoesisState };
    };

    expect(result).toBeDefined();
    expect(Array.isArray(result.context)).toBe(true);
    expect(result.context).toHaveLength(1);
    expect(typeof result.context[0]).toBe("string");
    // Survivor context should be valid XML with <noesis-state> wrapper
    expect(result.context[0]).toContain("<noesis-state>");
    expect(result.context[0]).toContain("</noesis-state>");
  });

  it("returns preserveData with full state snapshot", async () => {
    const handler = pi._getHooks("session.compacting")[0]!;
    const result = (await handler({})) as {
      context: string[];
      preserveData: { "omp-noesis": NoesisState };
    };

    expect(result.preserveData).toBeDefined();
    expect(result.preserveData["omp-noesis"]).toBeDefined();
    // Should contain required top-level keys from a NoesisState
    expect(result.preserveData["omp-noesis"]).toHaveProperty("version");
    expect(result.preserveData["omp-noesis"]).toHaveProperty("attention");
    expect(result.preserveData["omp-noesis"]).toHaveProperty("belief");
    expect(result.preserveData["omp-noesis"]).toHaveProperty("learning");
    expect(result.preserveData["omp-noesis"]).toHaveProperty("inference");
    expect(result.preserveData["omp-noesis"]).toHaveProperty("commitment");
  });

  it("preserves data is a deep clone (mutating source does not affect it)", async () => {
    const handler = pi._getHooks("session.compacting")[0]!;
    const result = (await handler({})) as {
      context: string[];
      preserveData: { "omp-noesis": NoesisState };
    };

    // Modify the runtime state after the snapshot was taken
    runtime.stateManager.read().attention.focus = "mutated";
    // The preserved snapshot should still have the original empty focus
    expect(result.preserveData["omp-noesis"].attention.focus).toBe("");
  });
});
