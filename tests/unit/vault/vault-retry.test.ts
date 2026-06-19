"use strict";

import { describe, it, expect } from "bun:test";
import type { VaultArtifact } from "../../../src/shared/schema.js";
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

  // ============================================================================
  // FLUSH — lines 91–113 (primary coverage gap)
  // ============================================================================

  it("flush on empty queue returns zeroed result", async () => {
    const { path, cleanup } = createTempDir();
    try {
      const buf = new RetryBuffer(path);
      const result = await buf.flush(async () => {});
      expect(result).toEqual({ succeeded: 0, failed: 0 });
    } finally {
      cleanup();
    }
  });

  it("flush removes all items after successful writes", async () => {
    const { path, cleanup } = createTempDir();
    try {
      const buf = new RetryBuffer(path);
      await buf.enqueue(makeArtifact({ id: "fl-ok-1" }));
      await buf.enqueue(makeArtifact({ id: "fl-ok-2" }));

      const result = await buf.flush(async () => {});
      expect(result).toEqual({ succeeded: 2, failed: 0 });

      expect(await buf.peek()).toEqual([]);
      expect(await buf.count()).toBe(0);
    } finally {
      cleanup();
    }
  });

  it("flush preserves items whose writer throws", async () => {
    const { path, cleanup } = createTempDir();
    try {
      const buf = new RetryBuffer(path);
      await buf.enqueue(makeArtifact({ id: "fl-ok" }));
      await buf.enqueue(makeArtifact({ id: "fl-fail" }));
      await buf.enqueue(makeArtifact({ id: "fl-ok-2" }));

      const result = await buf.flush(async (artifact) => {
        if (artifact.id === "fl-fail") throw new Error("write failed");
      });
      expect(result).toEqual({ succeeded: 2, failed: 1 });

      const remaining = await buf.peek();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.id).toBe("fl-fail");
    } finally {
      cleanup();
    }
  });

  it("flush with all failures preserves every item", async () => {
    const { path, cleanup } = createTempDir();
    try {
      const buf = new RetryBuffer(path);
      await buf.enqueue(makeArtifact({ id: "fail-1" }));
      await buf.enqueue(makeArtifact({ id: "fail-2" }));

      const result = await buf.flush(async () => {
        throw new Error("always fails");
      });
      expect(result).toEqual({ succeeded: 0, failed: 2 });

      expect(await buf.count()).toBe(2);
    } finally {
      cleanup();
    }
  });
});
