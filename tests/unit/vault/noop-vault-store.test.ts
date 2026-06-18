"use strict";

/**
 * Unit tests for NoopVaultStore — fallback vault store that discards writes.
 *
 * Tests that all four methods behave as documented:
 * push() silently discards, pull() returns empty, search() returns empty,
 * validate() returns false.
 */

import { describe, it, expect } from "bun:test";
import { NoopVaultStore } from "../../../src/vault/noop-vault-store.js";

describe("NoopVaultStore", () => {
  describe("constructor", () => {
    it("should construct a new instance", () => {
      const store = new NoopVaultStore();
      expect(store).toBeDefined();
      expect(store.constructor.name).toBe("NoopVaultStore");
    });
  });

  describe("push", () => {
    it("should silently discard artifacts without throwing", async () => {
      const store = new NoopVaultStore();
      await expect(
        store.push({ id: "test-1", content: "test content", kind: "belief", projectPath: "/tmp", pushedAt: new Date().toISOString() })
      ).resolves.toBeUndefined();
    });

    it("should handle empty content without error", async () => {
      const store = new NoopVaultStore();
      await expect(
        store.push({ id: "test-2", content: "", kind: "decision", projectPath: "/tmp", pushedAt: new Date().toISOString() })
      ).resolves.toBeUndefined();
    });
  });

  describe("pull", () => {
    it("should return empty results with noop source", async () => {
      const store = new NoopVaultStore();
      const result = await store.pull();
      expect(result.artifacts).toBeEmpty();
      expect(result.source).toBe("noop");
      expect(typeof result.timestamp).toBe("string");
    });

    it("should accept optional kind and maxResults parameters", async () => {
      const store = new NoopVaultStore();
      const result = await store.pull("belief", 10);
      expect(result.artifacts).toBeEmpty();
      expect(result.source).toBe("noop");
    });
  });

  describe("search", () => {
    it("should return empty array", async () => {
      const store = new NoopVaultStore();
      const results = await store.search("anything");
      expect(results).toBeEmpty();
    });

    it("should accept optional kind and maxResults parameters", async () => {
      const store = new NoopVaultStore();
      const results = await store.search("query", "belief", 5);
      expect(results).toBeEmpty();
    });
  });

  describe("validate", () => {
    it("should return false", async () => {
      const store = new NoopVaultStore();
      const valid = await store.validate();
      expect(valid).toBeFalse();
    });
  });
});
