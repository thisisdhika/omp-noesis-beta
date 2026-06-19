"use strict";

import { describe, it, expect } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { VaultArtifact } from "../../../src/shared/schema.js";
import { createTempDir } from "../../../tests/helpers/temp-dir.js";
import { MnemopiVaultStore } from "../../../src/vault/mnemopi-vault-store.js";

describe("MnemopiVaultStore", () => {
  function makeArtifact(overrides: Partial<VaultArtifact> & { id: string }): VaultArtifact {
    return {
      kind: "learning",
      projectPath: "/test",
      pushedAt: new Date().toISOString(),
      content: "test content",
      ...overrides,
    };
  }

  it("push and pull roundtrip", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      const store = new MnemopiVaultStore(path);
      const artifact = makeArtifact({ id: "rt-1", content: "roundtrip test" });

      await store.push(artifact);
      const result = await store.pull();

      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0]!.id).toBe("rt-1");
      expect(result.artifacts[0]!.content).toBe("roundtrip test");
      expect(result.source).toBe("mnemopi");
    } finally {
      cleanup();
    }
  });

  it("push multiple artifacts and pull with kind filter", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      const store = new MnemopiVaultStore(path);

      await store.push(makeArtifact({ id: "kf-1", kind: "learning", content: "learn" }));
      await store.push(makeArtifact({ id: "kf-2", kind: "decision", content: "decide" }));
      await store.push(makeArtifact({ id: "kf-3", kind: "learning", content: "more learn" }));

      const result = await store.pull("learning");
      expect(result.artifacts).toHaveLength(2);
      for (const a of result.artifacts) {
        expect(a.kind).toBe("learning");
      }
    } finally {
      cleanup();
    }
  });

  it("pull respects maxResults limit", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      const store = new MnemopiVaultStore(path);

      for (let i = 0; i < 5; i++) {
        await store.push(makeArtifact({ id: `mr-${i}`, content: `item ${i}` }));
      }

      const result = await store.pull(undefined, 2);
      expect(result.artifacts).toHaveLength(2);
    } finally {
      cleanup();
    }
  });

  it("search finds artifacts by content substring", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      const store = new MnemopiVaultStore(path);

      await store.push(makeArtifact({ id: "sr-1", content: "Unique search term" }));
      await store.push(makeArtifact({ id: "sr-2", content: "other content" }));

      const results = await store.search("Unique");
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("sr-1");
    } finally {
      cleanup();
    }
  });

  it("validate returns true when db is healthy", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      const store = new MnemopiVaultStore(path);

      const valid = await store.validate();
      expect(valid).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("idempotent construction on same path works", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      const store1 = new MnemopiVaultStore(path);
      await store1.push(makeArtifact({ id: "dup-1", content: "from first" }));

      const store2 = new MnemopiVaultStore(path);
      const result = await store2.pull();
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0]!.id).toBe("dup-1");
    } finally {
      cleanup();
    }
  });

  it("upsert: pushing same id twice overwrites content", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      const store = new MnemopiVaultStore(path);

      await store.push(makeArtifact({ id: "ups-1", content: "original content" }));
      await store.push(makeArtifact({ id: "ups-1", content: "replacement content" }));

      const result = await store.pull();
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0]!.content).toBe("replacement content");
    } finally {
      cleanup();
    }
  });
});
