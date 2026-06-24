"use strict";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ensureNoesisDir, validateGraphPath } from "../../../src/shared/paths.js";
import { createTempDir } from "../../helpers/temp-dir.js";
import { existsSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";


describe("ensureNoesisDir", () => {
  let tmp: { path: string; cleanup(): void };

  beforeEach(() => {
    tmp = createTempDir();
  });

  afterEach(() => {
    tmp.cleanup();
  });

  it("should create the .omp/noesis directory", () => {
    const dir = ensureNoesisDir(tmp.path);
    expect(dir).toBe(join(tmp.path, ".omp", "noesis"));
    expect(existsSync(dir)).toBe(true);
  });

  it("should be idempotent when directory already exists", () => {
    const first = ensureNoesisDir(tmp.path);
    const second = ensureNoesisDir(tmp.path);
    expect(first).toBe(second);
    expect(existsSync(second)).toBe(true);
  });

  it("should create directory with 0700 permissions on POSIX", () => {
    if (process.platform === "win32") return; // no-op on Windows
    const dir = ensureNoesisDir(tmp.path);
    const stats = statSync(dir);
    // mode includes file-type bits; mask to owner/group/other permission bits
    expect(stats.mode & 0o777).toBe(0o700);
  });
});

describe("validateGraphPath", () => {
  let tmp: { path: string; cleanup(): void };

  beforeEach(() => {
    tmp = createTempDir();
  });

  afterEach(() => {
    tmp.cleanup();
  });

  it("should return null when graph.json does not exist", () => {
    const result = validateGraphPath(tmp.path);
    expect(result).toBeNull();
  });

  it("should return the path when graph.json exists", () => {
    const graphDir = join(tmp.path, "graphify-out");
    mkdirSync(graphDir, { recursive: true });
    writeFileSync(join(graphDir, "graph.json"), "{}");
    const result = validateGraphPath(tmp.path);
    expect(result).toBe(join(tmp.path, "graphify-out", "graph.json"));
  });
});
