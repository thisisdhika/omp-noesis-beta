"use strict";

/**
 * omp-noesis: Vault Backend Detector (simplified)
 * Version: 0.2.0
 *
 * Detects whether Obsidian projection should be used.
 * Memory backends (Mnemopi/Local) were removed in v0.2 - persistence
 * responsibility now belongs to state.json (primary) and OMP session
 * lifecycle (complement).
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { VaultStore, VaultArtifact, VaultPullResult } from "./vault-store.js";

export type ProjectionBackend = "obsidian" | "none";

/**
 * Detect the projection vault backend for the given project root.
 * Checks for .obsidian/ directory.
 */
export function detectProjectionBackend(projectRoot: string): ProjectionBackend {
  if (existsSync(join(projectRoot, ".obsidian"))) {
    return "obsidian";
  }
  return "none";
}

/**
 * Create a VaultStore instance appropriate for the project root.
 * After v0.2, only Obsidian projection remains.
 * If no .obsidian/ is found, returns a minimal no-op.
 */
export async function createVaultStore(projectRoot: string): Promise<VaultStore> {
  if (detectProjectionBackend(projectRoot) === "obsidian") {
    const { ObsidianVaultStore } = await import("./obsidian-vault-store.js");
    return new ObsidianVaultStore(projectRoot);
  }

  return {
    push: async (_artifact: VaultArtifact) => {},
    pull: async (_kind?: string, _maxResults?: number): Promise<VaultPullResult> =>
      ({ artifacts: [], source: "noop", timestamp: new Date().toISOString() }),
    search: async (_query: string, _kind?: string, _maxResults?: number): Promise<VaultArtifact[]> => [],
    validate: async (): Promise<boolean> => true,
    sync: async () => {},
    flush: async () => {},
  };
}
