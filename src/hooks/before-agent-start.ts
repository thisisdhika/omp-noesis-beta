import type { StateManager } from "../infrastructure/state-manager.js";
import type { GraphifyClient } from "../infrastructure/graphify-client.js";
import { buildPreamble } from "../rendering/preamble-builder.js";
import { getTopLearning } from "../domains/learning/learning-domain.js";
import { computeStaleReviewNotes } from "../domains/belief/belief-domain.js";
import { checkConsistency } from "../domains/commitment/commitment-domain.js";

/**
 * Create a "before_agent_start" event handler that injects the Noesis
 * cognitive preamble as a persistent message.
 *
 * The preamble is built from the current cognitive state and provides the
 * agent with structured context: active beliefs and decisions, ranked
 * learning entries, stale-review notes, consistency warnings, and graph
 * findings. The resulting message carries customType "noesis-preamble"
 * so the agent's context builder can embed it in every turn.
 *
 * Usage:
 * ```ts
 * const onBefore = createBeforeAgentStartHook({ state, graphify, vaultLabel, projectName });
 * events.on("before_agent_start", onBefore);
 * ```
 */
export function createBeforeAgentStartHook(deps: {
  state: StateManager;
  graphify: GraphifyClient;
  vaultLabel: string;
  projectName: string;
}): () =>
  | {
      message: {
        customType: string;
        content: Array<{ type: string; text: string }>;
        display: boolean;
        attribution: string;
      };
    }
  | undefined {
  return () => {
    try {
      const state = deps.state.read();
      const capability = deps.graphify.capability;
      const learningRanked = getTopLearning(
        [...state.learning.failures, ...state.learning.successes],
        5,
      );
      const staleNotes = computeStaleReviewNotes(state.belief.facts, capability, state.attention.updatedAt);
      const consistencyWarnings = checkConsistency(state.commitment.workflow);

      const preamble = buildPreamble(state, {
        capability,
        vaultLabel: deps.vaultLabel,
        learningRanked,
        staleNotes,
        projectName: deps.projectName,
        contextUsage: state.attention.contextUsage,
        consistencyWarnings:
          consistencyWarnings.length > 0 ? consistencyWarnings : undefined,
      });

      if (!preamble) return undefined;

      return {
        message: {
          customType: "noesis-preamble",
          content: [{ type: "text", text: preamble }],
          display: true,
          attribution: "agent",
        },
      };
    } catch (err) {
      console.error("[noesis] before_agent_start hook error:", err);
      return undefined;
    }
  };
}
