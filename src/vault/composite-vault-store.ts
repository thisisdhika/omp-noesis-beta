"use strict";

/**
 * omp-noesis: Composite Vault Store
 * Version: 0.1.0
 *
 * Combines a memory backend (mnemopi/local) for reads/search with a projection
 * backend (obsidian) for display.  Pushes go to both stores in parallel but
 * reads come exclusively from the memory backend, because it is the source of
 * truth for structured retrieval.
 *
 * @module vault/composite-vault-store
 */

import type { VaultStore, VaultArtifact, VaultPullResult } from "./vault-store.js";

export class CompositeVaultStore implements VaultStore {
  readonly #memory: VaultStore;
  readonly #projection: VaultStore;

  constructor(memory: VaultStore, projection: VaultStore) {
    this.#memory = memory;
    this.#projection = projection;
  }

  async push(artifact: VaultArtifact): Promise<void> {
    await Promise.allSettled([
      this.#memory.push(artifact),
      this.#projection.push(artifact),
    ]);
  }

  async pull(kind?: string, maxResults?: number): Promise<VaultPullResult> {
    return this.#memory.pull(kind, maxResults);
  }

  async search(query: string, kind?: string, maxResults?: number): Promise<VaultArtifact[]> {
    return this.#memory.search(query, kind, maxResults);
  }

  async validate(): Promise<boolean> {
    const results = await Promise.allSettled([
      this.#memory.validate(),
      this.#projection.validate(),
    ]);
    // At least one must be valid
    return results.some(r => r.status === "fulfilled" && r.value === true);
  }

  async flush(): Promise<void> {
    await Promise.allSettled([
      this.#memory.flush?.() ?? Promise.resolve(),
      this.#projection.flush?.() ?? Promise.resolve(),
    ]);
  }

  async sync(): Promise<void> {
    const projResult = await this.#projection.pull(undefined, 1000);
    const memResult = await this.#memory.pull(undefined, 1000);
    
    const memMap = new Map<string, VaultArtifact>();
    for (const a of memResult.artifacts) {
      memMap.set(a.id, a);
    }

    const pushes: Promise<void>[] = [];
    for (const proj of projResult.artifacts) {
      const mem = memMap.get(proj.id);
      
      if (!mem) {
        // Exists in projection but not in memory -> human created it or memory wiped
        pushes.push(this.#memory.push(proj));
      } else {
        const projTime = Date.parse(proj.pushedAt) || 0;
        const memTime = Date.parse(mem.pushedAt) || 0;
        
        const contentChanged = proj.content !== mem.content || JSON.stringify(proj.metadata) !== JSON.stringify(mem.metadata);
        
        // If projection is strictly newer, or if timestamps are identical but content changed (human edit without updating timestamp)
        if (projTime > memTime || (projTime === memTime && contentChanged)) {
          pushes.push(this.#memory.push(proj));
        }
      }
    }
    await Promise.allSettled(pushes);
  }
}
