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
import { StateManager } from "./infrastructure/state-manager.js";
import type { VaultStore } from "./vault/vault-store.js";
import { createVaultStore } from "./vault/vault-detector.js";

export interface NoesisRuntime {
  projectRoot: string;
  stateManager: StateManager;
  vaultStore: VaultStore;
  /**
   * Optional callback to bridge durable retention to OMP's memory backend.
   * Called after a belief fact is stored locally, enabling cross-session persistence.
   * The implementation may be undefined if OMP memory backend is unavailable.
   */
  retainToOmp?: (items: Array<{ content: string; context?: string }>) => Promise<void>;
  /**
   * Inject the current OMP memory runtime when a hook execution exposes it.
   * This keeps the bridge optional and best-effort without coupling runtime
   * initialization to per-turn context objects.
   */
  attachMemoryRuntime?: (memory?: MemoryRuntimeContext) => void;
}

export async function createRuntime(pi: ExtensionAPI): Promise<NoesisRuntime> {
  const projectRoot = process.cwd();
  const stateManager = new StateManager(projectRoot);
  // v0.2: state.json is the primary persistence authority. preserveData
  // from OMP compaction lifecycle is handled via ExtensionAPI hooks.
  await stateManager.initialize();
  const vaultStore = await createVaultStore(projectRoot);

  let memoryRuntime: MemoryRuntimeContext | undefined;
  const attachMemoryRuntime = (memory?: MemoryRuntimeContext) => {
    memoryRuntime = memory;
  };

  const retainToOmp: NoesisRuntime["retainToOmp"] = async (items) => {
    if (!memoryRuntime) return;
    for (const item of items) {
      try {
        await memoryRuntime.save({ content: item.content, context: item.context });
      } catch {
        // Best-effort bridge; non-critical if OMP memory is unavailable.
      }
    }
  };

  return { projectRoot, stateManager, vaultStore, retainToOmp, attachMemoryRuntime };
}
