"use strict";

/**
 * Unit tests for vault-retry — RetryBuffer class.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { createTempDir } from "../../helpers/temp-dir.js";
import { RetryBuffer } from "../../../src/vault/vault-retry.js";
import type { VaultArtifact } from "../../../src/shared/schema.js";

function makeArtifact(overrides?: Partial<VaultArtifact>): VaultArtifact {
  return {
    kind: "decision",
    projectPath: "/test",
    id: `test-${Math.random().toString(36).slice(2, 8)}`,
    pushedAt: new Date().toISOString(),
    content: "test content",
    ...overrides,
  };
}

describe("RetryBuffer", () => {
  let tempDir: { path: string; cleanup(): void };

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    tempDir.cleanup();
  });

  // ── basic operations ─────────────────────────────────────────────────

  it("starts empty", async () => {
    const buf = new RetryBuffer(tempDir.path);
    expect(await buf.count()).toBe(0);
    expect(await buf.peek()).toEqual([]);
  });

  it("enqueue adds an artifact", async () => {
    const buf = new RetryBuffer(tempDir.path);
    const a = makeArtifact();
    await buf.enqueue(a);
    expect(await buf.count()).toBe(1);
    expect(await buf.peek()).toHaveLength(1);
  });

  it("enqueue appends multiple artifacts", async () => {
    const buf = new RetryBuffer(tempDir.path);
    const a = makeArtifact({ id: "first" });
    const b = makeArtifact({ id: "second" });
    await buf.enqueue(a);
    await buf.enqueue(b);
    expect(await buf.count()).toBe(2);
    const items = await buf.peek();
    expect(items[0]!.id).toBe("first");
    expect(items[1]!.id).toBe("second");
  });

  it("dequeue removes and returns up to maxCount items", async () => {
    const buf = new RetryBuffer(tempDir.path);
    const a = makeArtifact({ id: "a" });
    const b = makeArtifact({ id: "b" });
    const c = makeArtifact({ id: "c" });
    await buf.enqueue(a);
    await buf.enqueue(b);
    await buf.enqueue(c);

    const removed = await buf.dequeue(2);
    expect(removed).toHaveLength(2);
    expect(removed[0]!.id).toBe("a");
    expect(removed[1]!.id).toBe("b");
    expect(await buf.count()).toBe(1);
    expect((await buf.peek())[0]!.id).toBe("c");
  });

  it("dequeue returns fewer items when queue is shorter than maxCount", async () => {
    const buf = new RetryBuffer(tempDir.path);
    await buf.enqueue(makeArtifact());
    const removed = await buf.dequeue(10);
    expect(removed).toHaveLength(1);
    expect(await buf.count()).toBe(0);
  });

  it("clear removes all artifacts", async () => {
    const buf = new RetryBuffer(tempDir.path);
    await buf.enqueue(makeArtifact());
    await buf.enqueue(makeArtifact());
    await buf.clear();
    expect(await buf.count()).toBe(0);
    expect(await buf.peek()).toEqual([]);
  });

  it("count returns zero for empty buffer", async () => {
    const buf = new RetryBuffer(tempDir.path);
    expect(await buf.count()).toBe(0);
  });

  // ── flush with empty buffer ─────────────────────────────────────────

  it("returns zeroes when flush is called on empty buffer", async () => {
    const buf = new RetryBuffer(tempDir.path);
    const result = await buf.flush(async () => {});
    expect(result).toEqual({ succeeded: 0, failed: 0 });
  });

  // ── mixed success/failure flush ─────────────────────────────────────

  it("reports succeeded and failed counts when some artifacts throw", async () => {
    const buf = new RetryBuffer(tempDir.path);
    const good = makeArtifact({ id: "good" });
    const bad = makeArtifact({ id: "bad" });
    await buf.enqueue(good);
    await buf.enqueue(bad);

    const result = await buf.flush(async (a) => {
      if (a.id === "bad") throw new Error("fail");
    });
    expect(result).toEqual({ succeeded: 1, failed: 1 });

    // The failed artifact remains in the queue
    expect(await buf.count()).toBe(1);
    expect((await buf.peek())[0]!.id).toBe("bad");
  });

  it("removes all artifacts when all flush succeed", async () => {
    const buf = new RetryBuffer(tempDir.path);
    await buf.enqueue(makeArtifact());
    await buf.enqueue(makeArtifact());

    const result = await buf.flush(async () => {});
    expect(result).toEqual({ succeeded: 2, failed: 0 });
    expect(await buf.count()).toBe(0);
  });

  it("keeps all artifacts when all flush fail", async () => {
    const buf = new RetryBuffer(tempDir.path);
    await buf.enqueue(makeArtifact());
    await buf.enqueue(makeArtifact());

    const result = await buf.flush(async () => {
      throw new Error("fail");
    });
    expect(result).toEqual({ succeeded: 0, failed: 2 });
    expect(await buf.count()).toBe(2);
  });

  it("writes an empty queue to disk when all artifacts succeed", async () => {
    const buf = new RetryBuffer(tempDir.path);
    await buf.enqueue(makeArtifact());
    await buf.flush(async () => {});

    const filePath = join(tempDir.path, ".omp", "noesis", "vault-retry.json");
    const content = await Bun.file(filePath).json();
    expect(content).toEqual([]);
  });

  // ── push after flush ────────────────────────────────────────────────

  it("can enqueue new artifacts after a flush", async () => {
    const buf = new RetryBuffer(tempDir.path);
    await buf.enqueue(makeArtifact({ id: "before" }));
    await buf.flush(async () => {});

    await buf.enqueue(makeArtifact({ id: "after" }));
    expect(await buf.count()).toBe(1);
    expect((await buf.peek())[0]!.id).toBe("after");
  });

  it("can flush again after a flush", async () => {
    const buf = new RetryBuffer(tempDir.path);
    await buf.enqueue(makeArtifact({ id: "a" }));
    await buf.flush(async () => {});

    await buf.enqueue(makeArtifact({ id: "b" }));
    const result = await buf.flush(async () => {});
    expect(result).toEqual({ succeeded: 1, failed: 0 });
    expect(await buf.count()).toBe(0);
  });

  // ── max retries exhausted behavior ──────────────────────────────────

  it("preserves failing artifacts across multiple flush cycles", async () => {
    const buf = new RetryBuffer(tempDir.path);
    const a = makeArtifact({ id: "persist-a" });
    const b = makeArtifact({ id: "persist-b" });
    await buf.enqueue(a);
    await buf.enqueue(b);

    // First flush — all fail
    const r1 = await buf.flush(async () => {
      throw new Error("still failing");
    });
    expect(r1).toEqual({ succeeded: 0, failed: 2 });
    expect(await buf.count()).toBe(2);

    // Second flush — all fail again (same artifacts preserved)
    const r2 = await buf.flush(async () => {
      throw new Error("still failing");
    });
    expect(r2).toEqual({ succeeded: 0, failed: 2 });
    expect(await buf.count()).toBe(2);

    // Artifacts are still in the queue, unchanged
    const items = await buf.peek();
    expect(items[0]!.id).toBe("persist-a");
    expect(items[1]!.id).toBe("persist-b");
  });

  it("recovers from repeated failures when writer starts succeeding", async () => {
    const buf = new RetryBuffer(tempDir.path);
    await buf.enqueue(makeArtifact({ id: "recover" }));

    // First flush — fails
    await buf.flush(async () => { throw new Error("fail"); });
    expect(await buf.count()).toBe(1);

    // Second flush — succeeds
    const r2 = await buf.flush(async () => {});
    expect(r2).toEqual({ succeeded: 1, failed: 0 });
    expect(await buf.count()).toBe(0);
  });

  // ── flush racing behavior ───────────────────────────────────────────

  it("handles concurrent flush calls without corrupting the queue", async () => {
    const buf = new RetryBuffer(tempDir.path);
    const a = makeArtifact({ id: "race-a" });
    const b = makeArtifact({ id: "race-b" });
    await buf.enqueue(a);
    await buf.enqueue(b);

    // Two concurrent flushes: one succeeds on everything, one fails on everything.
    // Depending on who writes last, either all items are removed (empty queue)
    // or all items are preserved (2 items). The queue should never be corrupt
    // (partial artifacts, unparseable JSON, or items with wrong shape).
    await Promise.all([
      buf.flush(async () => {}),
      buf.flush(async () => { throw new Error("slow"); }),
    ]);

    // The queue must contain only valid artifacts — no corruption
    // (either 0 or 2 items depending on flush ordering)
    const count = await buf.count();
    expect(count === 0 || count === 2).toBe(true);

    if (count > 0) {
      const items = await buf.peek();
      expect(items[0]!.id).toBe("race-a");
      expect(items[1]!.id).toBe("race-b");
    }
  });

  it("handles concurrent flush and enqueue without corruption", async () => {
    const buf = new RetryBuffer(tempDir.path);
    await buf.enqueue(makeArtifact({ id: "first" }));

    // Concurrent: flush processes, enqueue adds
    await Promise.all([
      buf.flush(async () => {}),
      buf.enqueue(makeArtifact({ id: "concurrent" })),
    ]);

    // Queue must be valid and contain exactly the artifacts from whoever
    // ran last — never corrupt data or partial writes
    const items = await buf.peek();
    for (const item of items) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("kind");
      expect(item).toHaveProperty("content");
    }
  });

  // ── writer exceptions (non-Error throws) ────────────────────────────

  it("handles writer that throws a string", async () => {
    const buf = new RetryBuffer(tempDir.path);
    await buf.enqueue(makeArtifact());
    const result = await buf.flush(async () => {
      throw "string error"; // eslint-disable-line no-throw-literal
    });
    expect(result).toEqual({ succeeded: 0, failed: 1 });
    expect(await buf.count()).toBe(1);
  });

  it("handles writer that returns normally for some and throws for others in order", async () => {
    const buf = new RetryBuffer(tempDir.path);
    const items = [
      makeArtifact({ id: "1" }),
      makeArtifact({ id: "2" }),
      makeArtifact({ id: "3" }),
      makeArtifact({ id: "4" }),
    ];
    for (const item of items) await buf.enqueue(item);

    // Writer: fail on even-numbered items
    const result = await buf.flush(async (a) => {
      if (a.id === "2" || a.id === "4") throw new Error("even fail");
    });
    expect(result).toEqual({ succeeded: 2, failed: 2 });
    expect(await buf.count()).toBe(2);
    const remaining = await buf.peek();
    expect(remaining[0]!.id).toBe("2");
    expect(remaining[1]!.id).toBe("4");
  });

  // ── queue persistence ───────────────────────────────────────────────

  it("persists queued artifacts across RetryBuffer instances", async () => {
    const buf = new RetryBuffer(tempDir.path);
    await buf.enqueue(makeArtifact({ id: "persist-me" }));
    expect(await buf.count()).toBe(1);

    // New instance, same path — should see the same queue
    const buf2 = new RetryBuffer(tempDir.path);
    expect(await buf2.count()).toBe(1);
    expect((await buf2.peek())[0]!.id).toBe("persist-me");
  });

  it("missing queue file is treated as empty queue", async () => {
    const buf = new RetryBuffer(tempDir.path);
    expect(await buf.count()).toBe(0);
    expect(await buf.peek()).toEqual([]);
    const result = await buf.flush(async () => {});
    expect(result).toEqual({ succeeded: 0, failed: 0 });
  });
});
