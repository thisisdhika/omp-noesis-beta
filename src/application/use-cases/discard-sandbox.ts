"use strict";

/**
 * omp-noesis: Discard Sandbox Use Case
 *
 * Discard sandbox without promoting any data to main state.
 */

import type { StateManager } from "../../infrastructure/state-manager.js";
import { discardSandbox } from "../../domains/sandbox/sandbox-domain.js";

export class DiscardSandboxUseCase {
  constructor(private stateManager: StateManager) {}

  async execute(sandboxId: string): Promise<void> {
    let found = false;

    await this.stateManager.mutate(state => {
      const sandbox = state.sandbox.sandboxes.find(s => s.id === sandboxId);
      if (!sandbox) {
        throw new Error(`Sandbox not found: ${sandboxId}`);
      }
      if (sandbox.status !== "active") {
        throw new Error(`Cannot discard sandbox with status "${sandbox.status}" — must be "active"`);
      }
      discardSandbox(sandbox);
      found = true;
    });

    if (!found) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }
  }
}
