"use strict";

import { describe, it, expect } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir } from "../../../tests/helpers/temp-dir.js";
import { detectVaultBackend } from "../../../src/vault/vault-detector.js";

describe("VaultDetector", () => {
  it("detects obsidian backend when .obsidian/ directory exists", () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".obsidian"));
      expect(detectVaultBackend(path)).toBe("obsidian");
    } finally {
      cleanup();
    }
  });

  it("detects local backend when MEMORY.md exists", () => {
    const { path, cleanup } = createTempDir();
    try {
      writeFileSync(join(path, "MEMORY.md"), "");
      expect(detectVaultBackend(path)).toBe("local");
    } finally {
      cleanup();
    }
  });

  it("detects mnemopi backend when .omp/mnemopi.db exists", () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      writeFileSync(join(path, ".omp", "mnemopi.db"), "");
      expect(detectVaultBackend(path)).toBe("mnemopi");
    } finally {
      cleanup();
    }
  });

  it("returns none when no backend artifacts exist", () => {
    const { path, cleanup } = createTempDir();
    try {
      expect(detectVaultBackend(path)).toBe("none");
    } finally {
      cleanup();
    }
  });

  it("prioritises obsidian over local and mnemopi", () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".obsidian"));
      writeFileSync(join(path, "MEMORY.md"), "");
      mkdirSync(join(path, ".omp"));
      writeFileSync(join(path, ".omp", "mnemopi.db"), "");
      expect(detectVaultBackend(path)).toBe("obsidian");
    } finally {
      cleanup();
    }
  });

  it("prioritises local over mnemopi when obsidian absent", () => {
    const { path, cleanup } = createTempDir();
    try {
      writeFileSync(join(path, "MEMORY.md"), "");
      mkdirSync(join(path, ".omp"));
      writeFileSync(join(path, ".omp", "mnemopi.db"), "");
      expect(detectVaultBackend(path)).toBe("local");
    } finally {
      cleanup();
    }
  });
});
