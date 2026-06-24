"use strict";

/**
 * omp-noesis: ImportLedgerUseCase
 * Version: 1.0.0
 *
 * Bulk-imports ledger entries into local belief state.
 */

import type { IUnitOfWork } from "../../infrastructure/unit-of-work.js";
import type { CanonicalLedger, LedgerEntry } from "../../domains/federation/schema.js";
import { importFromLedger } from "../../domains/federation/federation-domain.js";

export class ImportLedgerUseCase {
  constructor(
    private uow: IUnitOfWork,
    private ledger: CanonicalLedger,
  ) {}

  async execute(entries?: LedgerEntry[]): Promise<{ importedCount: number }> {
    const toImport = entries ?? this.ledger.entries;
    if (toImport.length === 0) return { importedCount: 0 };

    const state = {
      belief: {
        facts: [...this.uow.belief.getAllFacts()],
        decisions: [...this.uow.belief.getAllDecisions()],
      },
    };

    const importedCount = importFromLedger(state, toImport);

    for (const fact of state.belief.facts) {
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
