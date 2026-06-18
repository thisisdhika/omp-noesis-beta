"use strict";

import { describe, it, expect, beforeEach } from "bun:test";
import type { VaultStore, VaultArtifact, VaultPullResult } from "../../../src/vault/vault-store.js";
import { CompositeVaultStore } from "../../../src/vault/composite-vault-store.js";

// ============================================================================
// FAKE VAULT STORES — test doubles that record calls and return configured results
// ============================================================================

class FakeVaultStore implements VaultStore {
  readonly calls: Array<{ method: string; args: unknown[] }> = [];
  readonly artifacts: VaultArtifact[] = [];
  pushError: Error | null = null;
  validateResult: boolean = true;
  validateError: Error | null = null;
  flushError: Error | null = null;

  async push(artifact: VaultArtifact): Promise<void> {
    this.calls.push({ method: "push", args: [artifact] });
    this.artifacts.push(artifact);
    if (this.pushError) throw this.pushError;
  }

  async pull(kind?: string, maxResults?: number): Promise<VaultPullResult> {
    this.calls.push({ method: "pull", args: [kind, maxResults] });
    const filtered = kind
      ? this.artifacts.filter(a => a.kind === kind)
      : [...this.artifacts];
    const limited = maxResults !== undefined ? filtered.slice(0, maxResults) : filtered;
    return {
      artifacts: limited,
      source: "fake",
      timestamp: new Date().toISOString(),
    };
  }

  async search(query: string, kind?: string, maxResults?: number): Promise<VaultArtifact[]> {
    this.calls.push({ method: "search", args: [query, kind, maxResults] });
    return [];
  }

  async validate(): Promise<boolean> {
    this.calls.push({ method: "validate", args: [] });
    if (this.validateError) throw this.validateError;
    return this.validateResult;
  }

  async flush(): Promise<void> {
    this.calls.push({ method: "flush", args: [] });
    if (this.flushError) throw this.flushError;
  }
}

/** A fake store that does NOT implement flush() — verifies optional method handling. */
class NoFlushFakeStore implements VaultStore {
  readonly calls: Array<{ method: string; args: unknown[] }> = [];

  async push(_artifact: VaultArtifact): Promise<void> {
    this.calls.push({ method: "push", args: [] });
  }

  async pull(_kind?: string, _maxResults?: number): Promise<VaultPullResult> {
    this.calls.push({ method: "pull", args: [] });
    return { artifacts: [], source: "noflush", timestamp: new Date().toISOString() };
  }

  async search(_query: string, _kind?: string, _maxResults?: number): Promise<VaultArtifact[]> {
    this.calls.push({ method: "search", args: [] });
    return [];
  }

  async validate(): Promise<boolean> {
    this.calls.push({ method: "validate", args: [] });
    return true;
  }

  // NOTE: No flush() method — tests verify CompositeVaultStore handles this gracefully
}

// ============================================================================
// HELPERS
// ============================================================================

function makeArtifact(overrides: Partial<VaultArtifact> & { id: string }): VaultArtifact {
  return {
    kind: "learning",
    projectPath: "/test",
    pushedAt: new Date().toISOString(),
    content: "test content",
    ...overrides,
  };
}

const LEARNING_ARTIFACT = makeArtifact({ id: "learn-1", kind: "learning", content: "learned something" });
const DECISION_ARTIFACT = makeArtifact({ id: "decide-1", kind: "decision", content: "decided something" });

// ============================================================================
// TESTS
// ============================================================================

