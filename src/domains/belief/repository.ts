import type { BeliefFact, BeliefDecision } from "./schema.js";

export interface IBeliefRepository {
  addFact(fact: BeliefFact): void;
  addDecision(decision: BeliefDecision): void;
  findFactById(id: string): BeliefFact | undefined;
  findDecisionById(id: string): BeliefDecision | undefined;
  getAllFacts(): BeliefFact[];
  getAllDecisions(): BeliefDecision[];
  updateFact(id: string, updates: Partial<BeliefFact>): void;
  updateDecision(id: string, updates: Partial<BeliefDecision>): void;
  setFacts(facts: BeliefFact[]): void;
  setDecisions(decisions: BeliefDecision[]): void;
}
