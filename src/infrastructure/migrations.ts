import type { NoesisState } from "../schema.js";
import { CURRENT_VERSION } from "../schema.js";

export const MIGRATIONS: Record<number, (state: NoesisState) => NoesisState> = {};

export function runMigrations(state: NoesisState): NoesisState {
  let current = structuredClone(state);
  for (let version = current.version; version < CURRENT_VERSION; version++) {
    const migrate = MIGRATIONS[version];
    if (!migrate) continue;
    current = migrate(structuredClone(current));
    current.version = version + 1;
  }
  return current;
}
