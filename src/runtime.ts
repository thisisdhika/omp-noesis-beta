"use strict";

/**
 * omp-noesis: Runtime Abstraction
 * Version: 1.0.0
 *
 * Provides the NoesisRuntime interface and createRuntime factory.
 * Manages core runtime lifecycle: project root detection, state initialization.
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { MemoryRuntimeContext } from "@oh-my-pi/pi-coding-agent/memory-backend/types";
import type { MemoryBackendSearchItem } from "@oh-my-pi/pi-coding-agent/memory-backend/types";
import { StateManager } from "./infrastructure/state-manager.js";
import type { VaultStore } from "./vault/vault-store.js";
import { createVaultStore } from "./vault/vault-detector.js";

export interface MemoryRetainItem {
  content: string;
  context?: string;
  source?: string;
  importance?: number;
}

export interface MemoryStatus {
  backend: string;
  searchable: boolean;
  writable: boolean;
}

export interface NoesisRuntime {
  projectRoot: string;
  stateManager: StateManager;
  vaultStore: VaultStore;
  /**
   * Optional callback to bridge durable retention to OMP's memory backend.
   * Called after a belief fact is stored locally, enabling cross-session persistence.
   * The implementation may be undefined if OMP memory backend is unavailable.
   */
  retainToOmp?: (items: MemoryRetainItem[]) => Promise<void>;
  /**
   * Inject the current OMP memory runtime when a hook execution exposes it.
   * This keeps the bridge optional and best-effort without coupling runtime
   * initialization to per-turn context objects.
   */
  /**
   * Search OMP memory for content matching the query.
   * Gracefully returns [] if OMP memory backend is unavailable.
   */
  searchFromOmp?: (query: string, limit?: number) => Promise<MemoryBackendSearchItem[]>;
  /**
   * Get the current status of the OMP memory backend.
   * Gracefully returns { backend: "off", searchable: false, writable: false } if unavailable.
   */
  getMemoryStatus?: () => Promise<MemoryStatus>;
  attachMemoryRuntime?: (memory?: MemoryRuntimeContext) => void;
}

export async function createRuntime(pi: ExtensionAPI, projectRoot?: string): Promise<NoesisRuntime> {
  const root = projectRoot ?? process.cwd();
  const stateManager = new StateManager(root);
  // v0.2: state.json is the primary persistence authority. preserveData
  // from OMP compaction lifecycle is handled via ExtensionAPI hooks.
  await stateManager.initialize();
  const vaultStore = await createVaultStore(root);

  let memoryRuntime: MemoryRuntimeContext | undefined;
  const attachMemoryRuntime = (memory?: MemoryRuntimeContext) => {
    memoryRuntime = memory;
  };

  const retainToOmp: NoesisRuntime["retainToOmp"] = async (items) => {
    if (!memoryRuntime) return;
    for (const item of items) {
      try {
        await memoryRuntime.save({
          content: item.content,
          context: item.context,
          source: item.source,
          importance: item.importance,
        });
      } catch {
        // Best-effort bridge; non-critical if OMP memory is unavailable.
      }
    }
  };

  const searchFromOmp: NoesisRuntime["searchFromOmp"] = async (query, limit = 50) => {
    if (!memoryRuntime) return [];
    try {
      const result = await memoryRuntime.search(query, { limit });
      return result.items;
    } catch {
      return [];
    }
  };

  const getMemoryStatus: NoesisRuntime["getMemoryStatus"] = async () => {
    if (!memoryRuntime) return { backend: "off", searchable: false, writable: false };
    try {
      const status = await memoryRuntime.status();
      return { backend: status.backend, searchable: status.searchable, writable: status.writable };
    } catch {
      return { backend: "off", searchable: false, writable: false };
    }
  };

  return { projectRoot: root, stateManager, vaultStore, retainToOmp, attachMemoryRuntime, searchFromOmp, getMemoryStatus };
}

export function mapConfidenceToImportance(c: number): number {
  if (c >= 0.95) return 0.8;
  if (c >= 0.8) return 0.5;
  if (c >= 0.6) return 0.3;
  return 0.25;
}
