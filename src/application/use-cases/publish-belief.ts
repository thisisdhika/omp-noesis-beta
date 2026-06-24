"use strict";

/**
 * omp-noesis: PublishBeliefUseCase
 * Version: 1.0.0
 *
 * Publishes a belief to the federation ledger, setting its scope to "federated"
 * and appending a ledger entry.
 */

import type { IUnitOfWork } from "../../infrastructure/unit-of-work.js";
import type { CanonicalLedger } from "../../domains/federation/schema.js";
import { publishToLedger } from "../../domains/federation/federation-domain.js";

export interface PublishBeliefInput {
  beliefId: string;
  beliefKind: "fact" | "decision";
  agentId: string;
}

export class PublishBeliefUseCase {
  constructor(
    private uow: IUnitOfWork,
    private ledger: CanonicalLedger,
  ) {}

  async execute(input: PublishBeliefInput): Promise<{ ledgerEntryId: string }> {
    const { beliefId, beliefKind, agentId } = input;
    let belief;
    if (beliefKind === "fact") {
      belief = this.uow.belief.findFactById(beliefId);
    } else {
      belief = this.uow.belief.findDecisionById(beliefId);
    }
    if (!belief) throw new Error(`Belief ${beliefId} not found`);

    // Mark as federated
    const now = new Date().toISOString();
    if (beliefKind === "fact") {
      this.uow.belief.updateFact(beliefId, {
        scope: "federated",
        updatedAt: now,
      });
    } else {
      this.uow.belief.updateDecision(beliefId, {
        scope: "federated",
        updatedAt: now,
      });
    }

    const entry = publishToLedger(this.ledger, agentId, belief, beliefKind);
    belief.ledgerEntryId = entry.ledgerEntryId;
    belief.revision = (belief.revision ?? 0) + 1;

    await this.uow.commit();
    return { ledgerEntryId: entry.ledgerEntryId };
  }
}
