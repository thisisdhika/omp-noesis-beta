"use strict";

import { describe, it, expect } from "bun:test";
import type { VaultArtifact } from "../../../src/schema.js";
import { createTempDir } from "../../../tests/helpers/temp-dir.js";
import { RetryBuffer } from "../../../src/vault/vault-retry.js";

describe("VaultRetry", () => {
  function makeArtifact(overrides: Partial<VaultArtifact> & { id: string }): VaultArtifact {
    return {
      kind: "learning",
      projectPath: "/test",
      pushedAt: new Date().toISOString(),
      content: "test",
      ...overrides,
    };
  }

  it("enqueue increments count", async () => {
    const { path, cleanup } = createTempDir();
    try {
      const buf = new RetryBuffer(path);
      await buf.enqueue(makeArtifact({ id: "cnt-1" }));
      expect(await buf.count()).toBe(1);

      await buf.enqueue(makeArtifact({ id: "cnt-2" }));
      expect(await buf.count()).toBe(2);

      await buf.clear();
    } finally {
      cleanup();
    }
  });

  it("enqueue + dequeue roundtrip", async () => {
    const { path, cleanup } = createTempDir();
    try {
      const buf = new RetryBuffer(path);
      await buf.enqueue(makeArtifact({ id: "rnd-1" }));
      expect(await buf.count()).toBe(1);

      const items = await buf.dequeue(1);
      expect(items).toHaveLength(1);
      expect(items[0]!.id).toBe("rnd-1");
      expect(await buf.count()).toBe(0);

      await buf.clear();
    } finally {
      cleanup();
    }
  });

  it("peek returns items without removing them", async () => {
    const { path, cleanup } = createTempDir();
    try {
      const buf = new RetryBuffer(path);
      await buf.enqueue(makeArtifact({ id: "pek-1" }));

      const peeked = await buf.peek();
      expect(peeked).toHaveLength(1);
      expect(peeked[0]!.id).toBe("pek-1");
      expect(await buf.count()).toBe(1);

      await buf.clear();
    } finally {
      cleanup();
    }
  });

  it("clear empties the queue", async () => {
    const { path, cleanup } = createTempDir();
    try {
      const buf = new RetryBuffer(path);
      await buf.enqueue(makeArtifact({ id: "clr-1" }));
      await buf.enqueue(makeArtifact({ id: "clr-2" }));
      expect(await buf.count()).toBe(2);

      await buf.clear();
      expect(await buf.count()).toBe(0);
    } finally {
      cleanup();
    }
  });

  it("dequeue more than queue size returns all items", async () => {
    const { path, cleanup } = createTempDir();
    try {
      const buf = new RetryBuffer(path);
      await buf.enqueue(makeArtifact({ id: "max-1" }));
      await buf.enqueue(makeArtifact({ id: "max-2" }));

      const items = await buf.dequeue(10);
      expect(items).toHaveLength(2);
      expect(await buf.count()).toBe(0);

      await buf.clear();
    } finally {
      cleanup();
    }
  });

  it("dequeue on empty queue returns empty array", async () => {
    const { path, cleanup } = createTempDir();
    try {
      const buf = new RetryBuffer(path);
      const items = await buf.dequeue(5);
      expect(items).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("count on empty queue returns zero", async () => {
    const { path, cleanup } = createTempDir();
    try {
      const buf = new RetryBuffer(path);
      expect(await buf.count()).toBe(0);
    } finally {
      cleanup();
    }
  });

  it("clear on empty queue does not throw", async () => {
    const { path, cleanup } = createTempDir();
    try {
      const buf = new RetryBuffer(path);
      await buf.clear();
      expect(await buf.count()).toBe(0);
    } finally {
      cleanup();
    }
  });
});
