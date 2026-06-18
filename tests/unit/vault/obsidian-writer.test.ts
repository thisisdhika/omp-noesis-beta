"use strict";

/**
 * Unit tests for obsidian-writer — atomic note writer.
 */

import { describe, it, expect } from "bun:test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createTempDir } from "../../helpers/temp-dir.js";
import { writeObsidianNote } from "../../../src/vault/obsidian-writer.js";

describe("writeObsidianNote", () => {
  it("should write a note atomically and succeed", async () => {
    const { path, cleanup } = createTempDir();
    try {
      const dir = join(path, "notes");
      const filename = "test-note.md";
      const content = "---\nid: test-1\n---\nHello world";

      await writeObsidianNote(dir, filename, content);

      const filePath = join(dir, filename);
      expect(existsSync(filePath)).toBe(true);
      const written = await Bun.file(filePath).text();
      expect(written).toBe(content);

      // Temp file should be cleaned up after rename
      const tmpPath = join(dir, `${filename}.tmp.${process.pid}`);
      expect(existsSync(tmpPath)).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("should create the target directory when it does not exist", async () => {
    const { path, cleanup } = createTempDir();
    try {
      const dir = join(path, "new-dir", "subdir");
      const filename = "deep-note.md";
      const content = "---\nid: deep-1\n---\nDeep content";

      await writeObsidianNote(dir, filename, content);

      const filePath = join(dir, filename);
      expect(existsSync(filePath)).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("cleans up temp file and rethrows on write failure", async () => {
    const { path, cleanup } = createTempDir();
    try {
      const dir = join(path, "notes");
      mkdirSync(dir);
      const filename = "fail-note.md";

      // Create the target file path as a directory so renameSync fails
      mkdirSync(join(dir, filename));

      const content = "---\nid: fail-1\n---\nWill fail";
      await expect(writeObsidianNote(dir, filename, content)).rejects.toThrow();

      // Temp file should be cleaned up despite the error
      const tmpPath = join(dir, `${filename}.tmp.${process.pid}`);
      expect(existsSync(tmpPath)).toBe(false);
    } finally {
      cleanup();
    }
  });
});
