"use strict";

/**
 * Unit tests for filesystem-store — atomic JSON persistence.
 */

import { describe, it, expect, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { writeAtomic, readJSON, fileExists } from "../../../src/infrastructure/filesystem-store.js";
import { createTempDir } from "../../helpers/temp-dir.js";
import { join } from "node:path";

// ============================================================================
// Helpers
// ============================================================================

interface TempDir {
  path: string;
  cleanup(): void;
}

let tempDir: TempDir;

afterEach(() => {
  if (tempDir) tempDir.cleanup();
});

// ============================================================================
// Tests
// ============================================================================

describe("writeAtomic", () => {
  it("should write valid JSON to disk", async () => {
    tempDir = createTempDir();
    const filePath = join(tempDir.path, "test.json");

    await writeAtomic(filePath, { hello: "world" });

    const content = await Bun.file(filePath).json();
    expect(content).toEqual({ hello: "world" });
  });

  it("should write complex nested data and be readable back", async () => {
    tempDir = createTempDir();
    const filePath = join(tempDir.path, "complex.json");
    const data = {
      version: 1,
      nested: { a: [1, 2, 3], b: null, c: true },
    };

    await writeAtomic(filePath, data);

    const content = await Bun.file(filePath).json();
    expect(content).toEqual(data);
  });

  it("should write JSON ending with newline", async () => {
    tempDir = createTempDir();
    const filePath = join(tempDir.path, "newline.json");

    await writeAtomic(filePath, { test: "data" });

    const raw = await Bun.file(filePath).text();
    expect(raw.endsWith("\n")).toBe(true);
  });
});

describe("readJSON", () => {
  it("should return null when file does not exist", async () => {
    tempDir = createTempDir();
    const missingPath = join(tempDir.path, "nonexistent.json");

    const result = await readJSON(missingPath);
    expect(result).toBeNull();
  });

  it("should parse JSON from an existing file", async () => {
    tempDir = createTempDir();
    const filePath = join(tempDir.path, "data.json");
    const data = { key: "value", num: 42 };

    await writeAtomic(filePath, data);
    const result = await readJSON(filePath);
    expect(result).toEqual(data);
  });

  it("should throw on malformed JSON", async () => {
    tempDir = createTempDir();
    const filePath = join(tempDir.path, "bad.json");

    await Bun.write(filePath, "not valid json{{{");

    expect(() => readJSON(filePath)).toThrow();
  });
});

describe("fileExists", () => {
  it("should return true when file exists", async () => {
    tempDir = createTempDir();
    const filePath = join(tempDir.path, "exists.json");

    await writeAtomic(filePath, {});
    expect(fileExists(filePath)).toBeTrue();
  });

  it("should return false when file does not exist", () => {
    tempDir = createTempDir();
    const missingPath = join(tempDir.path, "missing.json");

    expect(fileExists(missingPath)).toBeFalse();
  });
});

describe("writeAtomic directory creation", () => {
  it("should create nested directories automatically", async () => {
    const dir = createTempDir();
    try {
      const nestedPath = join(dir.path, "nested", "test.json");
      await writeAtomic(nestedPath, { data: "test" });
      // Bun.write auto-creates parent directories — write should succeed
      expect(fileExists(nestedPath)).toBe(true);
    } finally {
      dir.cleanup();
    }
  });
});

  it("cleans up temp file and rethrows when renameSync fails due to directory collision", async () => {
    const dir = createTempDir();
    const targetPath = join(dir.path, "dir-collision.json");
    try {
      // Create target as a directory so renameSync fails (cannot rename file over dir)
      mkdirSync(targetPath);

      await expect(writeAtomic(targetPath, { data: "test" })).rejects.toThrow();

      // Temp file should have been cleaned up
      const tempPath = `${targetPath}.tmp.${process.pid}`;
      expect(existsSync(tempPath)).toBe(false);
    } finally {
      if (existsSync(targetPath)) {
        rmSync(targetPath, { recursive: true, force: true });
      }
      dir.cleanup();
    }
  });

// NOTE: Adding a true write-failure test (e.g., writing to a path where a
// directory exists instead of a file) is not feasible in the temp-dir fixture
// because Bun.write on a directory path produces a platform-specific error
// that doesn't compose well across OS and filesystem types. The error handling
// path (best-effort temp cleanup + rethrow) is exercised implicitly by any
// write that throws a platform permission or disk-full error.
