"use strict";

/**
 * On-disk retry buffer for failed vault pushes.
 * Version: 0.1.0
 *
 * All mutations are atomic so partial writes never corrupt the queue.
 * A missing file is treated as an empty queue — no setup required.
 */

import { writeAtomic, readJSON } from "../infrastructure/filesystem-store.js";
import { VaultArtifactSchema } from "../shared/schema.js";
import type { VaultArtifact } from "../shared/schema.js";
import { ensureNoesisDir } from "../shared/paths.js";
import { join } from "node:path";

// ============================================================================
// FLUSH RESULT
// ============================================================================

export interface FlushResult {
  succeeded: number;
  failed: number;
}

// ============================================================================
// RETRY BUFFER
// ============================================================================

export class RetryBuffer {
  readonly #filePath: string;

  constructor(projectRoot: string) {
    this.#filePath = join(ensureNoesisDir(projectRoot), "vault-retry.json");
  }

  // --------------------------------------------------------------------------
  // PUBLIC API
  // --------------------------------------------------------------------------
  /** Read and validate the retry queue from disk. Returns an empty array when the file is missing. */
  async #readQueue(): Promise<VaultArtifact[]> {
    const data = await readJSON(this.#filePath);
    if (data === null) return [];
    return VaultArtifactSchema.array().parse(data);
  }

  /** Append an artifact to the retry queue. */
  async enqueue(artifact: VaultArtifact): Promise<void> {
    const queue = await this.#readQueue();
    queue.push(artifact);
    await writeAtomic(this.#filePath, queue);
  }

  /**
   * Remove and return up to `maxCount` artifacts from the front of the queue.
   * Returns fewer items when the queue is shorter than `maxCount`.
   */
  async dequeue(maxCount: number): Promise<VaultArtifact[]> {
    const queue = await this.#readQueue();
    const removed = queue.splice(0, maxCount);
    await writeAtomic(this.#filePath, queue);
    return removed;
  }

  /** Return all queued artifacts without removing them. */
  async peek(): Promise<VaultArtifact[]> {
    return this.#readQueue();
  }

  /** Remove every artifact from the retry queue. */
  async clear(): Promise<void> {
    await writeAtomic(this.#filePath, []);
  }

  /** Return the number of artifacts currently queued. */
  async count(): Promise<number> {
    const queue = await this.#readQueue();
    return queue.length;
  }

  /**
   * Retry all queued artifacts by passing each to the given writer function.
   *
   * Artifacts that succeed are removed from the queue; artifacts whose writer
   * throws are preserved for the next retry cycle.
   *
   * @param writer - Async function that durably writes a single artifact.
   *   This should be the low-level write (not `VaultStore.push()`, which may
   *   itself enqueue failures back into this buffer and cause a loop).
   */
  async flush(
    writer: (artifact: VaultArtifact) => Promise<void>,
  ): Promise<FlushResult> {
    const queue = await this.#readQueue();
    if (queue.length === 0) return { succeeded: 0, failed: 0 };

    const remaining: VaultArtifact[] = [];

    for (const artifact of queue) {
      try {
        await writer(artifact);
      } catch {
        remaining.push(artifact);
      }
    }

    await writeAtomic(this.#filePath, remaining);

    return {
      succeeded: queue.length - remaining.length,
      failed: remaining.length,
    };
  }
}
