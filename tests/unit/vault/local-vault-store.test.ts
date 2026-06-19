"use strict";

import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { VaultArtifact } from "../../../src/shared/schema.js";
import { createTempDir } from "../../../tests/helpers/temp-dir.js";
import { LocalVaultStore } from "../../../src/vault/local-vault-store.js";

describe("LocalVaultStore", () => {
  function makeArtifact(overrides: Partial<VaultArtifact> & { id: string }): VaultArtifact {
    return {
      kind: "learning",
      projectPath: "/test",
      pushedAt: new Date().toISOString(),
      content: "test content",
      ...overrides,
    };
  }

  it("push writes artifact to MEMORY.md", async () => {
    const { path, cleanup } = createTempDir();
    try {
      const store = new LocalVaultStore(path);
      const artifact = makeArtifact({ id: "push-1" });

      await store.push(artifact);

      const filePath = join(path, "MEMORY.md");
      expect(existsSync(filePath)).toBe(true);
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain(artifact.id);
      expect(content).toContain(artifact.content);
    } finally {
      cleanup();
    }
  });

  it("pull returns all artifacts without kind filter", async () => {
    const { path, cleanup } = createTempDir();
    try {
      const store = new LocalVaultStore(path);
      await store.push(makeArtifact({ id: "pull-1", kind: "learning", content: "first" }));
      await store.push(makeArtifact({ id: "pull-2", kind: "decision", content: "second" }));

      const result = await store.pull();
      expect(result.artifacts).toHaveLength(2);
      expect(result.source).toContain("MEMORY.md");
    } finally {
      cleanup();
    }
  });

  it("pull filters by kind", async () => {
    const { path, cleanup } = createTempDir();
    try {
      const store = new LocalVaultStore(path);
      await store.push(makeArtifact({ id: "pk-1", kind: "learning", content: "learn" }));
      await store.push(makeArtifact({ id: "pk-2", kind: "decision", content: "decide" }));
      await store.push(makeArtifact({ id: "pk-3", kind: "learning", content: "more learn" }));

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
      const store = new LocalVaultStore(path);
      for (let i = 0; i < 5; i++) {
        await store.push(makeArtifact({ id: `mr-${i}`, content: `item ${i}` }));
      }

      const result = await store.pull(undefined, 2);
      expect(result.artifacts).toHaveLength(2);
    } finally {
      cleanup();
    }
  });

  it("search finds artifacts by content substring (case-insensitive)", async () => {
    const { path, cleanup } = createTempDir();
    try {
      const store = new LocalVaultStore(path);
      await store.push(makeArtifact({ id: "sr-1", content: "Hello World" }));
      await store.push(makeArtifact({ id: "sr-2", content: "goodbye world" }));
      await store.push(makeArtifact({ id: "sr-3", content: "nothing" }));

      const results = await store.search("hello");
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("sr-1");
    } finally {
      cleanup();
    }
  });

  it("validate creates MEMORY.md on first call then returns true", async () => {
    const { path, cleanup } = createTempDir();
    try {
      const store = new LocalVaultStore(path);
      const filePath = join(path, "MEMORY.md");
      expect(existsSync(filePath)).toBe(false);

      const first = await store.validate();
      expect(first).toBe(true);
      expect(existsSync(filePath)).toBe(true);

      const second = await store.validate();
      expect(second).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("pull returns empty artifacts on empty store", async () => {
    const { path, cleanup } = createTempDir();
    try {
      const store = new LocalVaultStore(path);
      const result = await store.pull();
      expect(result.artifacts).toEqual([]);
      expect(result.source).toBeDefined();
      expect(result.timestamp).toBeDefined();
    } finally {
      cleanup();
    }
  });
});
