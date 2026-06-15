"use strict";

/**
 * On-disk retry buffer for failed vault pushes.
 *
 * All mutations are atomic so partial writes never corrupt the queue.
 * A missing file is treated as an empty queue — no setup required.
 */

import { writeAtomic, readJSON } from "../infrastructure/filesystem-store.js";
import type { VaultArtifact } from "../schema.js";
import { ensureNoesisDir } from "../shared/paths.js";
import { join } from "node:path";

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

  /** Append an artifact to the retry queue. */
  async enqueue(artifact: VaultArtifact): Promise<void> {
    const queue = (await readJSON<VaultArtifact[]>(this.#filePath)) ?? [];
    queue.push(artifact);
    await writeAtomic(this.#filePath, queue);
  }

  /**
   * Remove and return up to `maxCount` artifacts from the front of the queue.
   * Returns fewer items when the queue is shorter than `maxCount`.
   */
  async dequeue(maxCount: number): Promise<VaultArtifact[]> {
    const queue = (await readJSON<VaultArtifact[]>(this.#filePath)) ?? [];
    const removed = queue.splice(0, maxCount);
    await writeAtomic(this.#filePath, queue);
    return removed;
  }

  /** Return all queued artifacts without removing them. */
  async peek(): Promise<VaultArtifact[]> {
    return (await readJSON<VaultArtifact[]>(this.#filePath)) ?? [];
  }

  /** Remove every artifact from the retry queue. */
  async clear(): Promise<void> {
    await writeAtomic(this.#filePath, []);
  }

  /** Return the number of artifacts currently queued. */
  async count(): Promise<number> {
    const queue = (await readJSON<VaultArtifact[]>(this.#filePath)) ?? [];
    return queue.length;
  }
}
