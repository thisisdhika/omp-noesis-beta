"use strict";

/**
 * Unit tests for StateManager — in-memory state with atomic persistence.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { StateManager } from "../../../src/infrastructure/state-manager.js";
import { writeAtomic } from "../../../src/infrastructure/filesystem-store.js";
import { CURRENT_VERSION, EMPTY_STATE } from "../../../src/schema.js";
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

describe("StateManager", () => {
  it("should create state.json with EMPTY_STATE on initialize", async () => {
    const sm = new StateManager(tempDir.path);
    await sm.initialize();

    const onDisk = await Bun.file(statePath(tempDir.path)).json();
    expect(onDisk.version).toBe(CURRENT_VERSION);
    expect(onDisk.attention).toBeDefined();
    expect(onDisk.belief).toBeDefined();
    expect(onDisk.inference).toBeDefined();
    expect(onDisk.commitment).toBeDefined();
    expect(onDisk.learning).toBeDefined();
  });

  it("should return state from read() after initialize", async () => {
    const sm = new StateManager(tempDir.path);
    await sm.initialize();

    const state = sm.read();
    expect(state.version).toBe(CURRENT_VERSION);
    expect(state.attention).toBeDefined();
    expect(state.belief).toBeDefined();
  });

  it("should persist mutations to disk via mutate()", async () => {
    const sm = new StateManager(tempDir.path);
    await sm.initialize();

    const newFocus = "testing mutation";
    await sm.mutate((s) => {
      s.attention.focus = newFocus;
    });

    const onDisk = await Bun.file(statePath(tempDir.path)).json();
    expect(onDisk.attention.focus).toBe(newFocus);
  });

  it("should make mutations readable after reload", async () => {
    const sm = new StateManager(tempDir.path);
    await sm.initialize();

    const newFocus = "reloaded data";
    await sm.mutate((s) => {
      s.attention.focus = newFocus;
    });

    // Reload from disk
    await sm.invalidate();
    expect(sm.read().attention.focus).toBe(newFocus);
  });

  it("should fall back to EMPTY_STATE when file contains corrupt JSON", async () => {
    // Create the state directory, then write corrupt content
    const sm = new StateManager(tempDir.path);
    await Bun.write(statePath(tempDir.path), "not valid json{{{");

    await sm.initialize();

    const state = sm.read();
    expect(state.version).toBe(CURRENT_VERSION);

    // The corrupt file should have been overwritten with valid state
    const onDisk = await Bun.file(statePath(tempDir.path)).json();
    expect(onDisk.version).toBe(CURRENT_VERSION);
  });

  it("should reload state from disk on invalidate when external changes occur", async () => {
    const sm = new StateManager(tempDir.path);
    await sm.initialize();

    // Mutate via the manager
    await sm.mutate((s) => {
      s.attention.focus = "manager value";
    });

    // Directly overwrite the file with different data (simulating external change)
    const externalFocus = "external value";
    await writeAtomic(statePath(tempDir.path), {
      ...EMPTY_STATE,
      attention: { ...EMPTY_STATE.attention, focus: externalFocus },
    });

    // Reload
    await sm.invalidate();
    expect(sm.read().attention.focus).toBe(externalFocus);
  });

  it("should create fresh state when file is missing", async () => {
    const sm = new StateManager(tempDir.path);
    await sm.initialize();

    // State file should now exist
    const filePath = statePath(tempDir.path);
    const file = Bun.file(filePath);
    expect(await file.exists()).toBeTrue();

    // Content should be a valid state
    const content = await file.json();
    expect(content.version).toBe(CURRENT_VERSION);
  });
});
