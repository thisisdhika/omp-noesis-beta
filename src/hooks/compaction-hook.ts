import type { StateManager } from "../infrastructure/state-manager.js";
import type { VaultStore } from "../vault/vault-store.js";
import type { VaultRetry } from "../vault/vault-retry.js";
import type {
  VaultArtifact,
  BeliefFact,
  BeliefDecision,
  LearningEntry,
  Hypothesis,
  PlannedAction,
} from "../schema.js";
import { evictOverCap, evictStale, stripTransientState } from "../rendering/state-cleanup.js";
import { nowISO } from "../shared/time.js";
import { rankLearning } from "../domains/learning/ranking-strategy.js";
import { getActiveFacts, getActiveDecisions } from "../domains/belief/belief-domain.js";
import { getUnresolvedHypotheses } from "../domains/inference/inference-domain.js";
import { getCurrentStep } from "../domains/commitment/commitment-domain.js";

interface CompactionDeps {
  state: StateManager;
  vault: VaultStore;
  vaultRetry: VaultRetry;
}
function toBeliefArtifact(projectPath: string, pushedAt: string, fact: BeliefFact): VaultArtifact {
  return {
    kind: "belief",
    projectPath,
    id: fact.id,
    content: fact.content,
    metadata: {
      confidence: fact.confidence,
      source: fact.source,
      status: fact.status,
      tags: fact.tags,
      "community-scope": fact.communityScope,
      "evidence-nodes": fact.evidenceNodes,
      "superseded-by": fact.supersededBy,
      created: fact.createdAt,
    },
    pushedAt,
  };
}

function toDecisionArtifact(
  projectPath: string,
  pushedAt: string,
  decision: BeliefDecision,
): VaultArtifact {
  return {
    kind: "decision",
    projectPath,
    id: decision.id,
    content: decision.content,
    metadata: {
      rationale: decision.rationale,
      source: decision.source,
      status: decision.status,
      tags: decision.tags,
      "superseded-by": decision.supersededBy,
      created: decision.createdAt,
      alternatives: decision.alternatives,
    },
    pushedAt,
  };
}

function toLearningArtifact(
  projectPath: string,
  pushedAt: string,
  entry: LearningEntry,
): VaultArtifact {
  return {
    kind: "learning",
    projectPath,
    id: entry.id,
    content: entry.description,
    metadata: {
      severity: entry.severity,
      toolName: entry.toolName,
      rootCause: entry.rootCause,
      fix: entry.fix,
      "skill-scope": entry.skillScope,
      created: entry.capturedAt,
      capturedAt: entry.capturedAt,
    },
    pushedAt,
  };
}

function toPatternArtifact(
  projectPath: string,
  pushedAt: string,
  id: string,
  payload: Hypothesis | Record<string, unknown>,
): VaultArtifact {
  return {
    kind: "pattern",
    projectPath,
    id,
    content: JSON.stringify(payload),
    metadata: {},
    pushedAt,
  };
}

/**
 * Create a handler for the "session.compacting" lifecycle event.
 *
 * On compaction:
 * 1. Evict items exceeding layer caps (lowest-ranked first)
 * 2. Push evicted items to vault (fire-and-forget, retries queued on failure)
 * 3. Flush any previously-failed vault pushes from the retry buffer
 * 4. Build survivor context lines for session reconstruction
 * 5. Serialize cleaned state as preserveData for later restoration
 * 6. State is persisted to disk via StateManager.mutate
 */
