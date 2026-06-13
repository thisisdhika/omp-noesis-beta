import type { StateManager } from "../infrastructure/state-manager.js";
import * as inferenceDomain from "../domains/inference/inference-domain.js";
import { NoesisInferParamsSchema, type NoesisInferParams } from "../schema.js";

interface InferDeps {
  state: StateManager;
}

export function createInferTool(deps: InferDeps) {
  return {
    name: "noesis_infer",
    label: "Noesis Infer",
    description: "Manage hypotheses and reasoning. Hypothesize: create a new hypothesis. Reason: record a reasoning step. Update-status: change hypothesis status. Confirm: confirm a hypothesis (auto-creates a belief at 0.75 confidence).",
    parameters: NoesisInferParamsSchema,
    async execute(
      _toolCallId: string,
      params: NoesisInferParams,
      _signal?: AbortSignal,
      _onUpdate?: (update: unknown) => void,
      _ctx?: unknown,
    ) {
      let result: unknown;

      deps.state.mutate(s => {
        switch (params.action) {
          case "hypothesize": {
            const h = inferenceDomain.addHypothesis(s, params.content, params.evidence);
            result = { action: "hypothesize", hypothesis: h };
            break;
          }
          case "reason": {
            const r = inferenceDomain.addReasoningStep(s, params.content, params.relatesTo);
            result = { action: "reason", reasoningStep: r };
            break;
          }
          case "update-status": {
            const h = inferenceDomain.updateHypothesisStatus(s, params.hypothesisId, params.newStatus, params.evidence);
            result = { action: "update-status", hypothesis: h, found: h !== null };
            break;
          }
          case "confirm": {
            const r = inferenceDomain.confirmHypothesis(s, params.hypothesisId);
            result = { action: "confirm", ...r, found: r !== null };
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
