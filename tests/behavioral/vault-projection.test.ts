"use strict";

/**
 * Vault Projection Behavioral Tests
 *
 * Verifies that the turn-end hook does not call vault flush
 * (flush was removed in v0.2 when memory backends were deleted).
 * Obsidian projection operates independently.
 */

import { describe, it, expect } from "bun:test";
import { createTempDir } from "../helpers/temp-dir.js";
import { createMockPi, toExtensionAPI } from "../helpers/mock-pi.js";
import { StateManager } from "../../src/infrastructure/state-manager.js";
import { registerTurnEndHook } from "../../src/hooks/turn-end-hook.js";
import type { VaultStore } from "../../src/vault/vault-store.js";
import type { NoesisRuntime } from "../../src/runtime.js";

describe("vault projection — turn-end hook (v0.2: no flush)", () => {
  it("does not call vaultStore.flush() when turn_end fires", async () => {
    const dir = createTempDir();
    try {
      let flushCalled = 0;

      const vaultStore: VaultStore = {
        push: async () => {},
        pull: async () => ({ artifacts: [], totalCount: 0, source: "local", timestamp: new Date().toISOString() }),
        search: async () => [],
        validate: async () => true,
        flush: async () => { flushCalled++; },
      };

      const stateManager = new StateManager(dir.path);
      await stateManager.initialize();

      const runtime: NoesisRuntime = {
        projectRoot: dir.path,
        stateManager,
        vaultStore,
      };

      const pi = createMockPi();
      registerTurnEndHook(toExtensionAPI(pi), runtime);

      const handlers = pi._getHooks("turn_end");
      expect(handlers).toHaveLength(1);

      // Invoke the turn_end handler — flush should NOT be called
      await (handlers[0] as (...args: unknown[]) => unknown)();
      expect(flushCalled).toBe(0);
    } finally {
      dir.cleanup();
    }
  });

  it("turn_end hook runs without crash even if vaultStore lacks flush", async () => {
    const dir = createTempDir();
    try {
      const vaultStore: VaultStore = {
        push: async () => {},
        pull: async () => ({ artifacts: [], totalCount: 0, source: "local", timestamp: new Date().toISOString() }),
        search: async () => [],
        validate: async () => true,
        // No flush method — intentionally omitted
      };

      const stateManager = new StateManager(dir.path);
      await stateManager.initialize();

      const runtime: NoesisRuntime = {
        projectRoot: dir.path,
        stateManager,
        vaultStore,
      };

      const pi = createMockPi();
      registerTurnEndHook(toExtensionAPI(pi), runtime);

      const handlers = pi._getHooks("turn_end");
      expect(handlers).toHaveLength(1);

      // Should not throw despite missing flush
      await (handlers[0] as (...args: unknown[]) => unknown)();
    } finally {
      dir.cleanup();
    }
  });
});
