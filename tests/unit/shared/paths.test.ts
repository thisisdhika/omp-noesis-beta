"use strict";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { resolveProjectPath, ensureNoesisDir, validateGraphPath } from "../../../src/shared/paths.js";
import { createTempDir } from "../../helpers/temp-dir.js";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

describe("resolveProjectPath", () => {
  it("should join root with a single segment", () => {
    expect(resolveProjectPath("/root", "dir")).toBe("/root/dir");
  });

  it("should join root with multiple segments", () => {
    expect(resolveProjectPath("/root", "a", "b", "c")).toBe("/root/a/b/c");
  });

  it("should handle relative root paths", () => {
    expect(resolveProjectPath("relative", "path")).toBe("relative/path");
  });
});

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
