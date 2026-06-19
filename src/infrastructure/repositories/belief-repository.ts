import type { BeliefLayer, BeliefFact, BeliefDecision } from "../../domains/belief/schema.js";
import { now } from "../../shared/time.js";

export class BeliefRepository {
  constructor(private segment: BeliefLayer) {}

  addFact(fact: BeliefFact): void {
    this.segment.facts.push(fact);
  }

  addDecision(decision: BeliefDecision): void {
    this.segment.decisions.push(decision);
  }

  findFactById(id: string): BeliefFact | undefined {
    return this.segment.facts.find(f => f.id === id);
  }

  findDecisionById(id: string): BeliefDecision | undefined {
    return this.segment.decisions.find(d => d.id === id);
  }

  getAllFacts(): BeliefFact[] {
    return [...this.segment.facts];
  }

  getAllDecisions(): BeliefDecision[] {
    return [...this.segment.decisions];
  }

  updateFact(id: string, updates: Partial<BeliefFact>): void {
    const fact = this.segment.facts.find(f => f.id === id);
    if (fact) {
      Object.assign(fact, updates);
      fact.updatedAt = now();
    }
  }

  updateDecision(id: string, updates: Partial<BeliefDecision>): void {
    const decision = this.segment.decisions.find(d => d.id === id);
    if (decision) {
      Object.assign(decision, updates);
      decision.updatedAt = now();
    }
  }

  setFacts(facts: BeliefFact[]): void {
    this.segment.facts = [...facts];
  }

  setDecisions(decisions: BeliefDecision[]): void {
    this.segment.decisions = [...decisions];
  }
}
export type IBeliefRepo = Pick<BeliefRepository, 'addFact' | 'addDecision' | 'findFactById' | 'findDecisionById' | 'getAllFacts' | 'getAllDecisions' | 'updateFact' | 'updateDecision' | 'setFacts' | 'setDecisions'>;
