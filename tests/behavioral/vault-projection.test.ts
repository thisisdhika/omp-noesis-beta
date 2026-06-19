"use strict";

/**
 * Vault Projection Behavioral Tests
 *
 * Verifies that the turn-end hook does not call vault flush
 * (flush was removed in v0.2 when memory backends were deleted).
 * Obsidian projection operates independently.
 */
import { describe, it, expect } from "bun:test";
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir } from "../helpers/temp-dir.js";
import { createMockPi, toExtensionAPI } from "../helpers/mock-pi.js";
import { StateManager } from "../../src/infrastructure/state-manager.js";
import { registerTurnEndHook } from "../../src/hooks/turn-end-hook.js";
import { createVaultStore } from "../../src/vault/vault-detector.js";
import { executeBelieveFact, executeBelieveDecision } from "../../src/tools/believe-tool.js";
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

// ============================================================================
// v0.3: Belief fact vault projection
// ============================================================================

describe("vault projection — belief fact writes", () => {
  it("projects a belief fact artifact when Obsidian vault backend exists", async () => {
    const dir = createTempDir();
    try {
      // Create .obsidian/ so the vault detector picks up ObsidianVaultStore
      mkdirSync(join(dir.path, ".obsidian"), { recursive: true });

      const stateManager = new StateManager(dir.path);
      await stateManager.initialize();

      const vaultStore = await createVaultStore(dir.path);
      const runtime: NoesisRuntime = { projectRoot: dir.path, stateManager, vaultStore };

      const result = await executeBelieveFact(runtime, {
        content: "Vault-projected belief fact",
        confidence: 0.9,
        source: "user",
        tags: ["vault", "test"],
      });

      expect(result.isError).toBe(false);
      const factId = result.details.id as string;

      // Verify the vault artifact was written to disk
      const artifactPath = join(dir.path, ".obsidian", "noesis", "belief", `${factId}.md`);
      expect(existsSync(artifactPath)).toBe(true);

      const content = readFileSync(artifactPath, "utf-8");
      expect(content).toContain("Vault-projected belief fact");
      expect(content).toContain(`id: ${factId}`);
      expect(content).toContain("kind: belief");
    } finally {
      dir.cleanup();
    }
  });

  it("does not fail the belief write when vault push throws", async () => {
    const dir = createTempDir();
    try {
      const stateManager = new StateManager(dir.path);
      await stateManager.initialize();

      const brokenVaultStore: VaultStore = {
        push: async () => { throw new Error("Vault unavailable"); },
        pull: async () => ({ artifacts: [], totalCount: 0, source: "local", timestamp: new Date().toISOString() }),
        search: async () => [],
        validate: async () => false,
      };

      const runtime: NoesisRuntime = { projectRoot: dir.path, stateManager, vaultStore: brokenVaultStore };

      const result = await executeBelieveFact(runtime, {
        content: "Fact that should survive vault failure",
        confidence: 0.85,
        source: "execution",
        tags: ["resilience"],
      });

      // Fact creation must still succeed despite vault error
      expect(result.isError).toBe(false);
      expect(result.details.kind).toBe("fact");
    } finally {
      dir.cleanup();
    }
  });

  it("works with no-op vault store when no .obsidian directory exists", async () => {
    const dir = createTempDir();
    try {
      const stateManager = new StateManager(dir.path);
      await stateManager.initialize();

      const vaultStore = await createVaultStore(dir.path);
      const runtime: NoesisRuntime = { projectRoot: dir.path, stateManager, vaultStore };

      const result = await executeBelieveFact(runtime, {
        content: "Fact with no vault backend",
        confidence: 0.7,
        source: "inference",
      });

      expect(result.isError).toBe(false);
      expect(result.details.kind).toBe("fact");
    } finally {
      dir.cleanup();
    }
  });
});

// ============================================================================
// v0.3: Belief decision vault projection
// ============================================================================

describe("vault projection — belief decision writes", () => {
  it("projects a decision artifact when Obsidian vault backend exists", async () => {
    const dir = createTempDir();
    try {
      mkdirSync(join(dir.path, ".obsidian"), { recursive: true });

      const stateManager = new StateManager(dir.path);
      await stateManager.initialize();

      const vaultStore = await createVaultStore(dir.path);
      const runtime: NoesisRuntime = { projectRoot: dir.path, stateManager, vaultStore };

      const result = await executeBelieveDecision(runtime, {
        content: "Vault-projected decision",
        rationale: "Testing that decisions get vault projection",
        source: "user",
        tags: ["vault", "test"],
      });

      expect(result.isError).toBe(false);
      const decisionId = result.details.id as string;

      const artifactPath = join(dir.path, ".obsidian", "noesis", "decision", `${decisionId}.md`);
      expect(existsSync(artifactPath)).toBe(true);

      const decisionContent = readFileSync(artifactPath, "utf-8");
      expect(decisionContent).toContain("Vault-projected decision");
      expect(decisionContent).toContain(`id: ${decisionId}`);
      expect(decisionContent).toContain("kind: decision");
    } finally {
      dir.cleanup();
    }
  });

  it("does not fail the decision write when vault push throws", async () => {
    const dir = createTempDir();
    try {
      const stateManager = new StateManager(dir.path);
      await stateManager.initialize();

      const brokenVaultStore: VaultStore = {
        push: async () => { throw new Error("Disk full"); },
        pull: async () => ({ artifacts: [], totalCount: 0, source: "local", timestamp: new Date().toISOString() }),
        search: async () => [],
        validate: async () => false,
      };

      const runtime: NoesisRuntime = { projectRoot: dir.path, stateManager, vaultStore: brokenVaultStore };

      const result = await executeBelieveDecision(runtime, {
        content: "Decision that survives vault failure",
        rationale: "Testing resilience",
        source: "execution",
      });

      expect(result.isError).toBe(false);
      expect(result.details.kind).toBe("decision");
    } finally {
      dir.cleanup();
    }
  });
});
