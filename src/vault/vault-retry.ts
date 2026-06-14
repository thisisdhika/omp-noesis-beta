import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { ensureDir } from "../shared/paths.js";
import type { VaultArtifact } from "../schema.js";
import type { VaultStore } from "./vault-store.js";

const RETRY_PATH = ".omp/noesis/vault-retry.json";

/**
 * Retry buffer for failed vault pushes.
 *
 * When a vault push fails, the artifact is appended to a local retry file.
 * On the next successful push, the buffer is flushed — all queued artifacts
 * are pushed in order until one fails again.
 */
export class VaultRetry {
  private queue: VaultArtifact[] = [];

  constructor(private root: string) {
    this.load();
  }

  /** Buffer a failed artifact for later retry. */
  enqueue(artifact: VaultArtifact): void {
    this.queue.push(artifact);
    this.save();
  }

  /** Try to flush the queue through the given store. Clear on success. */
  async flush(store: VaultStore): Promise<void> {
    if (this.queue.length === 0) return;

    const remaining: VaultArtifact[] = [];
    for (const artifact of this.queue) {
      try {
        await store.push(artifact);
      } catch {
        remaining.push(artifact);
      }
    }

    this.queue = remaining;
    this.save();
  }

  /** Number of buffered artifacts. */
  get pending(): number {
    return this.queue.length;
  }

  private path(): string {
    return join(this.root, RETRY_PATH);
  }

  private load(): void {
    const p = this.path();
    if (!existsSync(p)) return;
    try {
      this.queue = JSON.parse(readFileSync(p, "utf-8")) as VaultArtifact[];
    } catch {
      this.queue = [];
    }
  }

  private save(): void {
    const p = this.path();
    ensureDir(join(this.root, ".omp", "noesis"));
    if (this.queue.length === 0) {
      try { unlinkSync(p); } catch { /* ok */ }
      return;
    }
    writeFileSync(p, JSON.stringify(this.queue, null, 2), "utf-8");
  }
}
