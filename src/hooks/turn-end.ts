import type { StateManager } from "../infrastructure/state-manager.js";
import type { VaultStore } from "../vault/vault-store.js";
import type { VaultRetry } from "../vault/vault-retry.js";
import type { VaultArtifact, BeliefFact, BeliefDecision, LearningEntry, Hypothesis } from "../schema.js";
import { evictStale, evictOverCap } from "../rendering/state-cleanup.js";
import { nowISO } from "../shared/time.js";



function pushBeliefArtifact(
  evicted: Array<{ artifact: VaultArtifact }>,
  projectPath: string,
  pushedAt: string,
  fact: BeliefFact,
): void {
  evicted.push({
    artifact: {
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
    },
  });
}

function pushDecisionArtifact(
  evicted: Array<{ artifact: VaultArtifact }>,
  projectPath: string,
  pushedAt: string,
  decision: BeliefDecision,
): void {
  evicted.push({
    artifact: {
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
    },
  });
}

function pushLearningArtifact(
  evicted: Array<{ artifact: VaultArtifact }>,
  projectPath: string,
  pushedAt: string,
  entry: LearningEntry,
): void {
  evicted.push({
    artifact: {
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
    },
  });
}

function pushPatternArtifact(
  evicted: Array<{ artifact: VaultArtifact }>,
  projectPath: string,
  pushedAt: string,
  id: string,
  payload: Hypothesis | Record<string, unknown>,
): void {
  evicted.push({
    artifact: {
      kind: "pattern",
      projectPath,
      id,
      content: JSON.stringify(payload),
      metadata: {},
      pushedAt,
    },
  });
}
/**
 * Create a "turn_end" event handler that performs deferred eviction.
 *
 * Stale items (non-active facts/decisions, resolved hypotheses) are removed
 * on every turn. Over-cap layers are trimmed lowest-ranked-first and both
 * stale and over-cap evicted items are pushed to vault.
 * State version is bumped automatically by the state manager's mutate path.
 */
export function createTurnEndHook(deps: {
  state: StateManager;
  vault: VaultStore;
  vaultRetry: VaultRetry;
}): () => void {
  return (): void => {
    try {
      const evicted: Array<{ artifact: VaultArtifact }> = [];
      const now = nowISO();

      const projectPath = deps.state.rootPath();

      deps.state.mutate((s) => {
        const stale = evictStale(s);
        for (const item of stale.evictedFacts) {
          pushBeliefArtifact(evicted, projectPath, now, item);
        }
        for (const item of stale.evictedDecisions) {
          pushDecisionArtifact(evicted, projectPath, now, item);
        }
        for (const item of stale.evictedHypotheses) {
          pushPatternArtifact(evicted, projectPath, now, item.id, item);
        }

        const overCap = evictOverCap(s);
        for (const item of overCap.evictedFacts) {
          pushBeliefArtifact(evicted, projectPath, now, item);
        }
        for (const item of overCap.evictedDecisions) {
          pushDecisionArtifact(evicted, projectPath, now, item);
        }
        for (const item of overCap.evictedLearning) {
          pushLearningArtifact(evicted, projectPath, now, item);
        }
        for (const item of overCap.evictedHypotheses) {
          pushPatternArtifact(evicted, projectPath, now, item.id, item);
        }
        for (const item of overCap.evictedCommitmentActions) {
          pushPatternArtifact(evicted, projectPath, now, item.id, item);
        }
      });

      for (const item of evicted) {
        deps.vault.push(item.artifact).catch(() => deps.vaultRetry.enqueue(item.artifact));
      }
    } catch (err) {
      console.error("[noesis] turn_end hook error:", err);
    }
  };
}
