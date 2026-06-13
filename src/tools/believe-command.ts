import type { StateManager } from "../infrastructure/state-manager.js";
import * as beliefDomain from "../domains/belief/belief-domain.js";
import {
  NoesisBelieveParamsSchema,
  type NoesisBelieveFactParams,
  type NoesisBelieveDecisionParams,
  type NoesisBelieveLearningParams,
} from "../schema.js";

interface BelieveDeps {
  state: StateManager;
}

export function createBelieveTool(deps: BelieveDeps) {
  return {
    name: "noesis_believe",
    label: "Noesis Believe",
    description: "Add or revise cognitive beliefs. Fact: add a knowledge fact with confidence. Decision: record a decision with rationale. Learning: resolve a learning entry with root cause and fix.",
    parameters: NoesisBelieveParamsSchema,
    async execute(
      _toolCallId: string,
      params: NoesisBelieveFactParams | NoesisBelieveDecisionParams | NoesisBelieveLearningParams,
      _signal?: AbortSignal,
      _onUpdate?: (update: unknown) => void,
      _ctx?: unknown,
    ) {
      let result: unknown;

      deps.state.mutate(s => {
        switch (params.type) {
          case "fact": {
            const r = beliefDomain.addFact(s, params);
            result = { type: "fact", created: r.created, superseded: r.superseded };
            break;
          }
          case "decision": {
            const r = beliefDomain.addDecision(s, params);
            result = { type: "decision", created: r.created, superseded: r.superseded };
            break;
          }
          case "learning": {
            const entry = beliefDomain.resolveLearning(s, params.learningId, params.rootCause ?? "", params.fix ?? "");
            result = { type: "learning", entry, resolved: entry !== null };
            break;
          }
        }
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}
