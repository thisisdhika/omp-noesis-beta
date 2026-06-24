"use strict";

/**
 * omp-noesis: ReviseBeliefUseCase
 * Version: 1.0.0
 *
 * Revises a previously published belief in the federation ledger.
 */

import type { IUnitOfWork } from "../../infrastructure/unit-of-work.js";
import type { CanonicalLedger } from "../../domains/federation/schema.js";
import { reviseLedgerEntry } from "../../domains/federation/federation-domain.js";

export interface ReviseBeliefInput {
  previousEntryId: string;
  agentId: string;
  content?: string;
  confidence?: number;
  epistemicStatus?: string;
}

export class ReviseBeliefUseCase {
  constructor(
    private uow: IUnitOfWork,
    private ledger: CanonicalLedger,
  ) {}

  async execute(input: ReviseBeliefInput): Promise<{ ledgerEntryId: string } | null> {
    const entry = reviseLedgerEntry(
      this.ledger,
      input.agentId,
      input.previousEntryId,
      { content: input.content, confidence: input.confidence, epistemicStatus: input.epistemicStatus },
    );
    if (!entry) return null;

    // Update local belief if it exists
    const fact = this.uow.belief.findFactById(entry.beliefId);
    if (fact) {
      this.uow.belief.updateFact(entry.beliefId, {
        content: entry.content,
        confidence: entry.confidence,
        revision: (fact.revision ?? 0) + 1,
        ledgerEntryId: entry.ledgerEntryId,
        updatedAt: new Date().toISOString(),
      });
    }
    const dec = this.uow.belief.findDecisionById(entry.beliefId);
    if (dec) {
      this.uow.belief.updateDecision(entry.beliefId, {
        content: entry.content,
        revision: (dec.revision ?? 0) + 1,
        ledgerEntryId: entry.ledgerEntryId,
        updatedAt: new Date().toISOString(),
      });
    }

    await this.uow.commit();
    return { ledgerEntryId: entry.ledgerEntryId };
  }
}
