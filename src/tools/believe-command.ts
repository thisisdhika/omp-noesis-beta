import type { StateManager } from "../infrastructure/state-manager.js";
import * as beliefDomain from "../domains/belief/belief-domain.js";
import {
  NoesisBelieveParamsSchema,
  type NoesisBelieveFactParams,
  type NoesisBelieveDecisionParams,
  type NoesisBelieveLearningParams,
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
      params: NoesisBelieveFactParams | NoesisBelieveDecisionParams | NoesisBelieveLearningParams,
      _signal?: AbortSignal,
      _onUpdate?: (update: unknown) => void,
      _ctx?: unknown,
    ) {
      let result: BelieveResult | undefined;

      deps.state.mutate((state) => {
        switch (params.type) {
          case "fact": {
            const created = beliefDomain.addFact(state, params);
            result = { type: "fact", created: created.created, superseded: created.superseded };
            break;
          }
          case "decision": {
            const created = beliefDomain.addDecision(state, params);
            result = { type: "decision", created: created.created, superseded: created.superseded };
            break;
          }
          case "learning": {
            const entry = beliefDomain.resolveLearning(state, params.learningId, params.rootCause ?? "", params.fix ?? "");
            result = { type: "learning", entry, resolved: entry !== null };
            break;
          }
        }
      });

      return jsonToolResult(result);
    },
  };
}
