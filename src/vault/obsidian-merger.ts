"use strict";

/**
 * omp-noesis: Obsidian Artifact Merger
 * Version: 0.1.0
 *
 * Provides a simple latest-write-wins merge strategy for vault artifacts.
 * Used when reconciling locally-pulled artifacts with incoming ones.
 */

import type { VaultArtifact } from "./vault-store.js";

/**
 * Merge an incoming artifact into an existing one.
 *
 * Strategy: latest-write-wins — the incoming artifact's fields take
 * precedence except:
 * - `id` is preserved from the existing artifact
 * - `pushedAt` is always updated to the current time
 * - `metadata` is shallow-merged with incoming values overriding
 *
 * @param existing - The artifact currently in the vault
 * @param incoming - The new artifact to merge in
 * @returns A new VaultArtifact representing the merged result
 */
export function mergeInto(
  existing: VaultArtifact,
  incoming: VaultArtifact,
): VaultArtifact {
  return {
    ...incoming,
    id: existing.id,
    pushedAt: new Date().toISOString(),
    metadata: {
      ...(existing.metadata ?? {}),
      ...(incoming.metadata ?? {}),
    },
  };
}
