"use strict";

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Filesystem path utilities.
 * Version: 1.0.0
 */


/** Ensure the noesis state directory exists under the project root. */
export function ensureNoesisDir(projectRoot: string): string {
  const dir = join(projectRoot, ".omp", "noesis");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/** Validate that a graphify output path exists and contains graph.json. */
export function validateGraphPath(projectRoot: string): string | null {
  const defaultPath = join(projectRoot, "graphify-out", "graph.json");
  if (existsSync(defaultPath)) return defaultPath;
  return null;
}
