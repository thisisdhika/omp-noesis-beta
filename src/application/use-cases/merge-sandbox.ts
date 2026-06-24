"use strict";

/**
 * omp-noesis: Merge Sandbox Use Case
 *
 * Promote sandbox facts and decisions into main state, mark sandbox as merged.
 */

import type { StateManager } from "../../infrastructure/state-manager.js";
import { mergeSandbox } from "../../domains/sandbox/sandbox-domain.js";

export class MergeSandboxUseCase {
  constructor(private stateManager: StateManager) {}

  async execute(sandboxId: string): Promise<{ promotedFacts: number; promotedDecisions: number }> {
    let result = { promotedFacts: 0, promotedDecisions: 0 };
    let found = false;

    await this.stateManager.mutate(state => {
      const sandbox = state.sandbox.sandboxes.find(s => s.id === sandboxId);
      if (!sandbox) {
        throw new Error(`Sandbox not found: ${sandboxId}`);
      }
      if (sandbox.status !== "active") {
        throw new Error(`Cannot merge sandbox with status "${sandbox.status}" — must be "active"`);
      }
      result = mergeSandbox(sandbox, state);
      found = true;
    });

    if (!found) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }
    return result;
  }
}
