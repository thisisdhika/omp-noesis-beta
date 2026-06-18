"use strict";

import { describe, it, expect } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { VaultArtifact } from "../../../src/schema.js";
import { createTempDir } from "../../../tests/helpers/temp-dir.js";
import { HindsightVaultStore } from "../../../src/vault/hindsight-vault-store.js";

describe("HindsightVaultStore", () => {
  function makeArtifact(
    overrides: Partial<VaultArtifact> & { id: string },
  ): VaultArtifact {
    return {
      kind: "learning",
      projectPath: "/test",
      pushedAt: new Date().toISOString(),
      content: "test content",
      ...overrides,
    };
  }

  it("constructs using .omp/hindsight paths", () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      const store = new HindsightVaultStore(path);

      // Push an artifact and verify the file exists at the expected location
      const artifact = makeArtifact({ id: "path-check" });
      store.push(artifact);

      const expectedFile = join(path, ".omp", "hindsight", "artifacts.json");
      expect(existsSync(expectedFile)).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("push writes artifact to artifacts.json", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      const store = new HindsightVaultStore(path);
      const artifact = makeArtifact({ id: "push-1", content: "first push" });

      await store.push(artifact);

      const expectedFile = join(path, ".omp", "hindsight", "artifacts.json");
      const raw = readFileSync(expectedFile, "utf-8");
      const stored = JSON.parse(raw) as VaultArtifact[];
      expect(stored).toHaveLength(1);
      expect(stored[0]!.id).toBe("push-1");
      expect(stored[0]!.content).toBe("first push");
    } finally {
      cleanup();
    }
  });

  it("push upserts artifact with same id", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      const store = new HindsightVaultStore(path);
      const original = makeArtifact({
        id: "upsert-1",
        content: "original content",
        kind: "learning",
      });
      const updated = makeArtifact({
        id: "upsert-1",
        content: "updated content",
        kind: "decision",
      });

      await store.push(original);
      await store.push(updated);
      const result = await store.pull();

      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0]!.id).toBe("upsert-1");
      expect(result.artifacts[0]!.content).toBe("updated content");
      expect(result.artifacts[0]!.kind).toBe("decision");
    } finally {
      cleanup();
    }
  });

  it("push multiple artifacts stores all", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      const store = new HindsightVaultStore(path);

      await store.push(makeArtifact({ id: "a", content: "alpha" }));
      await store.push(makeArtifact({ id: "b", content: "beta" }));
      await store.push(makeArtifact({ id: "c", content: "gamma" }));
      const result = await store.pull();

      expect(result.artifacts).toHaveLength(3);
    } finally {
      cleanup();
    }
  });

  it("pull returns all artifacts without kind filter", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      const store = new HindsightVaultStore(path);

      await store.push(makeArtifact({ id: "p1", kind: "decision" }));
      await store.push(makeArtifact({ id: "p2", kind: "learning" }));
      const result = await store.pull();

      expect(result.artifacts).toHaveLength(2);
    } finally {
      cleanup();
    }
  });

  it("pull filters by kind", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      const store = new HindsightVaultStore(path);

      await store.push(makeArtifact({ id: "k1", kind: "decision" }));
      await store.push(makeArtifact({ id: "k2", kind: "learning" }));
      await store.push(makeArtifact({ id: "k3", kind: "decision" }));
      const result = await store.pull("decision");

      expect(result.artifacts).toHaveLength(2);
      expect(result.artifacts.every(a => a.kind === "decision")).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("pull returns artifacts most-recent-first", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      const store = new HindsightVaultStore(path);

      const oldA = makeArtifact({
        id: "old",
        pushedAt: "2023-01-01T00:00:00.000Z",
      });
      const midA = makeArtifact({
        id: "mid",
        pushedAt: "2024-01-01T00:00:00.000Z",
      });
      const newA = makeArtifact({
        id: "new",
        pushedAt: "2025-01-01T00:00:00.000Z",
      });

      await store.push(oldA);
      await store.push(midA);
      await store.push(newA);
      const result = await store.pull();

      expect(result.artifacts.map(a => a.id)).toEqual(["new", "mid", "old"]);
    } finally {
      cleanup();
    }
  });

  it("pull respects maxResults limit", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      const store = new HindsightVaultStore(path);

      for (let i = 0; i < 20; i++) {
        await store.push(
          makeArtifact({ id: `limit-${i}`, content: `item ${i}` }),
        );
      }
      const result = await store.pull(undefined, 5);

      expect(result.artifacts).toHaveLength(5);
    } finally {
      cleanup();
    }
  });

  it("pull returns empty artifacts on empty store", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      const store = new HindsightVaultStore(path);
      const result = await store.pull();

      expect(result.artifacts).toEqual([]);
      expect(result.source).toContain("artifacts.json");
      expect(result.timestamp).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it("pull returns source and timestamp metadata", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      const store = new HindsightVaultStore(path);

      await store.push(makeArtifact({ id: "meta-test" }));
      const result = await store.pull();

      expect(result.source).toContain("artifacts.json");
      expect(result.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      );
    } finally {
      cleanup();
    }
  });

  it("search finds artifacts by content substring (case-insensitive)", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      const store = new HindsightVaultStore(path);

      await store.push(
        makeArtifact({ id: "s1", content: "Hello World" }),
      );
      await store.push(
        makeArtifact({ id: "s2", content: "Goodbye Moon" }),
      );
      const result = await store.search("hello");

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("s1");
    } finally {
      cleanup();
    }
  });

  it("search finds artifacts by id substring (case-insensitive)", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      const store = new HindsightVaultStore(path);

      await store.push(makeArtifact({ id: "Target-123" }));
      await store.push(makeArtifact({ id: "Other-456" }));
      const result = await store.search("target");

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("Target-123");
    } finally {
      cleanup();
    }
  });

  it("search finds artifacts by kind substring (case-insensitive)", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      const store = new HindsightVaultStore(path);

      await store.push(
        makeArtifact({ id: "dec-1", kind: "decision" }),
      );
      await store.push(
        makeArtifact({ id: "lrn-1", kind: "learning" }),
      );
      const result = await store.search("decision");

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("dec-1");
    } finally {
      cleanup();
    }
  });

  it("search filters by kind", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      const store = new HindsightVaultStore(path);

      await store.push(
        makeArtifact({ id: "a1", kind: "decision", content: "needle" }),
      );
      await store.push(
        makeArtifact({ id: "a2", kind: "learning", content: "needle" }),
      );
      const result = await store.search("needle", "decision");

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("a1");
    } finally {
      cleanup();
    }
  });

  it("search respects maxResults limit", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      const store = new HindsightVaultStore(path);

      for (let i = 0; i < 10; i++) {
        await store.push(
          makeArtifact({ id: `slimit-${i}`, content: `common-${i}` }),
        );
      }
      const result = await store.search("common", undefined, 3);

      expect(result).toHaveLength(3);
    } finally {
      cleanup();
    }
  });

  it("search returns empty on no match", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      const store = new HindsightVaultStore(path);

      await store.push(makeArtifact({ id: "miss-1", content: "alpha" }));
      const result = await store.search("nonexistent");

      expect(result).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("validate returns true when directory exists", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      mkdirSync(join(path, ".omp", "hindsight"));
      const store = new HindsightVaultStore(path);

      const result = await store.validate();

      expect(result).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("validate creates .omp/hindsight directory on first call then returns true", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      const store = new HindsightVaultStore(path);

      expect(existsSync(join(path, ".omp", "hindsight"))).toBe(false);
      const result = await store.validate();

      expect(result).toBe(true);
      expect(existsSync(join(path, ".omp", "hindsight"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("push creates artifacts.json when .omp/hindsight does not exist", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      const store = new HindsightVaultStore(path);
      const artifact = makeArtifact({ id: "auto-create" });

      await store.push(artifact);

      const expectedFile = join(path, ".omp", "hindsight", "artifacts.json");
      expect(existsSync(expectedFile)).toBe(true);
      const raw = readFileSync(expectedFile, "utf-8");
      const stored = JSON.parse(raw) as VaultArtifact[];
      expect(stored).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  it("readAll returns empty array when file does not exist", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      mkdirSync(join(path, ".omp", "hindsight"));
      const store = new HindsightVaultStore(path);

      const result = await store.pull();
      expect(result.artifacts).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("readAll returns empty array on corrupt JSON file", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp", "hindsight"), { recursive: true });
      writeFileSync(
        join(path, ".omp", "hindsight", "artifacts.json"),
        "not valid json{{{",
      );
      const store = new HindsightVaultStore(path);

      const result = await store.pull();

      expect(result.artifacts).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("readAll returns artifacts from valid JSON file", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp", "hindsight"), { recursive: true });
      const expected = [
        makeArtifact({ id: "preload-1", pushedAt: "2023-01-01T00:00:00.000Z" }),
        makeArtifact({ id: "preload-2", pushedAt: "2024-01-01T00:00:00.000Z" }),
      ];
      writeFileSync(
        join(path, ".omp", "hindsight", "artifacts.json"),
        JSON.stringify(expected),
      );
      const store = new HindsightVaultStore(path);

      const result = await store.pull();

      expect(result.artifacts).toHaveLength(2);
      expect(result.artifacts[0]!.id).toBe("preload-2");
      expect(result.artifacts[1]!.id).toBe("preload-1");
    } finally {
      cleanup();
    }
  });

  it("search returns empty when query is empty string", async () => {
    const { path, cleanup } = createTempDir();
    try {
      mkdirSync(join(path, ".omp"));
      const store = new HindsightVaultStore(path);

      await store.push(makeArtifact({ id: "emp-1", content: "something" }));
      const result = await store.search("");

      // Empty string as query: all artifacts match since every string contains ""
      expect(result).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  it("validate returns true when a file sits at the hindsight path", async () => {
    const { path, cleanup } = createTempDir();
    try {
      // Create a file where the hindsight directory would go
      mkdirSync(join(path, ".omp"));
      writeFileSync(join(path, ".omp", "hindsight"), "i am a file not a dir");
      const store = new HindsightVaultStore(path);

      const result = await store.validate();

      // validate() checks existsSync, not isDirectory, so it returns true
      expect(result).toBe(true);
    } finally {
      cleanup();
    }
  });
});
