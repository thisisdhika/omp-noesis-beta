"use strict";

/**
 * omp-noesis: State Manager
 * Version: 0.1.0
 *
 * Wraps filesystem-store and migrations to provide an in-memory
 * cognitive state that can be read, mutated, persisted, and reloaded.
 */

import { join } from "node:path";
import { type NoesisState, NoesisStateSchema, EMPTY_STATE } from "../schema.js";

import { writeAtomic, readJSON } from "./filesystem-store.js";
import { migrate } from "./migrations.js";
import { deepClone, deepMergeDefaults } from "../shared/clone.js";
import { ensureNoesisDir } from "../shared/paths.js";

export class StateManager {
  #state!: NoesisState;
  #statePath: string;
  #writeLock: Promise<void> = Promise.resolve();

  constructor(projectRoot: string) {
    ensureNoesisDir(projectRoot);
    this.#statePath = join(projectRoot, ".omp", "noesis", "state.json");
  }

  /** Serialize concurrent disk writes via promise-chain mutex. */
  async #withLock<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.#writeLock;
    let release: () => void;
    this.#writeLock = new Promise<void>(resolve => { release = resolve; });
    await prev;
    try {
      return await fn();
    } finally {
      release!();
    }
  }

  /**
   * Load state from disk, or create and persist a fresh EMPTY_STATE.
   * Gracefully handles missing file (null returned by readJSON)
   * and malformed JSON (readJSON throws → caught below).
   */
  async initialize(): Promise<void> {
    let loaded: unknown;
    try {
      loaded = await readJSON(this.#statePath);
    } catch (err: unknown) {
      // JSON parse errors are recoverable — rebuild from EMPTY_STATE
      if (err instanceof SyntaxError) {
        console.warn("[StateManager] Corrupt state file, rebuilding from EMPTY_STATE", err.message);
        loaded = null;
      } else {
        // I/O errors (permissions, disk failure) — do not destroy existing data
        console.error("[StateManager] CRITICAL: I/O error reading state — preserving on-disk data", err);
        throw err;
      }
    }

    if (loaded === null) {
      this.#state = deepClone(EMPTY_STATE);
      await writeAtomic(this.#statePath, this.#state);
    } else {
      // Deep-merge with EMPTY_STATE so any new schema fields get their defaults.
      // migrate() only does a shallow spread — without this, fields like
      // attention.pendingEvidence would be undefined on old state files.
      const merged = deepMergeDefaults(
        EMPTY_STATE as unknown as Record<string, unknown>,
        loaded as Record<string, unknown>,
      );
      this.#state = migrate(merged);
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
    await this.#withLock(() => writeAtomic(this.#statePath, this.#state));
    return this.#state;
  }

  /**
   * Lazy-write the attention layer to disk without touching the
   * full state's lastPersisted timestamp.  Reads the on-disk state,
   * replaces its attention layer with the in-memory value, and
   * writes back atomically.  No-op if the file does not yet exist.
   */
  async checkpointAttention(): Promise<void> {
    await this.#withLock(async () => {
      const onDisk = await readJSON(this.#statePath);
      if (onDisk !== null) {
        const migrated = migrate(onDisk);
        migrated.attention = this.#state.attention;
        NoesisStateSchema.parse(migrated);
        await writeAtomic(this.#statePath, migrated);
      }
    });
  }

  /** Force reload from disk, re-running initialize logic. */
  async invalidate(): Promise<void> {
    await this.initialize();
  }
}
