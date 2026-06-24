import type { IUnitOfWork } from "../../infrastructure/unit-of-work.js";
import type { BeliefSource, EpistemicStatus } from "../../domains/belief/schema.js";
import { generateId } from "../../shared/schema-base.js";
const MIN_BELIEF_CONFIDENCE = 0.5;
export interface AddBeliefFactInput {
  content: string;
  confidence: number;
  source: BeliefSource;
  epistemicStatus: EpistemicStatus;
  tags?: string[];
  evidence?: string;
  contradicts?: string[];
}

export class AddBeliefFactUseCase {
  constructor(private uow: IUnitOfWork) {}

  async execute(input: AddBeliefFactInput): Promise<{ factId: string; contestedWarnings: string[] }> {
    // Creation-time confidence gate — reject below threshold before any work
    if (input.confidence < MIN_BELIEF_CONFIDENCE) {
      throw new Error(
        `Belief fact confidence ${input.confidence} is below minimum threshold ${MIN_BELIEF_CONFIDENCE}`,
      );
    }

    const beliefRepo = this.uow.belief;
    const inferenceRepo = this.uow.inference;
    const timestamp = new Date().toISOString();
    const factId = generateId("bf");
    const contestedWarnings: string[] = [];

    // 1. Enforce AGM Supersedence if contradictions exist
    if (input.contradicts && input.contradicts.length > 0) {
      for (const targetId of input.contradicts) {
        // Mark belief facts superseded
        const fact = beliefRepo.findFactById(targetId);
        if (fact && fact.status === "active") {
          beliefRepo.updateFact(targetId, {
            status: "superseded",
            supersededBy: factId,
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
            supersededBy: factId,
            updatedAt: timestamp,
          });
        }
      }
    }

    // 2. Add the new fact
    beliefRepo.addFact({
      id: factId,
      content: input.content,
      confidence: input.confidence,
      source: input.source,
      createdAt: timestamp,
      updatedAt: timestamp,
      status: "active",
      epistemicStatus: input.epistemicStatus,
      tags: input.tags,
      evidence: input.evidence,
      reviewRequired: false,
      scope: "local" as const,
      revision: 0,
    });

    await this.uow.commit();
    return { factId, contestedWarnings };
  }
}
