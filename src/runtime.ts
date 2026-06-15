"use strict";

/**
 * omp-noesis: Runtime Abstraction
 * Version: 0.1.0
 *
 * Provides the NoesisRuntime interface and createRuntime factory.
 * Manages core runtime lifecycle: project root detection, state initialization.
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { StateManager } from "./infrastructure/state-manager.js";
import type { VaultStore } from "./vault/vault-store.js";
import { createVaultStore } from "./vault/vault-detector.js";

export interface NoesisRuntime {
  projectRoot: string;
  stateManager: StateManager;
  vaultStore: VaultStore;
}

export async function createRuntime(pi: ExtensionAPI): Promise<NoesisRuntime> {
  const projectRoot = process.cwd();
  const stateManager = new StateManager(projectRoot);
  await stateManager.initialize();
  const vaultStore = await createVaultStore(projectRoot);
  return { projectRoot, stateManager, vaultStore };
}
