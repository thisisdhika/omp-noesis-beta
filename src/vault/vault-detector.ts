"use strict";

/**
 * omp-noesis: Vault Backend Detector
 * Version: 0.1.0
 * Date: 2026-06-16
 *
 * Detects which vault backends a project should use based on filesystem heuristics.
 * Memory backends (structured persistence): mnemopi > local > none
 * Projection backends (display): obsidian > none
 * When both exist, a CompositeVaultStore bridges them.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { VaultStore } from "./vault-store.js";
import { NoopVaultStore } from "./noop-vault-store.js";

export type MemoryBackend = "mnemopi" | "hindsight" | "local" | "none";
export type ProjectionBackend = "obsidian" | "none";

/** @deprecated Use MemoryBackend | ProjectionBackend instead. */
export type VaultBackend = "obsidian" | "local" | "mnemopi" | "hindsight" | "none";

/**
 * Detect the memory vault backend for the given project root.
 *
 * Checks in priority order:
 *  1. .omp/mnemopi.db file exists           → "mnemopi"
 *  2. .omp/hindsight directory exists       → "hindsight"
 *  3. MEMORY.md file exists                 → "local"
 *  4. none of the above                     → "none"
 */
export function detectMemoryBackend(projectRoot: string): MemoryBackend {
  if (existsSync(join(projectRoot, ".omp", "mnemopi.db"))) {
    return "mnemopi";
  }

  if (existsSync(join(projectRoot, ".omp", "hindsight"))) {
    return "hindsight";
  }
  if (existsSync(join(projectRoot, "MEMORY.md"))) {
    return "local";
  }

  return "none";
}

/**
 * Detect the projection vault backend for the given project root.
 *
 * Checks:
 *  1. .obsidian/ directory exists           → "obsidian"
 *  2. none of the above                     → "none"
 */
export function detectProjectionBackend(projectRoot: string): ProjectionBackend {
  if (existsSync(join(projectRoot, ".obsidian"))) {
    return "obsidian";
  }

  return "none";
}

/**
 * Backward-compatible alias that replicates the original single-backend logic.
 * Checks .obsidian > .omp/hindsight > MEMORY.md > .omp/mnemopi.db > none.
 * @deprecated Use detectMemoryBackend / detectProjectionBackend instead.
 */
export function detectVaultBackend(projectRoot: string): VaultBackend {
  // Prioritise obsidian (projection) first to preserve original behaviour
  if (existsSync(join(projectRoot, ".obsidian"))) {
    return "obsidian";
  }
  if (existsSync(join(projectRoot, ".omp", "hindsight"))) {
    return "hindsight";
  }
  if (existsSync(join(projectRoot, "MEMORY.md"))) {
    return "local";
  }
  if (existsSync(join(projectRoot, ".omp", "mnemopi.db"))) {
    return "mnemopi";
  }
  return "none";
}

/**
 * Create a VaultStore instance appropriate for the project root.
 *
 * Uses CompositeVaultStore when both a memory backend and a projection backend
 * are detected. Falls back to the memory store alone if no projection exists,
 * or to NoopVaultStore when nothing is detected.
 *
 * Dynamically imports backend modules so unused backends are never loaded.
 */
export async function createVaultStore(projectRoot: string): Promise<VaultStore> {
  const memoryBackend = detectMemoryBackend(projectRoot);
  const projectionBackend = detectProjectionBackend(projectRoot);

  // Determine memory store
  let memoryStore: VaultStore | null = null;
  if (memoryBackend === "mnemopi") {
    const mod = await import("./mnemopi-vault-store.js");
    memoryStore = new mod.MnemopiVaultStore(projectRoot);
  } else if (memoryBackend === "local") {
    const mod = await import("./local-vault-store.js");
    memoryStore = new mod.LocalVaultStore(projectRoot);
  } else if (memoryBackend === "hindsight") {
    const mod = await import("./hindsight-vault-store.js");
    memoryStore = new mod.HindsightVaultStore(projectRoot);
  }

  // Determine projection store
  let projectionStore: VaultStore | null = null;
  if (projectionBackend === "obsidian") {
    const mod = await import("./obsidian-vault-store.js");
    projectionStore = new mod.ObsidianVaultStore(projectRoot);
  }

  // Composite: both memory and projection
  if (memoryStore && projectionStore) {
    const { CompositeVaultStore } = await import("./composite-vault-store.js");
    return new CompositeVaultStore(memoryStore, projectionStore);
  }

  // Only memory
  if (memoryStore) return memoryStore;

  // Only projection (e.g. .obsidian/ without any memory backend)
  if (projectionStore) return projectionStore;

  // No backends detected
  return new NoopVaultStore();
}
