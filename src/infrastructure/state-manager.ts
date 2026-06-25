"use strict";

/**
 * omp-noesis: State Manager
 * Version: 1.0.0
 *
 * Wraps filesystem-store and migrations to provide an in-memory
 * cognitive state that can be read, mutated, persisted, and reloaded.
 */

import { join } from "node:path";
import { type NoesisState, NoesisStateSchema, EMPTY_STATE } from "../shared/schema.js";

import { writeAtomic, readJSON } from "./filesystem-store.js";
import { migrate } from "./migrations.js";
import { deepClone, deepMergeDefaults } from "../shared/clone.js";
import { ensureNoesisDir } from "../shared/paths.js";
import { type IUnitOfWork, UnitOfWork } from "./unit-of-work.js";
import { log } from "../shared/logger.js";
import type { CanonicalLedger } from "../domains/federation/schema.js";
import { emptyLedger, CanonicalLedgerSchema } from "../domains/federation/schema.js";

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
   * Inside an active lock: compare the on-disk state's lastPersisted
   * against our in-memory snapshot.  If they differ, another process
   * has written to disk since we last loaded — reject the write to
   * prevent lost updates.
   */
  async #checkDiskConflict(): Promise<void> {
    const onDisk = await readJSON(this.#statePath);
    if (onDisk !== null && typeof onDisk === "object") {
      const disk = onDisk as Record<string, unknown>;
      const diskLastPersisted = disk.lastPersisted;
      if (typeof diskLastPersisted !== "string" || diskLastPersisted !== this.#state.lastPersisted) {
        throw new Error(
          "Transaction conflict: state.json was modified by another process since last load."
        );
      }
    }
  }

  /**
   * Synchronously reload from disk if the on-disk lastPersisted differs
   * from the in-memory snapshot. This prevents callers from operating on
   * stale state without destroying optimistic concurrency checks at
   * commit time.
   * If the file is missing or corrupt, the in-memory state is preserved.
   */
  #refreshIfStale(): void {
    let raw: unknown;
    try {
      raw = readJSON(this.#statePath);
    } catch {
      // File missing or corrupt — preserve in-memory state
      return;
    }
    if (raw === null || typeof raw !== "object") return;
    const disk = raw as Record<string, unknown>;
    if (typeof disk.lastPersisted !== "string") return;
    if (disk.lastPersisted === this.#state.lastPersisted) return;

    // On-disk state is newer — merge, migrate, and adopt
    const merged = deepMergeDefaults(
      EMPTY_STATE as unknown as Record<string, unknown>,
      disk,
    );
    const migrated = migrate(merged);
    try {
      NoesisStateSchema.parse(migrated);
      this.#state = migrated;
    } catch {
      log.warn("[StateManager] Refresh-if-stale: on-disk state failed schema validation, keeping in-memory");
    }
  }

  /**
   * Load state from disk, or create and persist a fresh EMPTY_STATE.
   * Gracefully handles missing file (null returned by readJSON)
   * and malformed JSON (readJSON throws → caught below).
   */
  async initialize(preserveData?: Record<string, unknown>): Promise<void> {
    let loaded: unknown;
    try {
      loaded = await readJSON(this.#statePath);
    } catch (err: unknown) {
      // JSON parse errors are recoverable — rebuild from EMPTY_STATE
      if (err instanceof SyntaxError) {
        log.warn("[StateManager] Corrupt state file, rebuilding from EMPTY_STATE", err.message);
        loaded = null;
      } else {
        // I/O errors (permissions, disk failure) — do not destroy existing data
        log.error("[StateManager] CRITICAL: I/O error reading state — preserving on-disk data", err);
        throw err;
      }
    }

    if (loaded === null && preserveData && preserveData["omp-noesis"]) {
      loaded = preserveData["omp-noesis"];
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
      const migrated = migrate(merged);
      try {
        NoesisStateSchema.parse(migrated);
        this.#state = migrated;
        if (preserveData && preserveData.noesis && loaded === preserveData.noesis) {
          await writeAtomic(this.#statePath, this.#state);
        }
      } catch (validationErr) {
        log.warn("[StateManager] Invalid state schema, falling back to EMPTY_STATE", validationErr);
        this.#state = deepClone(EMPTY_STATE);
        await writeAtomic(this.#statePath, this.#state);
      }
    }
  }
  /** Expose current in-memory state as readonly. */
  read(): Readonly<NoesisState> {
    this.#refreshIfStale();
    return this.#state;
  }

  /**
   * Apply a mutation function to a clone of the in-memory state, validate
   * the schema, update the lastPersisted timestamp, then atomically persist to disk
   * and update the in-memory state. If any step fails, the in-memory state
   * is untouched. Returns the mutated state for convenience.
   */
  async mutate(fn: (state: NoesisState) => void): Promise<NoesisState> {
    this.#refreshIfStale();
    const clone = deepClone(this.#state);
    fn(clone);
    clone.lastPersisted = new Date().toISOString();
    NoesisStateSchema.parse(clone);
    await this.#withLock(async () => {
      await this.#checkDiskConflict();
      await writeAtomic(this.#statePath, clone);
      this.#state = clone;
    });
    return this.#state;
  }

  /**
   * Create a UnitOfWork instance that operates on a cloned state,
   * with optimistic concurrency lock checks on commit.
   */
  createUnitOfWork(): IUnitOfWork {
    this.#refreshIfStale();
    const clone = deepClone(this.#state);
    const originalLastPersisted = clone.lastPersisted;

    const commitFn = async (committedState: NoesisState) => {
      if (originalLastPersisted !== this.#state.lastPersisted) {
        throw new Error(
          "Transaction conflict: cognitive state was modified by another task since Unit of Work was opened."
        );
      }

      NoesisStateSchema.parse(committedState);
      committedState.lastPersisted = new Date().toISOString();

      await this.#withLock(async () => {
        if (originalLastPersisted !== this.#state.lastPersisted) {
          throw new Error(
            "Transaction conflict: cognitive state was modified by another task since Unit of Work was opened."
          );
        }
        await this.#checkDiskConflict();
        await writeAtomic(this.#statePath, committedState);
        this.#state = deepClone(committedState);
      });
    };

    return new UnitOfWork(clone, commitFn);
  }

  /**
   * Lazy-write the attention layer to disk without touching the
   * full state's lastPersisted timestamp.  Reads the on-disk state,
   * replaces its attention layer with the in-memory value, and
   * writes back atomically.  No-op if the file does not yet exist.
   */
  async checkpointAttention(): Promise<void> {
    await this.#withLock(async () => {
      try {
        const onDisk = await readJSON(this.#statePath);
        if (onDisk !== null) {
          const migrated = migrate(onDisk);
          migrated.attention = this.#state.attention;
          NoesisStateSchema.parse(migrated);
          await writeAtomic(this.#statePath, migrated);
          // Sync our in-memory lastPersisted to match what was written to disk,
          // so subsequent mutate/UoW calls don't see a false conflict.
          this.#state.lastPersisted = migrated.lastPersisted;
        }
      } catch (err: unknown) {
        log.warn("[StateManager] Failed to checkpoint attention due to read/parse error", err);
      }
    });
  }

  /** Force reload from disk, re-running initialize logic. */
  async invalidate(): Promise<void> {
    await this.initialize();
  }

  // ============================================================================
  // FEDERATION LEDGER
  // ============================================================================

  /**
   * Load the federation ledger from .omp/noesis/ledger.json.
   * Returns null if the file doesn't exist.
   */
  async loadLedger(): Promise<CanonicalLedger | null> {
    const ledgerPath = join(this.#statePath, "..", "ledger.json");
    try {
      const raw = readJSON(ledgerPath);
      if (raw === null) return null;
      return CanonicalLedgerSchema.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Save the federation ledger to .omp/noesis/ledger.json.
   */
  async saveLedger(ledger: CanonicalLedger): Promise<void> {
    const ledgerPath = join(this.#statePath, "..", "ledger.json");
    // Validate before write
    CanonicalLedgerSchema.parse(ledger);
    await writeAtomic(ledgerPath, ledger);
  }
}
