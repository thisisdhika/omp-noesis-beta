import type { StateManager } from "../infrastructure/state-manager.js";
import {
  NoesisFocusParamsSchema,
  type NoesisFocusParams,
} from "../schema.js";

interface FocusDeps {
  state: StateManager;
}

type ToolResult = {
  content: Array<{ type: string; text?: string }>;
  details?: unknown;
};

export function createFocusTool(deps: FocusDeps) {
  return {
    name: "noesis_focus",
    label: "Noesis Focus",
    description:
      "Set structured attention focus. Defines the agent's current priority goal, optional context, priority level, and domain scope for cognitive attention routing.",
    parameters: NoesisFocusParamsSchema,
    async execute(
      _toolCallId: string,
      params: NoesisFocusParams,
      _signal?: AbortSignal,
    ): Promise<ToolResult> {
      try {
        deps.state.mutate((s) => {
          s.attention.focus = params.goal;
          s.attention.updatedAt = new Date().toISOString();
        });
        deps.state.checkpointAttention();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                type: "focus",
                focus: {
                  goal: params.goal,
                  context: params.context,
                  priority: params.priority ?? "normal",
                  scope: params.scope,
                },
              }),
            },
          ],
          details: { goal: params.goal, scope: params.scope },
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    },
  };
}
