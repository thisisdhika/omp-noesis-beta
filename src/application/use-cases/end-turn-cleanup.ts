import type { IUnitOfWork } from "../../infrastructure/unit-of-work.js";
import { CAPS } from "../../shared/schema-base.js";
import { isStaleHours } from "../../shared/time.js";
import { evictOverCap } from "../../domains/learning/eviction-strategy.js";

export class EndTurnCleanupUseCase {
  constructor(private uow: IUnitOfWork) {}

  async execute(): Promise<{ evictedCount: number }> {
    let evictedCount = 0;
    const thresholdHours = CAPS.STALE_THRESHOLD_HOURS;

    // =========================================================================
    // 1. Stale Eviction
    // =========================================================================

    // Belief Facts & Decisions
    const facts = this.uow.belief.getAllFacts();
    const filteredFacts = facts.filter(f => {
      const stale = f.status === "archived" && isStaleHours(f.updatedAt, thresholdHours);
      if (stale) evictedCount++;
      return !stale;
    });
    this.uow.belief.setFacts(filteredFacts);

    const decisions = this.uow.belief.getAllDecisions();
    const filteredDecisions = decisions.filter(d => {
      const stale = d.status === "archived" && isStaleHours(d.updatedAt, thresholdHours);
      if (stale) evictedCount++;
      return !stale;
    });
    this.uow.belief.setDecisions(filteredDecisions);

    // Inference Hypotheses
    const hypotheses = this.uow.inference.getAllHypotheses();
    const filteredHypotheses = hypotheses.filter(h => {
      const stale = h.status === "abandoned" && isStaleHours(h.updatedAt, thresholdHours);
      if (stale) evictedCount++;
      return !stale;
    });
    this.uow.inference.setHypotheses(filteredHypotheses);

    // Learning Entries (Unresolved stale)
    const successes = this.uow.learning.getSuccesses();
    const filteredSuccesses = successes.filter(e => {
      const stale = e.status !== "resolved" && isStaleHours(e.capturedAt, thresholdHours);
      if (stale) evictedCount++;
      return !stale;
    });

    const failures = this.uow.learning.getFailures();
    const filteredFailures = failures.filter(e => {
      const stale = e.status !== "resolved" && isStaleHours(e.capturedAt, thresholdHours);
      if (stale) evictedCount++;
      return !stale;
    });

    // =========================================================================
    // 2. Attention Pending Evidence Decay
    // =========================================================================
    const attention = this.uow.attention.get();
    const decayedPending = attention.pendingEvidence
      .map(e => ({ ...e, turnsRemaining: e.turnsRemaining - 1 }))
      .filter(e => {
        const active = e.turnsRemaining > 0;
        if (!active) evictedCount++;
        return active;
      });

    // =========================================================================
    // 3. Capacity Caps Enforcement
    // =========================================================================

    // Graph findings (keep newest CAPS.graphQueries)
    let finalFindings = attention.graphFindings;
    if (finalFindings.length > CAPS.graphQueries) {
      evictedCount += finalFindings.length - CAPS.graphQueries;
      finalFindings = [...finalFindings]
        .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
        .slice(0, CAPS.graphQueries);
    }

    // Pending evidence (keep first 5)
    let finalPending = decayedPending;
    if (finalPending.length > 5) {
      evictedCount += finalPending.length - 5;
      finalPending = finalPending.slice(0, 5);
    }

    this.uow.attention.update({
      graphFindings: finalFindings,
      pendingEvidence: finalPending,
    });

    // Workflow steps (keep first CAPS.workflowSteps)
    const workflow = this.uow.commitment.getWorkflow();
    if (workflow.steps.length > CAPS.workflowSteps) {
      evictedCount += workflow.steps.length - CAPS.workflowSteps;
      this.uow.commitment.setWorkflow({
        ...workflow,
        steps: workflow.steps.slice(0, CAPS.workflowSteps),
      });
    }

    // Planned actions (keep first CAPS.actions)
    const actions = this.uow.commitment.getActions();
    if (actions.length > CAPS.actions) {
      evictedCount += actions.length - CAPS.actions;
      this.uow.commitment.setActions(actions.slice(0, CAPS.actions));
    }

    // Learning successes & failures (keep first CAPS.learningEntries)
    let finalSuccesses = filteredSuccesses;
    if (finalSuccesses.length > CAPS.learningEntries) {
      evictedCount += finalSuccesses.length - CAPS.learningEntries;
      finalSuccesses = evictOverCap(finalSuccesses, CAPS.learningEntries);
    }
    this.uow.learning.setSuccesses(finalSuccesses);

    let finalFailures = filteredFailures;
    if (finalFailures.length > CAPS.learningEntries) {
      evictedCount += finalFailures.length - CAPS.learningEntries;
      finalFailures = evictOverCap(finalFailures, CAPS.learningEntries);
    }
    this.uow.learning.setFailures(finalFailures);

    await this.uow.commit();
    return { evictedCount };
  }
}
