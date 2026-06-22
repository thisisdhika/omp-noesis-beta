"use strict";

/**
 * Unit tests for turn-end-hook.ts — verifies turn_end handler registration
 * and that the handler invokes stateManager.mutate with decayPendingEvidence
 * and fullCleanup, plus vaultStore.flush when available.
 */

import { describe, it, expect, mock } from "bun:test";
import { createMockPi, toExtensionAPI } from "../../helpers/mock-pi.js";
import { createRuntime, type NoesisRuntime } from "../../../src/runtime.js";
import { cleanPersistedState } from "../../helpers/fixtures.js";
import { EMPTY_STATE, type NoesisState } from "../../../src/shared/schema.js";
import type { StateManager } from "../../../src/infrastructure/state-manager.js";
import type { VaultStore } from "../../../src/vault/vault-store.js";
import { UnitOfWork } from "../../../src/infrastructure/unit-of-work.js";

const tryLifecycleGraphUpdate = mock(async () => true);

mock.module("../../../src/infrastructure/graphify-client.js", () => ({
  tryLifecycleGraphUpdate,
}));

import { registerTurnEndHook } from "../../../src/hooks/turn-end-hook.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal mock StateManager.
 */
function createMockStateManager(): StateManager {
  return {
    read: () => structuredClone(EMPTY_STATE),
    createUnitOfWork: () => {
      const state = structuredClone(EMPTY_STATE);
      return new UnitOfWork(state, async () => {});
    },
    mutate: async (fn: (state: NoesisState) => void) => {
      const state = structuredClone(EMPTY_STATE);
      fn(state);
      return state;
    },
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

  it("opens and commits a Unit of Work when turn_end fires", async () => {
    let uowCreated = false;
    let commitCalled = false;

    const mockStateManager = {
      read: () => structuredClone(EMPTY_STATE),
      createUnitOfWork: () => {
        uowCreated = true;
        const state = structuredClone(EMPTY_STATE);
        return new UnitOfWork(state, async () => {
          commitCalled = true;
        });
      },
    } as unknown as StateManager;

    const pi = createMockPi();
    const runtime: NoesisRuntime = {
      projectRoot: "/tmp/test",
      stateManager: mockStateManager,
      vaultStore: createMockVaultStore(false),
    };
    registerTurnEndHook(toExtensionAPI(pi), runtime);

    const handler = pi._getHooks("turn_end")[0]!;
    await handler({});
    expect(uowCreated).toBe(true);
    expect(commitCalled).toBe(true);
  });

  it("applies decayPendingEvidence and fullCleanup to state within the Unit of Work", async () => {
    let committedState: NoesisState | undefined;

    const mockStateManager = {
      read: () => structuredClone(EMPTY_STATE),
      createUnitOfWork: () => {
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
        return new UnitOfWork(state, async (finalState) => {
          committedState = finalState;
        });
      },
    } as unknown as StateManager;

    const pi = createMockPi();
    const runtime: NoesisRuntime = {
      projectRoot: "/tmp/test",
      stateManager: mockStateManager,
      vaultStore: createMockVaultStore(false),
    };
    registerTurnEndHook(toExtensionAPI(pi), runtime);

    const handler = pi._getHooks("turn_end")[0]!;
    await handler({});

    expect(committedState).toBeDefined();
    expect(committedState!.attention.pendingEvidence).toHaveLength(1);
    expect(committedState!.attention.pendingEvidence[0]!.turnsRemaining).toBe(1);
    expect(committedState!.attention.updatedAt).not.toBe(EMPTY_STATE.attention.updatedAt);
  });

  it("does not call vaultStore.flush (removed in v0.2)", async () => {
    let flushCalled = false;
    const vaultStoreWithFlush: VaultStore = {
      ...createMockVaultStore(false),
      flush: async () => { flushCalled = true; },
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
    expect(flushCalled).toBe(false);
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
