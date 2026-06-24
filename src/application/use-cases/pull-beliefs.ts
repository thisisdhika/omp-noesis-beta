"use strict";

/**
 * omp-noesis: PullBeliefsUseCase
 * Version: 1.0.0
 *
 * Pulls foreign beliefs from the federation ledger and imports them
 * into local belief state.
 */

import type { IUnitOfWork } from "../../infrastructure/unit-of-work.js";
import type { CanonicalLedger } from "../../domains/federation/schema.js";
import { pullFromLedger, importFromLedger } from "../../domains/federation/federation-domain.js";

export class PullBeliefsUseCase {
  constructor(
    private uow: IUnitOfWork,
    private ledger: CanonicalLedger,
  ) {}

  async execute(ourAgentId: string): Promise<{ importedCount: number }> {
    const foreignEntries = pullFromLedger(this.ledger, ourAgentId);
    if (foreignEntries.length === 0) return { importedCount: 0 };

    const state = {
      belief: {
        facts: [...this.uow.belief.getAllFacts()],
        decisions: [...this.uow.belief.getAllDecisions()],
      },
    };

    const importedCount = importFromLedger(state, foreignEntries);

    // Write imported beliefs into UoW
    for (const fact of state.belief.facts) {
      // Check if it's new
      const existing = this.uow.belief.findFactById(fact.id);
      if (!existing) {
        this.uow.belief.addFact(fact);
      }
    }
    for (const dec of state.belief.decisions) {
      const existing = this.uow.belief.findDecisionById(dec.id);
      if (!existing) {
        this.uow.belief.addDecision(dec);
      }
    }

    await this.uow.commit();
    return { importedCount };
  }
}
