import type { StateManager } from "../infrastructure/state-manager.js";
import type { GraphifyClient } from "../infrastructure/graphify-client.js";

/**
 * Create a "before_agent_start" event handler that emits a minimal safety-net
 * preamble when the context-hook path is unavailable.
 *
 * The full cognitive preamble is handled by context-hook.ts on every message
 * turn. This hook fires once per agent start and serves as a terse fallback
 * (focus + project + capability) to keep the agent oriented when the context
 * hook does not run.
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
      const focus = state.attention.focus || "No active focus";
      const project = deps.projectName;
      const capability = deps.graphify.capability;

      // Minimal safety-net preamble. The context-hook builds the full
      // cognitive preamble on every message turn. This hook only fires
      // when the context-hook path did not run, so we emit a terse
      // fallback — focus, project, capability — to keep the agent oriented.
      const parts = [
        `[Noesis] Safety-net — context-hook unavailable`,
        `Focus: ${focus}`,
        `Project: ${project}`,
        `Graph: ${capability}`,
      ];

      return {
        message: {
          customType: "noesis-preamble",
          content: [{ type: "text", text: parts.join(" | ") }],
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
