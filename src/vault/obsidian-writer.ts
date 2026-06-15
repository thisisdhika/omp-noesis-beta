"use strict";

/**
 * omp-noesis: Obsidian Note Atomic Writer
 * Version: 0.1.0
 *
 * Writes a Markdown note to an Obsidian vault path using the
 * temp-then-rename pattern for atomic file creation.
 */

import { mkdirSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";

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

  mkdirSync(dir, { recursive: true });
  writeFileSync(tmpPath, content, "utf-8");
  renameSync(tmpPath, filePath);
}