export function createCompactionHook(
  deps: CompactionDeps,
): () => { context: string[]; preserveData: Record<string, unknown> } {
  const { state, vault, vaultRetry } = deps;

  return () => {
    try {
      // ------------------------------------------------------------------
      // 1. Evict lowest-ranked items from over-cap layers
      //    Mutates state in-place; StateManager.mutate saves to disk.
      // ------------------------------------------------------------------
      let staleFacts: BeliefFact[] = [];
      let staleDecisions: BeliefDecision[] = [];
      let staleHypotheses: Hypothesis[] = [];
      let evictedFacts: BeliefFact[] = [];
      let evictedDecisions: BeliefDecision[] = [];
      let evictedLearning: LearningEntry[] = [];
      let evictedHypotheses: Hypothesis[] = [];
      let evictedCommitmentActions: PlannedAction[] = [];

      state.mutate((current) => {
        const stale = evictStale(current);
        staleFacts = stale.evictedFacts;
        staleDecisions = stale.evictedDecisions;
        staleHypotheses = stale.evictedHypotheses;
        const result = evictOverCap(current);
        evictedFacts = result.evictedFacts;
        evictedDecisions = result.evictedDecisions;
        evictedLearning = result.evictedLearning;
        evictedHypotheses = result.evictedHypotheses;
        evictedCommitmentActions = result.evictedCommitmentActions;
      });

      // ------------------------------------------------------------------
      // 2. Push evicted items to vault (fire-and-forget)
      // ------------------------------------------------------------------
      const now = nowISO();
      const projectPath = state.rootPath();

      const pushArtifact = (artifact: VaultArtifact): void => {
        vault.push(artifact).catch(() => vaultRetry.enqueue(artifact));
      };

      for (const fact of staleFacts) {
        pushArtifact(toBeliefArtifact(projectPath, now, fact));
      }
      for (const decision of staleDecisions) {
        pushArtifact(toDecisionArtifact(projectPath, now, decision));
      }
      for (const hypothesis of staleHypotheses) {
        pushArtifact(toPatternArtifact(projectPath, now, hypothesis.id, hypothesis));
      }
      for (const fact of evictedFacts) {
        pushArtifact(toBeliefArtifact(projectPath, now, fact));
      }

      for (const decision of evictedDecisions) {
        pushArtifact(toDecisionArtifact(projectPath, now, decision));
      }

      for (const entry of evictedLearning) {
        pushArtifact(toLearningArtifact(projectPath, now, entry));
      }
      for (const hypothesis of evictedHypotheses) {
        pushArtifact(toPatternArtifact(projectPath, now, hypothesis.id, hypothesis));
      }
      for (const action of evictedCommitmentActions) {
        pushArtifact(toPatternArtifact(projectPath, now, action.id, action));
      }

      // ------------------------------------------------------------------
      // 3. Flush vault retry buffer (fire-and-forget)
      // ------------------------------------------------------------------
      vaultRetry.flush(vault).catch(() => {
        /* best-effort */
      });

      // ------------------------------------------------------------------
      // 4. Build survivor context lines
      // ------------------------------------------------------------------
      const snapshot = state.read();
      const context: string[] = [];

      if (snapshot.attention.focus) {
        context.push(`Focus: ${snapshot.attention.focus}`);
      }

      const activeStep = getCurrentStep(snapshot.commitment.workflow);
      if (snapshot.commitment.workflow.goal) {
        const stepDetail = activeStep ? ` | Step: ${activeStep.description}` : "";
        context.push(`Workflow: ${snapshot.commitment.workflow.goal}${stepDetail}`);
      }

      const activeFacts = getActiveFacts(snapshot.belief.facts);
      context.push(`Beliefs: ${activeFacts.length} active`);

      const activeDecisions = getActiveDecisions(snapshot.belief.decisions);
      context.push(`Decisions: ${activeDecisions.length} active`);

      const testing = getUnresolvedHypotheses(snapshot.inference.hypotheses);
      if (testing.length > 0) {
        context.push(`Hypotheses: ${testing.length} testing`);
      }

      const combined = [...snapshot.learning.failures, ...snapshot.learning.successes];
      const topLearning = rankLearning(combined).slice(0, 3);
      if (topLearning.length > 0) {
        context.push(
          `Learning: ${combined.length} total (${snapshot.learning.failures.length} failures, ${snapshot.learning.summary.resolvedCount} resolved)`,
        );
      }

      // ------------------------------------------------------------------
      // 5. Serialize cleaned state for preservation
      // ------------------------------------------------------------------
      const cleaned = stripTransientState(structuredClone(snapshot));
      const preserveData: Record<string, unknown> = { noesis: cleaned };

      return { context, preserveData };
    } catch (err) {
      console.error("[noesis] compaction hook error:", err);
      return { context: [], preserveData: {} };
    }
  };
}
