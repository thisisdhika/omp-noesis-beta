import type { NoesisState } from "../schema.js";
import { CURRENT_VERSION } from "../schema.js";

/**
 * Registry of migration functions keyed by source version (the version they
 * upgrade FROM). Each function receives a deep clone of the state at that
 * version and must return a state at the next version.
 *
 * Initially empty — v1 is the current schema version.
 */
export const MIGRATIONS: Record<number, (s: NoesisState) => NoesisState> = {};

/**
 * Run all pending migrations on `state` to bring it up to CURRENT_VERSION.
 * Each migration works on a deep clone. Throws on failure without side effects
 * on the original state object.
 */
export function runMigrations(state: NoesisState): NoesisState {
  let current = JSON.parse(JSON.stringify(state)) as NoesisState;
  const from = current.version;
  const to = CURRENT_VERSION;

  for (let v = from; v < to; v++) {
    const migrate = MIGRATIONS[v];
    if (!migrate) {
      // No migration registered for this version — skip (future-proofing).
      continue;
    }
    // Run migration on a clone to avoid partial mutation on throw.
    const snapshot = JSON.parse(JSON.stringify(current)) as NoesisState;
    current = migrate(snapshot);
    current.version = v + 1;
  }

  return current;
}
