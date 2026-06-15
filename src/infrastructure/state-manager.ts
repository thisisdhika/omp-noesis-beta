"use strict";

/**
 * omp-noesis: State Manager
 * Version: 0.1.0
 *
 * Wraps filesystem-store and migrations to provide an in-memory
 * cognitive state that can be read, mutated, persisted, and reloaded.
 */

import { join } from "node:path";
import { type NoesisState, EMPTY_STATE } from "../schema.js";
import { writeAtomic, readJSON } from "./filesystem-store.js";
import { migrate } from "./migrations.js";
import { deepClone } from "../shared/clone.js";
import { ensureNoesisDir } from "../shared/paths.js";

export class StateManager {
  #state!: NoesisState;
  #statePath: string;

  constructor(projectRoot: string) {
    ensureNoesisDir(projectRoot);
    this.#statePath = join(projectRoot, ".omp", "noesis", "state.json");
  }

  /**
   * Load state from disk, or create and persist a fresh EMPTY_STATE.
   * Gracefully handles missing file (null returned by readJSON)
   * and malformed JSON (readJSON throws → caught below).
   */
  async initialize(): Promise<void> {
    try {
      const loaded = await readJSON<Record<string, unknown>>(this.#statePath);
      if (loaded === null) {
        this.#state = deepClone(EMPTY_STATE);
        await writeAtomic(this.#statePath, this.#state);
      } else {
        this.#state = migrate(loaded);
      }
    } catch {
      this.#state = deepClone(EMPTY_STATE);
      await writeAtomic(this.#statePath, this.#state);
    }
  }

  /** Expose current in-memory state as readonly. */
  read(): Readonly<NoesisState> {
    return this.#state;
  }

  /**
   * Apply a mutation function to the in-memory state, update the
   * lastPersisted timestamp, then atomically persist to disk.
   * Returns the mutated state for convenience.
   */
  async mutate(fn: (state: NoesisState) => void): Promise<NoesisState> {
    fn(this.#state);
    this.#state.lastPersisted = new Date().toISOString();
    await writeAtomic(this.#statePath, this.#state);
    return this.#state;
  }

  /**
   * Lazy-write the attention layer to disk without touching the
   * full state's lastPersisted timestamp.  Reads the on-disk state,
   * replaces its attention layer with the in-memory value, and
   * writes back atomically.  No-op if the file does not yet exist.
   */
  async checkpointAttention(): Promise<void> {
    const onDisk = await readJSON<Record<string, unknown>>(this.#statePath);
    if (onDisk !== null) {
      (onDisk as Record<string, unknown>).attention = this.#state.attention;
      await writeAtomic(this.#statePath, onDisk);
    }
  }

  /** Force reload from disk, re-running initialize logic. */
  async invalidate(): Promise<void> {
    await this.initialize();
  }
}
