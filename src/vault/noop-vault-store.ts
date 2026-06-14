import type { VaultStore } from "./vault-store.js";
import type { VaultArtifact, VaultPullOptions, VaultPullResult } from "../schema.js";

/**
 * NoopVaultStore — a VaultStore implementation that accepts everything and
 * returns nothing. Useful as a default / disabled-vault backend so callers
 * never have to branch on whether a vault is configured.
 */
export class NoopVaultStore implements VaultStore {
  push(_artifact: VaultArtifact): Promise<void> {
    return Promise.resolve();
  }

  pull(_projectPath: string, _options: VaultPullOptions): Promise<VaultPullResult> {
    return Promise.resolve({ decisions: [], beliefs: [], learnings: [], patterns: [] });
  }

  search(_query: string, _projectPath: string, _maxResults: number): Promise<VaultArtifact[]> {
    return Promise.resolve([]);
  }

  validate(): Promise<boolean> {
    return Promise.resolve(true);
  }
}
