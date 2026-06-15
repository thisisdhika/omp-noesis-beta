"use strict";

/**
 * omp-noesis: No-Op Vault Store
 * Version: 0.1.0
 * Date: 2026-06-15
 *
 * Fallback vault store that discards all writes and returns empty results.
 * Used when no vault backend is configured or available.
 */

import type { VaultStore, VaultArtifact, VaultPullResult } from "./vault-store.js";

export class NoopVaultStore implements VaultStore {
  async push(_artifact: VaultArtifact): Promise<void> {
    // no-op: discard silently
  }

  async pull(_kind?: string, _maxResults?: number): Promise<VaultPullResult> {
    return {
      artifacts: [],
      source: "noop",
      timestamp: new Date().toISOString(),
    };
  }

  async search(
    _query: string,
    _kind?: string,
    _maxResults?: number,
  ): Promise<VaultArtifact[]> {
    return [];
  }

  async validate(): Promise<boolean> {
    return false;
  }
}
