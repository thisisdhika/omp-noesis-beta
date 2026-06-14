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
import { NoesisStateSchema, CURRENT_VERSION, EMPTY_STATE, type NoesisState } from "../schema.js";
import { runMigrations } from "./migrations.js";
import { nowISO } from "../shared/time.js";
import { statePath, ensureDir } from "../shared/paths.js";
import { clone } from "../shared/clone.js";

export { statePath } from "../shared/paths.js";

export function loadState(root: string): NoesisState {
  const path = statePath(root);
  if (!existsSync(path)) return EMPTY_STATE();

  try {
    const parsed = NoesisStateSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
    return parsed.version < CURRENT_VERSION ? runMigrations(parsed) : parsed;
  } catch {
    return EMPTY_STATE();
  }
}

function stripTransientFindings(state: NoesisState): NoesisState {
  delete state.attention.graphFindings;
  delete state.attention.__graphFindings;
  return state;
}

export function saveState(root: string, state: NoesisState): void {
  const cloneState = stripTransientFindings(clone(state));
  cloneState.lastPersisted = nowISO();

  const json = JSON.stringify(cloneState, null, 2);
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
