"use strict";

/**
 * omp-noesis: Explore in Sandbox Use Case
 *
 * Add a speculative belief fact within a sandbox (does not affect main state).
 */

import type { StateManager } from "../../infrastructure/state-manager.js";
import { exploreInSandbox, type ExploreSandboxParams } from "../../domains/sandbox/sandbox-domain.js";

export class ExploreInSandboxUseCase {
  constructor(private stateManager: StateManager) {}

  async execute(sandboxId: string, params: ExploreSandboxParams): Promise<{ factId: string }> {
    let factId = "";
    let found = false;

    await this.stateManager.mutate(state => {
      const sandbox = state.sandbox.sandboxes.find(s => s.id === sandboxId);
      if (!sandbox) {
        throw new Error(`Sandbox not found: ${sandboxId}`);
      }
      if (sandbox.status !== "active") {
        throw new Error(`Cannot explore in sandbox with status "${sandbox.status}" — must be "active"`);
      }
      const fact = exploreInSandbox(sandbox, params);
      sandbox.facts.push(fact);
      factId = fact.id;
      found = true;
    });

    if (!found) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }
    return { factId };
  }
}
