"use strict";

/**
 * Reject a belief fact after human review.
 * Marks the fact as reviewed, rejected, and archives it.
 */

import type { StateManager } from "../../infrastructure/state-manager.js";
import { now } from "../../shared/time.js";

export class RejectReviewUseCase {
  constructor(private stateManager: StateManager) {}

  async execute(factId: string, reviewer: string = "human"): Promise<{ factId: string; status: string }> {
    await this.stateManager.mutate((state) => {
      const fact = state.belief.facts.find((f) => f.id === factId);
      if (!fact || fact.status !== "active") {
        throw new Error(`Active belief fact ${factId} not found`);
      }
      fact.reviewRequired = false;
      fact.reviewedAt = now();
      fact.reviewedBy = reviewer;
      fact.reviewResult = "rejected";
      fact.status = "archived";
    });

    return { factId, status: "rejected" };
  }
}