describe("CompositeVaultStore", () => {
  let memory: FakeVaultStore;
  let projection: FakeVaultStore;
  let composite: CompositeVaultStore;

  beforeEach(() => {
    memory = new FakeVaultStore();
    projection = new FakeVaultStore();
    composite = new CompositeVaultStore(memory, projection);
  });

  // --------------------------------------------------------------------------
  // CONSTRUCTOR
  // --------------------------------------------------------------------------

  it("constructs without error and stores both backends", () => {
    expect(composite).toBeInstanceOf(CompositeVaultStore);
    // Delegation (tested below) proves both references are stored
  });

  // --------------------------------------------------------------------------
  // push
  // --------------------------------------------------------------------------

  describe("push", () => {
    it("delegates artifact to both memory and projection stores", async () => {
      await composite.push(LEARNING_ARTIFACT);

      expect(memory.calls).toHaveLength(1);
      expect(memory.calls[0]!.method).toBe("push");
      expect(memory.calls[0]!.args[0]).toEqual(LEARNING_ARTIFACT);

      expect(projection.calls).toHaveLength(1);
      expect(projection.calls[0]!.method).toBe("push");
      expect(projection.calls[0]!.args[0]).toEqual(LEARNING_ARTIFACT);
    });

    it("stores artifact in both backing stores", async () => {
      await composite.push(LEARNING_ARTIFACT);

      expect(memory.artifacts).toHaveLength(1);
      expect(memory.artifacts[0]!.id).toBe("learn-1");
      expect(projection.artifacts).toHaveLength(1);
      expect(projection.artifacts[0]!.id).toBe("learn-1");
    });

    it("calls both stores even when memory store rejects (allSettled swallows errors)", async () => {
      memory.pushError = new Error("memory write failed");
      const artifact = makeArtifact({ id: "push-memory-fail" });

      await expect(composite.push(artifact)).resolves.toBeUndefined();

      expect(memory.calls).toHaveLength(1);
      expect(memory.calls[0]!.method).toBe("push");
      // projection store still receives the artifact
      expect(projection.calls).toHaveLength(1);
      expect(projection.calls[0]!.method).toBe("push");
      expect(projection.artifacts).toHaveLength(1);
      expect(projection.artifacts[0]!.id).toBe("push-memory-fail");
    });

    it("calls both stores even when projection store rejects (allSettled swallows errors)", async () => {
      projection.pushError = new Error("projection write failed");
      const artifact = makeArtifact({ id: "push-projection-fail" });

      await expect(composite.push(artifact)).resolves.toBeUndefined();

      expect(memory.calls).toHaveLength(1);
      expect(memory.artifacts).toHaveLength(1);
      expect(memory.artifacts[0]!.id).toBe("push-projection-fail");
      expect(projection.calls).toHaveLength(1);
    });

    it("does not throw when both stores reject", async () => {
      memory.pushError = new Error("memory error");
      projection.pushError = new Error("projection error");
      const artifact = makeArtifact({ id: "push-both-fail" });

      await expect(composite.push(artifact)).resolves.toBeUndefined();
    });

    it("does not throw when given a minimal valid artifact", async () => {
      const minimal = makeArtifact({ id: "minimal" });
      await expect(composite.push(minimal)).resolves.toBeUndefined();
    });

    it("preserves all artifact fields through delegation", async () => {
      const complex = makeArtifact({
        id: "complex-id",
        kind: "decision",
        projectPath: "/complex/path",
        content: "Complex decision with metadata",
        metadata: { priority: "high", count: 42, verified: true },
      });

      await composite.push(complex);

      expect(memory.artifacts[0]).toEqual(complex);
      expect(projection.artifacts[0]).toEqual(complex);
    });
  });

  // --------------------------------------------------------------------------
  // pull
  // --------------------------------------------------------------------------

  describe("pull", () => {
    it("delegates to memory store only", async () => {
      // Pre-populate memory with some artifacts
      memory.artifacts.push(LEARNING_ARTIFACT, DECISION_ARTIFACT);

      const result = await composite.pull();

      expect(memory.calls).toHaveLength(1);
      expect(memory.calls[0]!.method).toBe("pull");
      // Projection should NOT be called for reads
      expect(projection.calls).toHaveLength(0);
    });

    it("returns all artifacts from memory without filters", async () => {
      memory.artifacts.push(LEARNING_ARTIFACT, DECISION_ARTIFACT);

      const result = await composite.pull();

      expect(result.artifacts).toHaveLength(2);
      expect(result.source).toBe("fake");
      expect(result.timestamp).toBeDefined();
    });

    it("passes kind filter to memory store", async () => {
      memory.artifacts.push(LEARNING_ARTIFACT, DECISION_ARTIFACT);

      const result = await composite.pull("learning");

      expect(memory.calls[0]!.args[0]).toBe("learning");
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0]!.kind).toBe("learning");
    });

    it("passes maxResults limit to memory store", async () => {
      for (let i = 0; i < 5; i++) {
        memory.artifacts.push(makeArtifact({ id: `item-${i}` }));
      }

      const result = await composite.pull(undefined, 2);

      expect(memory.calls[0]!.args[1]).toBe(2);
      expect(result.artifacts).toHaveLength(2);
    });

    it("passes both kind and maxResults to memory store", async () => {
      memory.artifacts.push(
        makeArtifact({ id: "d1", kind: "decision" }),
        makeArtifact({ id: "d2", kind: "decision" }),
        makeArtifact({ id: "l1", kind: "learning" }),
      );

      const result = await composite.pull("decision", 1);

      expect(memory.calls[0]!.args[0]).toBe("decision");
      expect(memory.calls[0]!.args[1]).toBe(1);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0]!.kind).toBe("decision");
    });

    it("returns empty artifacts when memory store is empty", async () => {
      const result = await composite.pull();

      expect(result.artifacts).toEqual([]);
      expect(result.source).toBe("fake");
      expect(result.timestamp).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // search
  // --------------------------------------------------------------------------

  describe("search", () => {
    it("delegates to memory store only", async () => {
      await composite.search("test query");

      expect(memory.calls).toHaveLength(1);
      expect(memory.calls[0]!.method).toBe("search");
      expect(memory.calls[0]!.args[0]).toBe("test query");
      // Projection should NOT be called for searches
      expect(projection.calls).toHaveLength(0);
    });

    it("passes query, kind, and maxResults to memory store", async () => {
      await composite.search("find me", "learning", 5);

      expect(memory.calls[0]!.args).toEqual(["find me", "learning", 5]);
    });

    it("passes undefined kind and maxResults when omitted", async () => {
      await composite.search("search");

      expect(memory.calls[0]!.args[0]).toBe("search");
      expect(memory.calls[0]!.args[1]).toBeUndefined();
      expect(memory.calls[0]!.args[2]).toBeUndefined();
    });

    it("returns results from memory store", async () => {
      // Override search to return specific results
      const expectedResults = [LEARNING_ARTIFACT];
      memory.search = async () => expectedResults;

      const results = await composite.search("test");

      expect(results).toBe(expectedResults);
    });

    it("returns empty array when memory store finds nothing", async () => {
      const results = await composite.search("nonexistent");

      expect(results).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // validate
  // --------------------------------------------------------------------------

  describe("validate", () => {
    it("calls validate on both stores", async () => {
      const result = await composite.validate();

      expect(result).toBe(true);
      expect(memory.calls).toHaveLength(1);
      expect(memory.calls[0]!.method).toBe("validate");
      expect(projection.calls).toHaveLength(1);
      expect(projection.calls[0]!.method).toBe("validate");
    });

    it("returns true when both stores validate successfully", async () => {
      memory.validateResult = true;
      projection.validateResult = true;

      const result = await composite.validate();

      expect(result).toBe(true);
    });

    it("returns true when only memory store validates", async () => {
      memory.validateResult = true;
      projection.validateResult = false;

      const result = await composite.validate();

      expect(result).toBe(true);
    });

    it("returns true when only projection store validates", async () => {
      memory.validateResult = false;
      projection.validateResult = true;

      const result = await composite.validate();

      expect(result).toBe(true);
    });

    it("returns false when both stores fail", async () => {
      memory.validateResult = false;
      projection.validateResult = false;

      const result = await composite.validate();

      expect(result).toBe(false);
    });

    it("handles throw from memory store and falls back to projection", async () => {
      memory.validateError = new Error("memory unavailable");

      const result = await composite.validate();

      expect(result).toBe(true);
      expect(projection.calls).toHaveLength(1);
    });

    it("handles throw from projection store and falls back to memory", async () => {
      projection.validateError = new Error("projection unavailable");

      const result = await composite.validate();

      expect(result).toBe(true);
    });

    it("returns false when both stores throw", async () => {
      memory.validateError = new Error("memory error");
      projection.validateError = new Error("projection error");

      const result = await composite.validate();

      expect(result).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // flush
  // --------------------------------------------------------------------------

  describe("flush", () => {
    it("calls flush on both stores when both implement it", async () => {
      await composite.flush();

      expect(memory.calls).toHaveLength(1);
      expect(memory.calls[0]!.method).toBe("flush");
      expect(projection.calls).toHaveLength(1);
      expect(projection.calls[0]!.method).toBe("flush");
    });

    it("resolves without error when both flushes succeed", async () => {
      await expect(composite.flush()).resolves.toBeUndefined();
    });

    it("handles memory flush rejection gracefully (allSettled)", async () => {
      memory.flushError = new Error("flush failed");

      await expect(composite.flush()).resolves.toBeUndefined();
      expect(memory.calls).toHaveLength(1);
      expect(projection.calls).toHaveLength(1);
    });

    it("handles projection flush rejection gracefully (allSettled)", async () => {
      projection.flushError = new Error("flush failed");

      await expect(composite.flush()).resolves.toBeUndefined();
      expect(memory.calls).toHaveLength(1);
      expect(projection.calls).toHaveLength(1);
    });

    it("handles both flushes rejecting gracefully", async () => {
      memory.flushError = new Error("memory flush error");
      projection.flushError = new Error("projection flush error");

      await expect(composite.flush()).resolves.toBeUndefined();
    });

    it("works when neither store implements flush()", async () => {
      const noFlushMemory = new NoFlushFakeStore();
      const noFlushProjection = new NoFlushFakeStore();
      const compositeNoFlush = new CompositeVaultStore(noFlushMemory, noFlushProjection);

      await expect(compositeNoFlush.flush()).resolves.toBeUndefined();

      // NoFlushFakeStore does NOT have flush, so we cannot check calls
      // — the test passes if no error is thrown
    });

    it("works when only memory implements flush()", async () => {
      const noFlushProjection = new NoFlushFakeStore();
      const compositePartial = new CompositeVaultStore(memory, noFlushProjection);

      await expect(compositePartial.flush()).resolves.toBeUndefined();

      expect(memory.calls).toHaveLength(1);
      expect(memory.calls[0]!.method).toBe("flush");
    });

    it("works when only projection implements flush()", async () => {
      const noFlushMemory = new NoFlushFakeStore();
      const compositePartial = new CompositeVaultStore(noFlushMemory, projection);

      await expect(compositePartial.flush()).resolves.toBeUndefined();

      expect(projection.calls).toHaveLength(1);
      expect(projection.calls[0]!.method).toBe("flush");
    });
  });
});
