"use strict";

/**
 * Unit tests for StateManager — in-memory state with atomic persistence.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { StateManager } from "../../../src/infrastructure/state-manager.js";
import { writeAtomic } from "../../../src/infrastructure/filesystem-store.js";
import { CURRENT_VERSION, EMPTY_STATE } from "../../../src/shared/schema.js";
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

  it("should silently incorporate external changes when state.json was modified externally before mutate", async () => {
    const sm = new StateManager(tempDir.path);
    await sm.initialize();

    // Simulate another process writing to the same state file
    const onDisk = await Bun.file(statePath(tempDir.path)).json();
    const oldFocus = onDisk.attention.focus;
    onDisk.attention.focus = "other-process-focus";
    onDisk.lastPersisted = new Date(Date.now() + 1000).toISOString();
    await writeAtomic(statePath(tempDir.path), onDisk);

    // Our mutate silently pulls in external changes via #refreshIfStale(),
    // then applies the local mutation on top — no OCC conflict because
    // we refreshed before cloning.
    await sm.mutate((s) => {
      s.attention.focus = "our-focus";
    });

    // In-memory state has our mutation applied on top of refreshed external state
    expect(sm.read().attention.focus).toBe("our-focus");

    // Disk state also has our mutation (and preserved external fields)
    const diskAfter = await Bun.file(statePath(tempDir.path)).json();
    expect(diskAfter.attention.focus).toBe("our-focus");
  });

  it("should reflect external writes via read() without calling invalidate", async () => {
    const sm = new StateManager(tempDir.path);
    await sm.initialize();

    expect(sm.read().attention.focus).toBe("");

    // External write with a distinct lastPersisted
    const externalFocus = "external-value";
    const onDisk = await Bun.file(statePath(tempDir.path)).json();
    onDisk.attention.focus = externalFocus;
    onDisk.lastPersisted = new Date(Date.now() + 1000).toISOString();
    await writeAtomic(statePath(tempDir.path), onDisk);

    // read() calls #refreshIfStale() internally, so external state is visible
    // without an explicit invalidate() call.
    expect(sm.read().attention.focus).toBe(externalFocus);
  });

  it("should refresh from disk before createUnitOfWork so commit succeeds after external write", async () => {
    const sm = new StateManager(tempDir.path);
    await sm.initialize();

    await sm.mutate((s) => { s.attention.focus = "baseline"; });
    expect(sm.read().attention.focus).toBe("baseline");

    // External write with a distinct lastPersisted
    const onDisk = await Bun.file(statePath(tempDir.path)).json();
    onDisk.attention.focus = "external-process";
    onDisk.lastPersisted = new Date(Date.now() + 1000).toISOString();
    await writeAtomic(statePath(tempDir.path), onDisk);

    // UoW is constructed from refreshed state (not the stale baseline)
    const uow = sm.createUnitOfWork();
    expect(uow.attention.get().focus).toBe("external-process");

    // Modify and commit — succeeds without false conflict because
    // createUnitOfWork refreshed the snapshot before capturing it.
    uow.attention.update({ focus: "uow-change" });
    await uow.commit();

    expect(sm.read().attention.focus).toBe("uow-change");
    const diskAfter = await Bun.file(statePath(tempDir.path)).json();
    expect(diskAfter.attention.focus).toBe("uow-change");
  });
});

