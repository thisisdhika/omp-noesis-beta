"use strict";

/**
 * Unit tests for StateManager.checkpointAttention — lazy attention write.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { StateManager } from "../../../src/infrastructure/state-manager.js";
import { writeAtomic, readJSON } from "../../../src/infrastructure/filesystem-store.js";
import { EMPTY_STATE } from "../../../src/shared/schema.js";
import { createTempDir } from "../../helpers/temp-dir.js";

// ============================================================================
// Helpers
// ============================================================================

interface TempDir {
  path: string;
  cleanup(): void;
}

function statePath(root: string): string {
  return join(root, ".omp", "noesis", "state.json");
}

let tempDir: TempDir;

beforeEach(() => {
  tempDir = createTempDir();
});

afterEach(() => {
  tempDir.cleanup();
});

// ============================================================================
// Tests
// ============================================================================

describe("StateManager checkpointAttention", () => {
  it("should persist attention layer to disk", async () => {
    const sm = new StateManager(tempDir.path);
    await sm.initialize();

    await sm.mutate((s) => {
      s.attention.focus = "checkpoint-focus";
    });

    await sm.checkpointAttention();

    const onDisk = await readJSON(statePath(tempDir.path)) as Record<string, unknown> | null;
    expect(onDisk).not.toBeNull();
    expect((onDisk!.attention as Record<string, unknown>).focus).toBe("checkpoint-focus");
  });

  it("should not update lastPersisted timestamp", async () => {
    const sm = new StateManager(tempDir.path);
    await sm.initialize();

    await sm.mutate((s) => {
      s.attention.focus = "original";
    });
    const persistedAfterMutate = sm.read().lastPersisted;

    await sm.checkpointAttention();

    const onDisk = await readJSON(statePath(tempDir.path)) as Record<string, unknown> | null;
    expect(onDisk).not.toBeNull();
    expect(onDisk!.lastPersisted).toBe(persistedAfterMutate);
  });

  it("should be no-op when state file does not exist", async () => {
    const sm = new StateManager(tempDir.path);
    // No initialize call — no state file on disk
    await expect(sm.checkpointAttention()).resolves.toBeUndefined();
  });

  it("should preserve other fields on disk", async () => {
    const sm = new StateManager(tempDir.path);
    await sm.initialize();

    // Directly write a state with known belief data
    const now = new Date().toISOString();
    await writeAtomic(statePath(tempDir.path), {
      ...EMPTY_STATE,
      attention: { ...EMPTY_STATE.attention, focus: "original" },
      belief: {
        facts: [{ id: "bf-testfact", content: "test claim", confidence: 0.8, source: "user", createdAt: now, updatedAt: now, status: "active" }],
        decisions: [],
      },
    });

    // Reload from disk so in-memory matches what we wrote
    await sm.invalidate();
    await sm.mutate((s) => {
      s.attention.focus = "checkpointed";
    });

    await sm.checkpointAttention();

    const onDisk = await readJSON(statePath(tempDir.path)) as Record<string, unknown> | null;
    expect(onDisk).not.toBeNull();

    // Verify attention was updated by checkpoint
    expect((onDisk!.attention as Record<string, unknown>).focus).toBe("checkpointed");

    // Verify other fields survived
    const beliefOnDisk = onDisk!.belief as Record<string, unknown>;
    expect(Array.isArray(beliefOnDisk.facts)).toBeTrue();
    expect((beliefOnDisk.facts as Array<Record<string, unknown>>)[0]!.id).toBe("bf-testfact");
  });
});
