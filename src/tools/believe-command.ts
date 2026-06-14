import type { StateManager } from "../infrastructure/state-manager.js";
import * as beliefDomain from "../domains/belief/belief-domain.js";
import {
  NoesisBelieveParamsSchema,
  NoesisBelieveFactParamsSchema,
  NoesisBelieveDecisionParamsSchema,
  NoesisBelieveLearningParamsSchema,
  type NoesisBelieveToolParams,
  type BeliefFact,
  type BeliefDecision,
  type LearningEntry,
} from "../schema.js";
import { jsonToolResult } from "./tool-result.js";

interface BelieveDeps {
  state: StateManager;
}

type BelieveResult =
  | { type: "fact"; created: BeliefFact; superseded: BeliefFact[] }
  | { type: "decision"; created: BeliefDecision; superseded: BeliefDecision[] }
  | { type: "learning"; entry: LearningEntry | null; resolved: boolean };

export function createBelieveTool(deps: BelieveDeps) {
  return {
    name: "noesis_believe",
    label: "Noesis Believe",
    description: "Add or revise cognitive beliefs. Fact: add a knowledge fact with confidence. Decision: record a decision with rationale. Learning: resolve a learning entry with root cause and fix.",
    parameters: NoesisBelieveParamsSchema,
    async execute(
      _toolCallId: string,
      params: NoesisBelieveToolParams,
      _signal?: AbortSignal,
      _onUpdate?: (update: unknown) => void,
      _ctx?: unknown,
    ) {
      try {
        let result: BelieveResult | undefined;

        deps.state.mutate((state) => {
          switch (params.type) {
            case "fact": {
              const fact = NoesisBelieveFactParamsSchema.parse(params);
              const created = beliefDomain.addFact(state, fact);
              result = { type: "fact", created: created.created, superseded: created.superseded };
              break;
            }
            case "decision": {
              const decision = NoesisBelieveDecisionParamsSchema.parse(params);
              const created = beliefDomain.addDecision(state, decision);
              result = { type: "decision", created: created.created, superseded: created.superseded };
              break;
            }
            case "learning": {
              const learning = NoesisBelieveLearningParamsSchema.parse(params);
              const entry = beliefDomain.resolveLearning(state, learning.learningId, learning.rootCause ?? "", learning.fix ?? "");
              result = { type: "learning", entry, resolved: entry !== null };
              break;
            }
          }
        });

        return jsonToolResult(result);
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  };
}
