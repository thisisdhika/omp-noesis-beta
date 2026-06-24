"use strict";

import { describe, it, expect, beforeEach } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { VaultArtifact } from "../../../src/shared/schema.js";
import { createTempDir } from "../../../tests/helpers/temp-dir.js";
import { ObsidianVaultStore } from "../../../src/vault/obsidian-vault-store.js";

/**
 * Check whether grep(1) is available.  ObsidianVaultStore.search() requires
 * it, so we skip search tests on systems that lack it.
 */
function hasGrep(): boolean {
  try {
    const proc = Bun.spawnSync(["which", "grep"]);
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

describe("ObsidianVaultStore", () => {
  /** Build a minimal VaultArtifact with sensible defaults. */
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

  // ========================================================================
  // YAML frontmatter helpers (indirectly tested via push → pull roundtrip)
  // ========================================================================

  describe("YAML frontmatter roundtrip", () => {
    it("roundtrips artifact with boolean metadata values", async () => {
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);
        const artifact = makeArtifact({
          id: "yml-bool",
          kind: "decision",
          content: "boolean test",
          metadata: { enabled: true, archived: false },
        });

        await store.push(artifact);
        const result = await store.pull("decision", 100);
        const pulled = result.artifacts.find((a) => a.id === artifact.id);

        expect(pulled).toBeDefined();
        expect(pulled!.metadata).toBeDefined();
        expect(pulled!.metadata!["enabled"]).toBe(true);
        expect(pulled!.metadata!["archived"]).toBe(false);
      } finally {
        cleanup();
      }
    });

    it("roundtrips artifact with numeric metadata values", async () => {
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);
        const artifact = makeArtifact({
          id: "yml-num",
          kind: "decision",
          content: "number test",
          metadata: { count: 42, ratio: 3.14, negative: -1 },
        });

        await store.push(artifact);
        const result = await store.pull("decision", 100);
        const pulled = result.artifacts.find((a) => a.id === artifact.id);

        expect(pulled).toBeDefined();
        expect(pulled!.metadata!["count"]).toBe(42);
        expect(pulled!.metadata!["ratio"]).toBe(3.14);
        expect(pulled!.metadata!["negative"]).toBe(-1);
      } finally {
        cleanup();
      }
    });

    it("roundtrips artifact with null metadata value", async () => {
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);
        const artifact = makeArtifact({
          id: "yml-null",
          kind: "decision",
          content: "null test",
          metadata: { nullable: null },
        });

        await store.push(artifact);
        const result = await store.pull("decision", 100);
        const pulled = result.artifacts.find((a) => a.id === artifact.id);

        expect(pulled).toBeDefined();
        expect(pulled!.metadata!["nullable"]).toBeNull();
      } finally {
        cleanup();
      }
    });

    it("roundtrips artifact with string metadata (quoted and unquoted)", async () => {
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);
        const artifact = makeArtifact({
          id: "yml-str",
          kind: "decision",
          content: "string test",
          metadata: {
            plain: "hello",
            quoted: "contains: colon",
            spaced: " leading space",
          },
        });

        await store.push(artifact);
        const result = await store.pull("decision", 100);
        const pulled = result.artifacts.find((a) => a.id === artifact.id);

        expect(pulled).toBeDefined();
        expect(pulled!.metadata!["plain"]).toBe("hello");
        expect(pulled!.metadata!["quoted"]).toBe("contains: colon");
        expect(pulled!.metadata!["spaced"]).toBe(" leading space");
      } finally {
        cleanup();
      }
    });

    it("roundtrips artifact with various scalar metadata values", async () => {
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);
        const artifact = makeArtifact({
          id: "yml-scalars",
          kind: "decision",
          content: "scalar types test",
          metadata: {
            sourceType: "graph",
            confidence: 0.9,
            enabled: true,
          },
        });

        await store.push(artifact);
        const result = await store.pull("decision", 100);
        const pulled = result.artifacts.find((a) => a.id === artifact.id);

        expect(pulled).toBeDefined();
        expect(pulled!.metadata!["sourceType"]).toBe("graph");
        expect(pulled!.metadata!["confidence"]).toBe(0.9);
        expect(pulled!.metadata!["enabled"]).toBe(true);
      } finally {
        cleanup();
      }
    });

    it("handles null metadata value correctly", async () => {
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);
        const artifact = makeArtifact({
          id: "yml-null-md",
          kind: "decision",
          content: "null metadata test",
          metadata: {
            nullable: null,
            fallback: "default",
          },
        });

        await store.push(artifact);

        // Verify the on-disk file has the metadata serialized correctly
        const filePath = join(path, ".obsidian", "noesis", "decision", "yml-null-md.md");
        const diskContent = readFileSync(filePath, "utf-8");
        expect(diskContent).toContain("nullable: ~");
        expect(diskContent).toContain("fallback:");

        // Parsing roundtrip
        const result = await store.pull("decision", 100);
        const pulled = result.artifacts.find((a) => a.id === artifact.id);
        expect(pulled).toBeDefined();
        expect(pulled!.metadata!["nullable"]).toBeNull();
        expect(pulled!.metadata!["fallback"]).toBe("default");
      } finally {
        cleanup();
      }
    });

    it("handles empty metadata gracefully (omitted from frontmatter)", async () => {
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);
        const artifact = makeArtifact({
          id: "yml-empty-md",
          kind: "decision",
          content: "no metadata",
          metadata: {},
        });

        await store.push(artifact);
        const result = await store.pull("decision", 100);
        const pulled = result.artifacts.find((a) => a.id === artifact.id);

        expect(pulled).toBeDefined();
        expect(pulled!.metadata).toBeUndefined();
      } finally {
        cleanup();
      }
    });

    it("roundtrips multiline content", async () => {
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);
        const multiline = "line one\nline two\n\nline four";
        const artifact = makeArtifact({
          id: "yml-multi",
          kind: "learning",
          content: multiline,
        });

        await store.push(artifact);
        const result = await store.pull("learning", 100);
        const pulled = result.artifacts.find((a) => a.id === artifact.id);

        expect(pulled).toBeDefined();
        expect(pulled!.content).toBe(multiline);
      } finally {
        cleanup();
      }
    });

    it("preserves kind field across roundtrip", async () => {
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);
        const artifact = makeArtifact({
          id: "yml-kind",
          kind: "belief",
          content: "kind preservation",
        });

        await store.push(artifact);
        const result = await store.pull("belief", 100);
        const pulled = result.artifacts.find((a) => a.id === artifact.id);

        expect(pulled).toBeDefined();
        expect(pulled!.kind).toBe("belief");
      } finally {
        cleanup();
      }
    });
  });

  // ========================================================================
  // push()
  // ========================================================================

  describe("push()", () => {
    it("writes a decision artifact to disk", async () => {
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);
        const artifact = makeArtifact({
          id: "dec-1",
          kind: "decision",
          content: "we must refactor the parser",
        });

        await store.push(artifact);

        const filePath = join(
          path,
          ".obsidian",
          "noesis",
          "decision",
          "dec-1.md",
        );
        expect(existsSync(filePath)).toBe(true);
        const content = readFileSync(filePath, "utf-8");
        expect(content).toContain("kind: decision");
        expect(content).toContain("id: dec-1");
        expect(content).toContain("we must refactor the parser");
      } finally {
        cleanup();
      }
    });

    it("writes a learning artifact to disk", async () => {
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);
        const artifact = makeArtifact({
          id: "lrn-1",
          kind: "learning",
          content: "learned something new",
        });

        await store.push(artifact);

        const filePath = join(path, ".obsidian", "noesis", "learning", "lrn-1.md");
        expect(existsSync(filePath)).toBe(true);
        const content = readFileSync(filePath, "utf-8");
        expect(content).toContain("kind: learning");
        expect(content).toContain("id: lrn-1");
      } finally {
        cleanup();
      }
    });

    it("writes a belief artifact to disk", async () => {
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);
        const artifact = makeArtifact({
          id: "blf-1",
          kind: "belief",
          content: "this is a belief",
        });

        await store.push(artifact);

        const filePath = join(path, ".obsidian", "noesis", "belief", "blf-1.md");
        expect(existsSync(filePath)).toBe(true);
        const content = readFileSync(filePath, "utf-8");
        expect(content).toContain("kind: belief");
      } finally {
        cleanup();
      }
    });

    it("writes a pattern artifact to disk", async () => {
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);
        const artifact = makeArtifact({
          id: "pat-1",
          kind: "pattern",
          content: "detected a pattern",
        });

        await store.push(artifact);

        const filePath = join(path, ".obsidian", "noesis", "pattern", "pat-1.md");
        expect(existsSync(filePath)).toBe(true);
        const content = readFileSync(filePath, "utf-8");
        expect(content).toContain("kind: pattern");
      } finally {
        cleanup();
      }
    });

    it("writes a session artifact to disk", async () => {
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);
        const artifact = makeArtifact({
          id: "ses-1",
          kind: "session",
          content: "session summary",
        });

        await store.push(artifact);

        const filePath = join(path, ".obsidian", "noesis", "session", "ses-1.md");
        expect(existsSync(filePath)).toBe(true);
        const content = readFileSync(filePath, "utf-8");
        expect(content).toContain("kind: session");
      } finally {
        cleanup();
      }
    });

    it("creates intermediate directories when they do not exist", async () => {
      const { path, cleanup } = createTempDir();
      try {
        // No .obsidian directory exists yet — push creates it via writeObsidianNote
        const store = new ObsidianVaultStore(path);
        const artifact = makeArtifact({
          id: "mkdir-1",
          kind: "decision",
          content: "creating dirs",
        });

        await store.push(artifact);

        const filePath = join(
          path,
          ".obsidian",
          "noesis",
          "decision",
          "mkdir-1.md",
        );
        expect(existsSync(filePath)).toBe(true);
        const content = readFileSync(filePath, "utf-8");
        expect(content).toContain("id: mkdir-1");
      } finally {
        cleanup();
      }
    });

    it("writes metadata as YAML frontmatter on disk", async () => {
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);
        const artifact = makeArtifact({
          id: "meta-out",
          kind: "decision",
          content: "body content",
          metadata: { priority: "high", count: 5 },
        });

        await store.push(artifact);

        const filePath = join(path, ".obsidian", "noesis", "decision", "meta-out.md");
        const content = readFileSync(filePath, "utf-8");
        expect(content).toContain("metadata:");
        expect(content).toContain("  priority: high");
        expect(content).toContain("  count: 5");
      } finally {
        cleanup();
      }
    });

    it("push of same id twice overwrites the file", async () => {
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);

        await store.push(
          makeArtifact({ id: "dup-1", content: "original" }),
        );
        await store.push(
          makeArtifact({ id: "dup-1", content: "replacement" }),
        );

        const result = await store.pull();
        expect(result.artifacts).toHaveLength(1);
        expect(result.artifacts[0]!.content).toBe("replacement");
      } finally {
        cleanup();
      }
    });
  });

  // ========================================================================
  // pull()
  // ========================================================================

  describe("pull()", () => {
    it("returns pushed artifact with all fields intact", async () => {
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);
        const artifact = makeArtifact({
          id: "pull-rt",
          kind: "learning",
          content: "roundtrip content",
          metadata: { source: "test" },
        });

        await store.push(artifact);
        const result = await store.pull();

        expect(result.artifacts).toHaveLength(1);
        expect(result.artifacts[0]!.id).toBe("pull-rt");
        expect(result.artifacts[0]!.kind).toBe("learning");
        expect(result.artifacts[0]!.content).toBe("roundtrip content");
        expect(result.artifacts[0]!.metadata).toEqual({ source: "test" });
        expect(result.artifacts[0]!.pushedAt).toBe(artifact.pushedAt);
        expect(result.source).toBeDefined();
        expect(result.timestamp).toBeDefined();
      } finally {
        cleanup();
      }
    });

    it("returns empty artifacts vault is empty", async () => {
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);
        const result = await store.pull();

        expect(result.artifacts).toEqual([]);
        expect(result.source).toBeDefined();
        expect(result.timestamp).toBeDefined();
      } finally {
        cleanup();
      }
    });

    it("returns empty artifacts when .obsidian/noesis does not exist", async () => {
      const { path, cleanup } = createTempDir();
      try {
        // .obsidian exists but no .obsidian/noesis yet
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);
        const result = await store.pull();

        expect(result.artifacts).toEqual([]);
      } finally {
        cleanup();
      }
    });

    it("filters by kind", async () => {
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);

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

    it("respects maxResults limit", async () => {
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);

        for (let i = 0; i < 5; i++) {
          await store.push(makeArtifact({ id: `mr-${i}`, content: `item ${i}` }));
        }

        const result = await store.pull(undefined, 2);
        expect(result.artifacts).toHaveLength(2);
      } finally {
        cleanup();
      }
    });

    it("returns all artifacts when maxResults exceeds count", async () => {
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);

        await store.push(makeArtifact({ id: "ex-1", content: "one" }));
        await store.push(makeArtifact({ id: "ex-2", content: "two" }));

        const result = await store.pull(undefined, 100);
        expect(result.artifacts).toHaveLength(2);
      } finally {
        cleanup();
      }
    });
  });

  // ========================================================================
  // search()
  // ========================================================================

  describe("search()", () => {
    const grepAvailable = hasGrep();

    beforeEach(() => {
      if (!grepAvailable) {
        console.warn("grep not found on PATH — skipping search tests");
      }
    });

    it("finds artifacts by keyword in content", async () => {
      if (!grepAvailable) return;
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);

        await store.push(
          makeArtifact({ id: "sr-1", content: "Unique search term" }),
        );
        await store.push(
          makeArtifact({ id: "sr-2", content: "other content" }),
        );

        const results = await store.search("Unique");
        expect(results).toHaveLength(1);
        expect(results[0]!.id).toBe("sr-1");
      } finally {
        cleanup();
      }
    });

    it("performs case-insensitive matching (grep -ril flag)", async () => {
      if (!grepAvailable) return;
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);

        await store.push(
          makeArtifact({ id: "cs-1", kind: "decision", content: "Hello World" }),
        );
        await store.push(
          makeArtifact({ id: "cs-2", kind: "learning", content: "goodbye world" }),
        );

        // grep -ril is case-insensitive, so "WORLD" should match both artifacts
        const results = await store.search("WORLD");
        expect(results).toHaveLength(2);

        // "Hello" matches only the first artifact (case-insensitive)
        const results2 = await store.search("hello");
        expect(results2).toHaveLength(1);
        expect(results2[0]!.id).toBe("cs-1");
      } finally {
        cleanup();
      }
    });

    it("search with kind filter limits results to that kind", async () => {
      if (!grepAvailable) return;
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);

        await store.push(
          makeArtifact({ id: "sk-1", kind: "decision", content: "important note" }),
        );
        await store.push(
          makeArtifact({ id: "sk-2", kind: "learning", content: "important note" }),
        );

        const results = await store.search("important", "decision");
        expect(results).toHaveLength(1);
        expect(results[0]!.kind).toBe("decision");
      } finally {
        cleanup();
      }
    });

    it("search with maxResults limits returned count", async () => {
      if (!grepAvailable) return;
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);

        for (let i = 0; i < 5; i++) {
          await store.push(
            makeArtifact({ id: `sm-${i}`, content: `matchable content ${i}` }),
          );
        }

        const results = await store.search("matchable", undefined, 2);
        expect(results).toHaveLength(2);
      } finally {
        cleanup();
      }
    });

    it("returns [] when no artifacts have been written", async () => {
      if (!grepAvailable) return;
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);

        const results = await store.search("anything");
        expect(results).toEqual([]);
      } finally {
        cleanup();
      }
    });

    it("returns [] when query matches nothing", async () => {
      if (!grepAvailable) return;
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);

        await store.push(
          makeArtifact({ id: "nm-1", content: "present content" }),
        );

        const results = await store.search("nonexistent");
        expect(results).toEqual([]);
      } finally {
        cleanup();
      }
    });
  });

  // ========================================================================
  // validate()
  // ========================================================================

  describe("validate()", () => {
    it("returns true when .obsidian directory exists", async () => {
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);

        const valid = await store.validate();
        expect(valid).toBe(true);
      } finally {
        cleanup();
      }
    });

    it("returns false when .obsidian directory does not exist", async () => {
      const { path, cleanup } = createTempDir();
      try {
        const store = new ObsidianVaultStore(path);

        const valid = await store.validate();
        expect(valid).toBe(false);
      } finally {
        cleanup();
      }
    });

    it("returns false when .obsidian is a file instead of a directory", async () => {
      const { path, cleanup } = createTempDir();
      try {
        writeFileSync(join(path, ".obsidian"), "not a directory");
        const store = new ObsidianVaultStore(path);

        const valid = await store.validate();
        expect(valid).toBe(false);
      } finally {
        cleanup();
      }
    });
  });

  // ========================================================================
  // flush()
  // ========================================================================

  describe("index generation", () => {
    it("writes a Bases index note when artifacts are pushed", async () => {
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);
        const artifact = makeArtifact({
          id: "index-write-1",
          kind: "decision",
          content: "index test",
        });

        await store.push(artifact);

        const indexPath = join(path, ".obsidian", "noesis", "_INDEX.md");
        expect(existsSync(indexPath)).toBe(true);

        const indexContent = readFileSync(indexPath, "utf-8");
        expect(indexContent).toContain("# Noesis Vault Index");
        expect(indexContent).toContain('filter: kind = "decision"');
      } finally {
        cleanup();
      }
    });
  });

  describe("flush()", () => {
    it("succeeds when retry buffer is empty", async () => {
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian"));
        const store = new ObsidianVaultStore(path);

        await expect(store.flush()).resolves.toBeUndefined();
        const indexPath = join(path, ".obsidian", "noesis", "_INDEX.md");
        expect(existsSync(indexPath)).toBe(true);
      } finally {
        cleanup();
      }
    });

    it("retries artifacts from the retry buffer and writes them to vault", async () => {
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian", "noesis", "decision"), { recursive: true });
        const store = new ObsidianVaultStore(path);

        // Prepare an artifact that conforms to VaultArtifactSchema
        const artifact = makeArtifact({
          id: "flush-ok-1",
          kind: "decision",
          content: "retried successfully",
        });

        // Pre-populate the retry buffer directly
        const retryDir = join(path, ".omp", "noesis");
        mkdirSync(retryDir, { recursive: true });
        const retryFile = join(retryDir, "vault-retry.json");
        writeFileSync(retryFile, JSON.stringify([artifact]));

        await store.flush();

        // Artifact should have been written to the vault
        const vaultPath = join(
          path, ".obsidian", "noesis", "decision", "flush-ok-1.md",
        );
        expect(existsSync(vaultPath)).toBe(true);
        const content = readFileSync(vaultPath, "utf-8");
        expect(content).toContain("id: flush-ok-1");

        // Retry buffer should be empty
        const buffer = JSON.parse(readFileSync(retryFile, "utf-8"));
        expect(buffer).toEqual([]);
      } finally {
        cleanup();
      }
    });

    it("leaves failed artifacts in retry buffer when flush retry fails", async () => {
      const { path, cleanup } = createTempDir();
      try {
        mkdirSync(join(path, ".obsidian", "noesis", "decision"), { recursive: true });
        const store = new ObsidianVaultStore(path);

        const artifact = makeArtifact({
          id: "flush-fail-1",
          kind: "decision",
          content: "will fail on retry",
        });

        // Pre-populate the retry buffer
        const retryDir = join(path, ".omp", "noesis");
        mkdirSync(retryDir, { recursive: true });
        const retryFile = join(retryDir, "vault-retry.json");
        writeFileSync(retryFile, JSON.stringify([artifact]));

        // Block the target file path with a directory so renameSync fails
        const vaultDir = join(path, ".obsidian", "noesis", "decision");
        mkdirSync(join(vaultDir, "flush-fail-1.md"));

        await store.flush();

        // Failed artifact should remain in the retry buffer
        const buffer = JSON.parse(readFileSync(retryFile, "utf-8"));
        expect(buffer).toHaveLength(1);
        expect(buffer[0].id).toBe("flush-fail-1");
      } finally {
        cleanup();
      }
    });
  });
});
