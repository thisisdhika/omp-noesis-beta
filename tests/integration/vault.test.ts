"use strict";

/**
 * Integration test: Vault backends (noop, detector, retry).
 */
import { describe, it, expect } from "bun:test";
import type { VaultArtifact, VaultPullResult } from "../../src/schema.js";

describe("Vault Integration", () => {
  describe("NoopVaultStore", () => {
    it("push is a no-op", async () => {
      const { NoopVaultStore } = await import("../../src/vault/noop-vault-store.js");
      const store = new NoopVaultStore();
      const artifact: VaultArtifact = {
        kind: "decision",
        projectPath: "/test",
        id: "test-1",
        pushedAt: new Date().toISOString(),
        content: "test decision",
      };
      await store.push(artifact);
      // Should not throw
    });

    it("pull returns empty result", async () => {
      const { NoopVaultStore } = await import("../../src/vault/noop-vault-store.js");
      const store = new NoopVaultStore();
      const result = await store.pull();
      expect(result.artifacts).toEqual([]);
      expect(result.source).toBe("noop");
      expect(result.timestamp).toBeDefined();
    });

    it("search returns empty array", async () => {
      const { NoopVaultStore } = await import("../../src/vault/noop-vault-store.js");
      const store = new NoopVaultStore();
      const results = await store.search("anything");
      expect(results).toEqual([]);
    });

    it("validate returns false", async () => {
      const { NoopVaultStore } = await import("../../src/vault/noop-vault-store.js");
      const store = new NoopVaultStore();
      expect(await store.validate()).toBe(false);
    });
  });

  describe("RetryBuffer", () => {
    it("enqueue + dequeue roundtrip", async () => {
      const { RetryBuffer } = await import("../../src/vault/vault-retry.js");
      const buf = new RetryBuffer(process.cwd());

      const artifact: VaultArtifact = {
        kind: "learning",
        projectPath: "/test",
        id: "rt-1",
        pushedAt: new Date().toISOString(),
        content: "test",
      };

      await buf.enqueue(artifact);
      expect(await buf.count()).toBe(1);

      const items = await buf.dequeue(1);
      expect(items.length).toBe(1);
      expect(items[0]!.id).toBe("rt-1");
      expect(await buf.count()).toBe(0);

      await buf.clear();
    });

    it("peek does not remove items", async () => {
      const { RetryBuffer } = await import("../../src/vault/vault-retry.js");
      const buf = new RetryBuffer(process.cwd());

      const artifact: VaultArtifact = {
        kind: "learning",
        projectPath: "/test",
        id: "rt-2",
        pushedAt: new Date().toISOString(),
        content: "test",
      };

      await buf.enqueue(artifact);
      const peeked = await buf.peek();
      expect(peeked.length).toBe(1);
      expect(await buf.count()).toBe(1);

      await buf.clear();
    });

    it("clear empties the queue", async () => {
      const { RetryBuffer } = await import("../../src/vault/vault-retry.js");
      const buf = new RetryBuffer(process.cwd());

      const artifact: VaultArtifact = {
        kind: "learning",
        projectPath: "/test",
        id: "rt-3",
        pushedAt: new Date().toISOString(),
        content: "test",
      };

      await buf.enqueue(artifact);
      await buf.clear();
      expect(await buf.count()).toBe(0);
    });
  });
});
