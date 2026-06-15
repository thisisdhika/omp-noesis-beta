"use strict";

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Filesystem path utilities.
 */


/** Ensure the noesis state directory exists under the project root. */
export function ensureNoesisDir(projectRoot: string): string {
  const dir = join(projectRoot, ".omp", "noesis");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Validate that a graphify output path exists and contains graph.json. */
export function validateGraphPath(projectRoot: string): string | null {
  const defaultPath = join(projectRoot, "graphify-out", "graph.json");
  if (existsSync(defaultPath)) return defaultPath;
  return null;
}
