"use strict";

import { describe, it, expect } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir } from "../../../tests/helpers/temp-dir.js";
import { detectVaultBackend } from "../../../src/vault/vault-detector.js";
import { createVaultStore } from "../../../src/vault/vault-detector.js";
import { NoopVaultStore } from "../../../src/vault/noop-vault-store.js";

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

describe("createVaultStore", () => {
  it("returns ObsidianVaultStore when .obsidian/ exists", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".obsidian"));
      const store = await createVaultStore(path);
      expect(store.constructor.name).toBe("ObsidianVaultStore");
    } finally {
      cleanup();
    }
  });

  it("returns LocalVaultStore when MEMORY.md exists", async () => {
    const { path, cleanup } = createTempDir();
    try {
      writeFileSync(join(path, "MEMORY.md"), "");
      const store = await createVaultStore(path);
      expect(store.constructor.name).toBe("LocalVaultStore");
    } finally {
      cleanup();
    }
  });

  it("returns MnemopiVaultStore when .omp/mnemopi.db exists", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      writeFileSync(join(path, ".omp", "mnemopi.db"), "");
      const store = await createVaultStore(path);
      expect(store.constructor.name).toBe("MnemopiVaultStore");
    } finally {
      cleanup();
    }
  });

  it("returns NoopVaultStore when no backend detected", async () => {
    const { path, cleanup } = createTempDir();
    try {
      const store = await createVaultStore(path);
      expect(store).toBeInstanceOf(NoopVaultStore);
    } finally {
      cleanup();
    }
  });
});
