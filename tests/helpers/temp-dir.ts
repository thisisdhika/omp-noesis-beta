"use strict";

/**
 * Temporary directory management for tests.
 */

import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { sep } from "node:path";

/** Create a temporary directory. Caller MUST call cleanup(). */
export function createTempDir(): { path: string; cleanup(): void } {
  const path = mkdtempSync(join(import.meta.dirname ?? process.cwd(), ".test-"));
  return {
    path,
    cleanup() {
      if (existsSync(path)) {
        rmSync(path, { recursive: true, force: true });
      }
    },
  };
}
