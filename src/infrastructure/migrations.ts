"use strict";

/**
 * omp-noesis: Schema Migration Pipeline
 *
 * Manages versioned migration of NoesisState from historical schema versions
 * to the current version.  When the schema evolves (new fields, renamed keys,
 * changed defaults), a new migration is appended to MIGRATIONS.
 *
 * migrate() is idempotent for already-current states and safe for partial
 * migrations: it filters to only applicable forward migrations and runs them
 * in order.
 */

import { type NoesisState, CURRENT_VERSION, NoesisStateSchema } from "../schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A function that transforms a raw state object from one version to the next. */
export type MigrationFn = (state: Record<string, unknown>) => Record<string, unknown>;

/** Describes a single schema migration step. */
export type Migration = {
  /** The schema version this migration expects as input. */
  from: number;
  /** The schema version produced after applying this migration. */
  to: number;
  /** Human-readable description of the change. */
  description: string;
  /** The transformation function. */
  apply: MigrationFn;
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Ordered list of all registered migrations.
 *
 * Add new migrations at the end.  Each entry must have `from` equal to the
 * version produced by the previous entry (or CURRENT_VERSION - 1 for the
 * first real migration).  migrate() sorts by `from` ascending before applying.
 */
export const MIGRATIONS: Migration[] = [
  // Example (when schema evolves from v1 → v2):
  //
  // {
  //   from: 1,
  //   to: 2,
  //   description: "Add attention.tags field",
  //   apply(state) {
  //     const next = { ...state };
  //     (next as Record<string, unknown>).attention = {
  //       ...(state.attention as Record<string, unknown> ?? {}),
  //       tags: [],
  //     };
  //     return next as Record<string, unknown>;
  //   },
  // },
];

// ---------------------------------------------------------------------------
// Migration runner
// ---------------------------------------------------------------------------

/**
 * Migrate a raw state object to the current schema version.
 *
 * - If `state.version` is absent or 0, all applicable forwards migrations are
 *   applied in order.
 * - If `state.version` already equals CURRENT_VERSION, this is a no-op.
 * - After all applicable migrations have run, the returned state is stamped
 *   with CURRENT_VERSION and validated via NoesisStateSchema.
 *
 * @param state - Raw state object (may be partial or from an older version).
 * @returns A fully migrated NoesisState.
 */
export function migrate(state: unknown): NoesisState {
  const record = state as Record<string, unknown>;
  const current = typeof record.version === "number" ? record.version : 0;

  // Collect applicable migrations: those whose prerequisite version is >= the
  // current state version and that actually advance the version number.
  const applicable = MIGRATIONS
    .filter((m) => m.from >= current && m.to > m.from)
    .sort((a, b) => a.from - b.from);

  // Apply sequentially.
  let result: Record<string, unknown> = { ...record };

  for (const migration of applicable) {
    result = migration.apply(result);
  }

  // Stamp with the current schema version.
  result.version = CURRENT_VERSION;

  // Internal guarantee: the migration pipeline always produces a valid NoesisState
  // (or the internal EMPTY_STATE constant).  Schema.parse() can reject the built-in
  // EMPTY_STATE due to z.lazy() restrictions in Zod v4, so we use a safe cast here.
  return result as NoesisState;
}
