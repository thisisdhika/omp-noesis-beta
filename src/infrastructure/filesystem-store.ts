import {
  existsSync,
  openSync,
  readFileSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  renameSync,
} from "node:fs";
import { dirname } from "node:path";

import { NoesisStateSchema, CURRENT_VERSION, EMPTY_STATE } from "../schema.js";
import type { NoesisState } from "../schema.js";
import { runMigrations } from "./migrations.js";
import { nowISO } from "../shared/time.js";
import { statePath, ensureDir } from "../shared/paths.js";

export { statePath } from "../shared/paths.js";

/**
 * Load cognitive state from disk.
 *
 * Returns `EMPTY_STATE()` when the file does not exist.
 * Validates with `NoesisStateSchema` and runs pending migrations if the
 * stored version is behind `CURRENT_VERSION`.
 */
export function loadState(root: string): NoesisState {
  const path = statePath(root);

  if (!existsSync(path)) {
    return EMPTY_STATE();
  }

  const raw = JSON.parse(readFileSync(path, "utf-8"));
  const parsed: NoesisState = NoesisStateSchema.parse(raw);

  if (parsed.version < CURRENT_VERSION) {
    return runMigrations(parsed);
  }

  return parsed;
}

/**
 * Persist cognitive state to disk using an atomic write pattern:
 *   1. Serialize to a temporary file next to the target.
 *   2. `fsync` the temporary file.
 *   3. `rename` (atomic on POSIX) over the final path.
 *
 * All operations are synchronous.
 */
export function saveState(root: string, state: NoesisState): void {
  const clone = JSON.parse(JSON.stringify(state)) as NoesisState & {
    attention?: Record<string, unknown>;
  };
  if (clone.attention) {
    delete clone.attention.graphFindings;
  }
  clone.lastPersisted = nowISO();

  const json = JSON.stringify(clone, null, 2);
  const finalPath = statePath(root);
  const tempPath = `${finalPath}.tmp.${process.pid}`;

  ensureDir(dirname(tempPath));

  const fd = openSync(tempPath, "w");
  try {
    writeFileSync(fd, json, "utf-8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }

  renameSync(tempPath, finalPath);
}
