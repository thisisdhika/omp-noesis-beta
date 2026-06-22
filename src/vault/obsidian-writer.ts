"use strict";

/**
 * omp-noesis: Obsidian Note Atomic Writer
 * Version: 1.0.0
 *
 * Writes a Markdown note to an Obsidian vault path using the
 * temp-then-rename pattern for atomic file creation.
 */

import {
  mkdirSync,
  writeFileSync,
  renameSync,
  openSync,
  closeSync,
  fsyncSync,
  unlinkSync,
} from "node:fs";
import { join, dirname } from "node:path";

/**
 * Write a markdown note atomically.
 *
 * Creates the target directory recursively if it does not exist,
 * writes content to a temporary file, then atomically renames it
 * to the final path. This prevents partial writes from appearing
 * as complete notes.
 *
 * @param dir     - Target directory (e.g. vault root + kind subpath)
 * @param filename- Filename including .md extension
 * @param content - Full note content (frontmatter + body)
 */
export async function writeObsidianNote(
  dir: string,
  filename: string,
  content: string,
): Promise<void> {
  const filePath = join(dir, filename);
  const tmpPath = join(dir, `${filename}.tmp.${process.pid}`);

  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(tmpPath, content, "utf-8");

    // Fsync temp file before rename so the content is on disk
    const fd = openSync(tmpPath, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }

    renameSync(tmpPath, filePath);

    // Fsync parent directory so the rename metadata is durable
    const parentDir = dirname(filePath);
    const dirFd = openSync(parentDir, "r");
    try {
      fsyncSync(dirFd);
    } finally {
      closeSync(dirFd);
    }
  } catch (err) {
    // Best-effort cleanup of temp file before rethrowing
    try {
      unlinkSync(tmpPath);
    } catch {
      // Ignore cleanup failures — the original error is what matters
    }
    throw err;
  }
}
