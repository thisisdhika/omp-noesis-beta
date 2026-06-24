import type { IUnitOfWork } from "../../infrastructure/unit-of-work.js";
import type { BeliefSource } from "../../domains/belief/schema.js";
import { generateId } from "../../shared/schema-base.js";

export interface AddBeliefDecisionInput {
  content: string;
  rationale: string;
  source: BeliefSource;
  alternatives?: string[];
  tags?: string[];
  contradicts?: string[];
}

export class AddBeliefDecisionUseCase {
  constructor(private uow: IUnitOfWork) {}

  async execute(input: AddBeliefDecisionInput): Promise<{ decisionId: string; contestedWarnings: string[] }> {
    const beliefRepo = this.uow.belief;
    const inferenceRepo = this.uow.inference;
    const timestamp = new Date().toISOString();
    const decisionId = generateId("bd");
    const contestedWarnings: string[] = [];

    // 1. Enforce AGM Supersedence if contradictions exist
    if (input.contradicts && input.contradicts.length > 0) {
      for (const targetId of input.contradicts) {
        // Mark belief facts superseded
        const fact = beliefRepo.findFactById(targetId);
        if (fact && fact.status === "active") {
          beliefRepo.updateFact(targetId, {
            status: "superseded",
            supersededBy: decisionId,
            updatedAt: timestamp,
          });

          // Check if any inference hypotheses depend on this superseded fact
          const dependents = inferenceRepo.getAllHypotheses().filter(
            h => h.relatedBeliefId === targetId
          );
          for (const dep of dependents) {
            contestedWarnings.push(
              `Belief '${fact.content.slice(0, 40)}' superseded (${targetId}); hypothesis '${dep.content.slice(0, 40)}' (${dep.id}) may need review`
            );
          }
        }

        // Mark decisions superseded
        const dec = beliefRepo.findDecisionById(targetId);
        if (dec && dec.status === "active") {
          beliefRepo.updateDecision(targetId, {
            status: "superseded",
            supersededBy: decisionId,
            updatedAt: timestamp,
          });

          // Check if any inference hypotheses depend on this superseded decision
          const dependents = inferenceRepo.getAllHypotheses().filter(
            h => h.relatedBeliefId === targetId
          );
          for (const dep of dependents) {
            contestedWarnings.push(
              `Belief '${dec.content.slice(0, 40)}' superseded (${targetId}); hypothesis '${dep.content.slice(0, 40)}' (${dep.id}) may need review`
            );
          }
        }
      }
    }

    // 2. Add the new decision
    beliefRepo.addDecision({
      id: decisionId,
      content: input.content,
      rationale: input.rationale,
      alternatives: input.alternatives,
      source: input.source,
      createdAt: timestamp,
      updatedAt: timestamp,
      status: "active",
      scope: "local" as const,
      revision: 0,
      tags: input.tags,
    });

    await this.uow.commit();
    return { decisionId, contestedWarnings };
  }
}
