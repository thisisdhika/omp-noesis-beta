"use strict";

/**
 * omp-noesis: RetractBeliefUseCase
 * Version: 1.0.0
 *
 * Retracts a belief from the federation ledger.
 */

import type { IUnitOfWork } from "../../infrastructure/unit-of-work.js";
import type { CanonicalLedger } from "../../domains/federation/schema.js";
import { retractFromLedger } from "../../domains/federation/federation-domain.js";

export interface RetractBeliefInput {
  beliefId: string;
  agentId: string;
}

export class RetractBeliefUseCase {
  constructor(
    private uow: IUnitOfWork,
    private ledger: CanonicalLedger,
  ) {}

  async execute(input: RetractBeliefInput): Promise<{ ledgerEntryId: string } | null> {
    const entry = retractFromLedger(this.ledger, input.agentId, input.beliefId);
    if (!entry) return null;

    // Mark local belief as superseded
    const now = new Date().toISOString();
    const fact = this.uow.belief.findFactById(input.beliefId);
    if (fact) {
      this.uow.belief.updateFact(input.beliefId, {
        status: "superseded",
        updatedAt: now,
      });
    }
    const dec = this.uow.belief.findDecisionById(input.beliefId);
    if (dec) {
      this.uow.belief.updateDecision(input.beliefId, {
        status: "superseded",
        updatedAt: now,
      });
    }

    await this.uow.commit();
    return { ledgerEntryId: entry.ledgerEntryId };
  }
}
