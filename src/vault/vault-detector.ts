"use strict";

/**
 * omp-noesis: Vault Backend Detector
 * Version: 0.1.0
 * Date: 2026-06-15
 *
 * Detects which vault backend a project should use based on filesystem heuristics.
 * Priority order: obsidian > local > mnemopi > none
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { VaultStore } from "./vault-store.js";
import { NoopVaultStore } from "./noop-vault-store.js";

export type VaultBackend = "obsidian" | "local" | "mnemopi" | "none";

/**
 * Detect the vault backend for the given project root.
 *
 * Checks in priority order:
 *  1. .obsidian/ directory exists           → "obsidian"
 *  2. MEMORY.md file exists                 → "local"
 *  3. .omp/mnemopi.db file exists           → "mnemopi"
 *  4. none of the above                     → "none"
 */
export function detectVaultBackend(projectRoot: string): VaultBackend {
  if (existsSync(join(projectRoot, ".obsidian"))) {
    return "obsidian";
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
 * Dynamically imports the backend module so unused backends are never loaded,
 * and backends created in later phases do not become hard build-time dependencies.
 * Falls back to NoopVaultStore when no backend is detected.
 */
export async function createVaultStore(projectRoot: string): Promise<VaultStore> {
  const backend = detectVaultBackend(projectRoot);

  switch (backend) {
    case "obsidian": {
      // Exception: dynamic import — backends are plugin-like modules loaded
      // by runtime detection, and some may not exist at build time.
      const mod = await import("./obsidian-vault-store.js");
      return new mod.ObsidianVaultStore(projectRoot);
    }

    case "local": {
      const mod = await import("./local-vault-store.js");
      return new mod.LocalVaultStore(projectRoot);
    }

    case "mnemopi": {
      const mod = await import("./mnemopi-vault-store.js");
      return new mod.MnemopiVaultStore(projectRoot);
    }
    default:
      return new NoopVaultStore();
  }
}
