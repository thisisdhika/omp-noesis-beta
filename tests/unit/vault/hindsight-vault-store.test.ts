"use strict";

import { describe, it, expect } from "bun:test";
import type { VaultArtifact } from "../../../src/schema.js";
import { HindsightVaultStore } from "../../../src/vault/hindsight-vault-store.js";

describe("HindsightVaultStore", () => {
  const artifact: VaultArtifact = {
    kind: "learning",
    projectPath: "/test",
    id: "hs-1",
    pushedAt: new Date().toISOString(),
    content: "test artifact",
  };

  it("push does not throw", async () => {
    const store = new HindsightVaultStore();
    await store.push(artifact);
    // Should complete without error
  });

  it("pull returns empty result with hindsight source", async () => {
    const store = new HindsightVaultStore();
    const result = await store.pull();
    expect(result.artifacts).toEqual([]);
    expect(result.source).toBe("hindsight");
    expect(result.timestamp).toBeDefined();
  });

  it("search returns empty array", async () => {
    const store = new HindsightVaultStore();
    const results = await store.search("anything");
    expect(results).toEqual([]);
  });

  it("validate returns false", async () => {
    const store = new HindsightVaultStore();
    const valid = await store.validate();
    expect(valid).toBe(false);
  });

  it("constructor stores optional API key without error", () => {
    const store = new HindsightVaultStore("test-api-key-123");
    expect(store).toBeInstanceOf(HindsightVaultStore);
  });
});
