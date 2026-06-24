"use strict";

/**
 * omp-noesis: Create Sandbox Use Case
 *
 * Creates a speculative sandbox from current belief state snapshot.
 */

import type { StateManager } from "../../infrastructure/state-manager.js";
import { createSandbox, type CreateSandboxParams } from "../../domains/sandbox/sandbox-domain.js";

export class CreateSandboxUseCase {
  constructor(private stateManager: StateManager) {}

  async execute(params: CreateSandboxParams): Promise<{ sandboxId: string }> {
    let sandboxId = "";
    await this.stateManager.mutate(state => {
      const sandbox = createSandbox(state, params);
      state.sandbox.sandboxes.push(sandbox);
      sandboxId = sandbox.id;
    });
    return { sandboxId };
  }
}
