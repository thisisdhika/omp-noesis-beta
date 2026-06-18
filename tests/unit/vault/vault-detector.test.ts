"use strict";

import { describe, it, expect } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir } from "../../../tests/helpers/temp-dir.js";
import {
  detectVaultBackend,
  detectMemoryBackend,
  detectProjectionBackend,
  createVaultStore,
} from "../../../src/vault/vault-detector.js";
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

  it("detects hindsight memory backend when .omp/hindsight/ directory exists", () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp", "hindsight"), { recursive: true });
      expect(detectMemoryBackend(path)).toBe("hindsight");
    } finally {
      cleanup();
    }
  });

  it("prioritises mnemopi over hindsight in detectMemoryBackend", () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"), { recursive: true });
      writeFileSync(join(path, ".omp", "mnemopi.db"), "");
      mkdirSync(join(path, ".omp", "hindsight"));
      expect(detectMemoryBackend(path)).toBe("mnemopi");
    } finally {
      cleanup();
    }
  });

  it("prioritises hindsight over local in detectMemoryBackend", () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp", "hindsight"), { recursive: true });
      writeFileSync(join(path, "MEMORY.md"), "");
      expect(detectMemoryBackend(path)).toBe("hindsight");
    } finally {
      cleanup();
    }
  });

  it("detects hindsight vault backend when .omp/hindsight/ exists (no .obsidian)", () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp", "hindsight"), { recursive: true });
      expect(detectVaultBackend(path)).toBe("hindsight");
    } finally {
      cleanup();
    }
  });

  it("prioritises obsidian over hindsight in detectVaultBackend", () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".obsidian"));
      mkdirSync(join(path, ".omp", "hindsight"), { recursive: true });
      expect(detectVaultBackend(path)).toBe("obsidian");
    } finally {
      cleanup();
    }
  });

  it("detects obsidian projection backend when .obsidian/ directory exists", () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".obsidian"));
      expect(detectProjectionBackend(path)).toBe("obsidian");
    } finally {
      cleanup();
    }
  });

  it("detects none projection backend when .obsidian/ is absent", () => {
    const { path, cleanup } = createTempDir();
    try {
      expect(detectProjectionBackend(path)).toBe("none");
    } finally {
      cleanup();
    }
  });

  it("returns HindsightVaultStore when .omp/hindsight/ exists", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp", "hindsight"), { recursive: true });
      const store = await createVaultStore(path);
      expect(store.constructor.name).toBe("HindsightVaultStore");
    } finally {
      cleanup();
    }
  });

  it("returns CompositeVaultStore when local memory and obsidian projection both exist", async () => {
    const { path, cleanup } = createTempDir();
    try {
      writeFileSync(join(path, "MEMORY.md"), "");
      mkdirSync(join(path, ".obsidian"));
      const store = await createVaultStore(path);
      expect(store.constructor.name).toBe("CompositeVaultStore");
    } finally {
      cleanup();
    }
  });

  it("returns CompositeVaultStore when mnemopi memory and obsidian projection both exist", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      writeFileSync(join(path, ".omp", "mnemopi.db"), "");
      mkdirSync(join(path, ".obsidian"));
      const store = await createVaultStore(path);
      expect(store.constructor.name).toBe("CompositeVaultStore");
    } finally {
      cleanup();
    }
  });

  it("returns ObsidianVaultStore when only .obsidian/ exists (no memory backend)", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".obsidian"));
      const store = await createVaultStore(path);
      expect(store.constructor.name).toBe("ObsidianVaultStore");
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
