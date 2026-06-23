"use strict";

/**
 * Atomic filesystem operations for JSON state persistence.
 * Version: 1.0.0
 *
 * writeAtomic uses write-to-temp + rename for crash safety.
 * readJSON handles missing files gracefully.
 */

import {
  existsSync,
  readFileSync,
  openSync,
  closeSync,
  fsyncSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { dirname } from "node:path";

/** Monotonic counter to make temp filenames unique per call (race-safe for concurrent writeAtomic). */
let _atomicCounter = 0;
// ============================================================================
// WRITE (ATOMIC)
// ============================================================================

/**
 * Write `data` to `path` atomically.
 *
 * The file is first written to a sibling temp file (`<path>.tmp.<pid>`),
 * fsynced, then atomically renamed over the target path.  The parent
 * directory is also fsynced after the rename to ensure the metadata is
 * durable.
 *
 * On any error the temp file is cleaned up and the error is rethrown.
 */
export async function writeAtomic(path: string, data: unknown): Promise<void> {
  const tempPath = `${path}.tmp.${process.pid}.${Date.now()}.${++_atomicCounter}`;

  try {
    // Write to temp file
    await Bun.write(tempPath, JSON.stringify(data, null, 2) + "\n");

    // Atomic rename — same filesystem so this is instantaneous.
    // Bun.write already flushes; the rename provides atomicity.
    renameSync(tempPath, path);

    // Fsync parent directory so the rename metadata is durable
    const parentDir = dirname(path);
    const dirFd = openSync(parentDir, "r");
    try {
      fsyncSync(dirFd);
    } finally {
      closeSync(dirFd);
    }
  } catch (err) {
    // Best-effort cleanup of temp file before rethrowing
    try {
      unlinkSync(tempPath);
    } catch {
      // Ignore cleanup failures — the original error is what matters
    }
    throw err;
  }
}

// ============================================================================
// READ
// ============================================================================

/**
 * Read and parse a JSON file from `path`.
 * Returns `null` when the file does not exist.
 * Throws `SyntaxError` on malformed JSON.
 * Propagates I/O errors (permissions, disk failure).
 */
export function readJSON(path: string): unknown {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw);
}

// ============================================================================
// EXISTS
// ============================================================================

/**
 * Return `true` if a file exists at `path` and is readable.
 */
export function fileExists(path: string): boolean {
  return existsSync(path);
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/** Narrow an unknown error to check for ENOENT (file not found). */
function isErrnoENOENT(err: unknown): err is NodeJS.ErrnoException {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}
