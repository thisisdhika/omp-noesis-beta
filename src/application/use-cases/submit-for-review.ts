"use strict";

/**
 * Submit a belief fact for human review.
 * Flags an existing active fact with reviewRequired = true.
 */

import type { StateManager } from "../../infrastructure/state-manager.js";

export class SubmitForReviewUseCase {
  constructor(private stateManager: StateManager) {}

  async execute(factId: string): Promise<{ factId: string; reviewRequired: boolean }> {
    let reviewRequired = false;

    await this.stateManager.mutate((state) => {
      const fact = state.belief.facts.find((f) => f.id === factId);
      if (!fact || fact.status !== "active") {
        throw new Error(`Active belief fact ${factId} not found`);
      }
      fact.reviewRequired = true;
      reviewRequired = true;
    });

    return { factId, reviewRequired };
  }
}
