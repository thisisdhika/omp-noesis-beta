"use strict";

/**
 * Unit tests for turn-end-hook.ts — verifies turn_end handler registration
 * and that the handler invokes stateManager.mutate with decayPendingEvidence
 * and fullCleanup, plus vaultStore.flush when available.
 */

import { describe, it, expect } from "bun:test";
import { createMockPi, toExtensionAPI } from "../../helpers/mock-pi.js";
import { createRuntime, type NoesisRuntime } from "../../../src/runtime.js";
import { registerTurnEndHook } from "../../../src/hooks/turn-end-hook.js";
import { cleanPersistedState } from "../../helpers/fixtures.js";
import { EMPTY_STATE } from "../../../src/schema.js";
import type { NoesisState } from "../../../src/schema.js";
import type { StateManager } from "../../../src/infrastructure/state-manager.js";
import type { VaultStore } from "../../../src/vault/vault-store.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal mock StateManager.  StateManager has #private fields so
 * structural assignment is rejected; the double cast via `unknown` is required.
 */
function createMockStateManager(
  mutateImpl?: (fn: (state: NoesisState) => void) => Promise<NoesisState>,
): StateManager {
  return {
    read: () => structuredClone(EMPTY_STATE),
    mutate: mutateImpl ?? (async (fn) => {
      const state = structuredClone(EMPTY_STATE);
      fn(state);
      return state;
    }),
    initialize: async () => {},
    checkpointAttention: async () => {},
    invalidate: async () => {},
  } as unknown as StateManager;
}

/**
 * Create a minimal mock VaultStore.
 */
function createMockVaultStore(hasFlush: boolean): VaultStore {
  const base: VaultStore = {
    push: async () => {},
    pull: async () => ({
      artifacts: [],
      source: "mock",
      timestamp: new Date().toISOString(),
    }),
    search: async () => [],
    validate: async () => true,
  };
  if (hasFlush) {
    return {
      ...base,
      flush: async () => {},
    } satisfies VaultStore;
  }
  return base;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("registerTurnEndHook", () => {
  it("registers a turn_end event handler", async () => {
    cleanPersistedState();
    const pi = createMockPi();
    const runtime = await createRuntime(toExtensionAPI(pi));
    registerTurnEndHook(toExtensionAPI(pi), runtime);

    const hooks = pi._getHooks("turn_end");
    expect(hooks).toHaveLength(1);
    expect(typeof hooks[0]).toBe("function");
  });

  it("calls stateManager.mutate when turn_end fires", async () => {
    let mutateCalled = false;
    const mockStateManager = createMockStateManager(async (fn) => {
      mutateCalled = true;
      const state = structuredClone(EMPTY_STATE);
      fn(state);
      return state;
    });

    const pi = createMockPi();
    const runtime: NoesisRuntime = {
      projectRoot: "/tmp/test",
      stateManager: mockStateManager,
      vaultStore: createMockVaultStore(false),
    };
    registerTurnEndHook(toExtensionAPI(pi), runtime);

    const handler = pi._getHooks("turn_end")[0]!;
    await handler({});
    expect(mutateCalled).toBe(true);
  });

  it("applies decayPendingEvidence and fullCleanup to state within mutate", async () => {
    // Create a state with a pending evidence entry to verify decay ran
    let mutatedState: NoesisState | undefined;
    const mockStateManager = createMockStateManager(async (fn) => {
      const state = structuredClone(EMPTY_STATE);
      state.attention.pendingEvidence = [
        {
          query: "test",
          turnAdded: 1,
          turnsRemaining: 2,
          findings: [{
            query: "test",
            nodes: ["node-1"],
            relations: ["related-to"],
            confidence: "EXTRACTED",
            timestamp: new Date().toISOString(),
          }],
        },
      ];
      fn(state);
      mutatedState = state;
      return state;
    });

    const pi = createMockPi();
    const runtime: NoesisRuntime = {
      projectRoot: "/tmp/test",
      stateManager: mockStateManager,
      vaultStore: createMockVaultStore(false),
    };
    registerTurnEndHook(toExtensionAPI(pi), runtime);

    const handler = pi._getHooks("turn_end")[0]!;
    await handler({});

    // decayPendingEvidence should have decremented turnsRemaining
    expect(mutatedState!.attention.pendingEvidence).toHaveLength(1);
    expect(mutatedState!.attention.pendingEvidence[0]!.turnsRemaining).toBe(1);
    // fullCleanup / decayPendingEvidence should have updated the timestamp
    expect(mutatedState!.attention.updatedAt).not.toBe(EMPTY_STATE.attention.updatedAt);
  });

  it("calls vaultStore.flush when vaultStore has flush method", async () => {
    let flushCalled = false;
    const vaultStoreWithFlush: VaultStore = {
      ...createMockVaultStore(false),
      flush: async () => {
        flushCalled = true;
      },
    };

    const pi = createMockPi();
    const runtime: NoesisRuntime = {
      projectRoot: "/tmp/test",
      stateManager: createMockStateManager(),
      vaultStore: vaultStoreWithFlush,
    };
    registerTurnEndHook(toExtensionAPI(pi), runtime);

    const handler = pi._getHooks("turn_end")[0]!;
    await handler({});
    expect(flushCalled).toBe(true);
  });

  it("handles turn_end gracefully when vaultStore lacks flush", async () => {
    const pi = createMockPi();
    const runtime: NoesisRuntime = {
      projectRoot: "/tmp/test",
      stateManager: createMockStateManager(),
      vaultStore: createMockVaultStore(false),
    };
    registerTurnEndHook(toExtensionAPI(pi), runtime);

    const handler = pi._getHooks("turn_end")[0]!;
    await expect(handler({})).resolves.toBeUndefined();
  });
});
