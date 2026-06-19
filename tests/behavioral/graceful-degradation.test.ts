"use strict";

import { describe, it, expect } from "bun:test";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { createTempDir } from "../helpers/temp-dir.js";
import { StateManager } from "../../src/infrastructure/state-manager.js";
import { cloneState } from "../helpers/fixtures.js";
import type { NoesisState } from "../../src/shared/schema.js";
import { NoopVaultStore } from "../../src/vault/noop-vault-store.js";
import type { VaultArtifact } from "../../src/vault/vault-store.js";
import { addFact, getActiveFacts } from "../../src/domains/belief/belief-domain.js";
import { addLearning, getRankedLearning } from "../../src/domains/learning/learning-domain.js";
import { buildSurvivorContext } from "../../src/rendering/survivor-builder.js";
import { resolveFocus, resolveFiles } from "../../src/rendering/focus-resolver.js";

describe("graceful degradation — StateManager", () => {
  it("should initialize with EMPTY_STATE when state file is missing", async () => {
    const { path, cleanup } = createTempDir();
    try {
      // Ensure .omp/noesis directory exists (StateManager constructor creates it)
      mkdirSync(join(path, ".omp", "noesis"), { recursive: true });

      const manager = new StateManager(path);
      await manager.initialize();

      const state = manager.read();
      expect(state.version).toBe(1);
      expect(state.attention.focus).toBe("");
      expect(state.belief.facts).toHaveLength(0);
      expect(state.learning.successes).toHaveLength(0);
      expect(state.commitment.workflow.status).toBe("draft");
      expect(state.attention.priority).toBe("normal");
    } finally {
      cleanup();
    }
  });

  it("should fall back to EMPTY_STATE when state file contains malformed JSON", async () => {
    const { path, cleanup } = createTempDir();
    try {
      // Write malformed JSON to state path before initializing
      const stateDir = join(path, ".omp", "noesis");
      mkdirSync(stateDir, { recursive: true });
      writeFileSync(join(stateDir, "state.json"), "{{broken json,,}", "utf-8");

      const manager = new StateManager(path);
      await manager.initialize();

      const state = manager.read();
      expect(state.version).toBe(1);
      expect(state.attention.focus).toBe("");
      expect(state.belief.facts).toHaveLength(0);
      expect(state.learning.failures).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it("should persist and reload mutated state", async () => {
    const { path, cleanup } = createTempDir();
    try {
      const manager = new StateManager(path);
      await manager.initialize();

      await manager.mutate((s: NoesisState) => {
        s.attention.focus = "Test focus after mutation";
      });

      const state = manager.read();
      expect(state.attention.focus).toBe("Test focus after mutation");

      // Re-initialize to verify persistence
      await manager.invalidate();
      const reloaded = manager.read();
      expect(reloaded.attention.focus).toBe("Test focus after mutation");
    } finally {
      cleanup();
    }
  });
});

describe("graceful degradation — EMPTY_STATE is usable", () => {
  it("should not crash when calling belief domain functions on EMPTY_STATE", () => {
    const state = cloneState();

    const fact = addFact(state, {
      content: "First principle thinking is effective",
      confidence: 0.85,
      source: "inference",
    });
    expect(fact.status).toBe("active");

    const active = getActiveFacts(state);
    expect(active).toHaveLength(1);
  });

  it("should not crash when calling learning domain functions on EMPTY_STATE", () => {
    const state = cloneState();

    const entry = addLearning(state, {
      description: "Learned from empty slate",
      isSuccess: true,
    });
    expect(entry.status).toBe("captured");

    const ranked = getRankedLearning(state);
    expect(ranked).toHaveLength(1);
  });

  it("should not crash when building survivor context from EMPTY_STATE", () => {
    const state = cloneState();

    const xml = buildSurvivorContext(state);
    expect(xml).toContain("<noesis-state>");
    expect(xml).toContain("<focus>");
    expect(xml).toContain("<priority>normal</priority>");
    expect(xml).toContain('<pointer>.omp/noesis/state.json</pointer>');
  });

  it("should resolve focus from EMPTY_STATE to default without crashing", () => {
    const state = cloneState();

    const focus = resolveFocus(state);
    expect(focus).toBe("Investigate the current task");

    const files = resolveFiles(state);
    expect(files).toEqual([]);
  });
});

describe("graceful degradation — NoopVaultStore", () => {
  it("should return empty results from pull", async () => {
    const store = new NoopVaultStore();

    const result = await store.pull();
    expect(result.artifacts).toEqual([]);
    expect(result.source).toBe("noop");
    expect(result.timestamp).toBeDefined();
  });

  it("should silently discard pushed artifacts", async () => {
    const store = new NoopVaultStore();
    const artifact: VaultArtifact = {
      id: "test-artifact",
      kind: "decision",
      projectPath: "/tmp/test",
      content: "Some decision",
      pushedAt: new Date().toISOString(),
    };

    // Should not throw
    await expect(store.push(artifact)).resolves.toBeUndefined();

    // Confirm nothing was stored
    const results = await store.pull();
    expect(results.artifacts).toHaveLength(0);
  });

  it("should return false from validate", async () => {
    const store = new NoopVaultStore();

    const valid = await store.validate();
    expect(valid).toBe(false);
  });

  it("should return empty results regardless of kind filter", async () => {
    const store = new NoopVaultStore();

    const result = await store.pull("decision", 50);
    expect(result.artifacts).toEqual([]);
  });
});
