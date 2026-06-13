import type { StateManager } from "../infrastructure/state-manager.js";
import * as inferenceDomain from "../domains/inference/inference-domain.js";
import { NoesisInferParamsSchema, type NoesisInferParams, type Hypothesis, type ReasoningStep } from "../schema.js";
import { jsonToolResult } from "./tool-result.js";

interface InferDeps {
  state: StateManager;
}

type InferResult =
  | { action: "hypothesize"; hypothesis: Hypothesis }
  | { action: "reason"; reasoningStep: ReasoningStep }
  | { action: "update-status"; hypothesis: Hypothesis | null; found: boolean }
  | { action: "confirm"; created: { hypothesis: Hypothesis; belief: unknown } | null; found: boolean };

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
      let result!: InferResult;

      deps.state.mutate((state) => {
        switch (params.action) {
          case "hypothesize":
            result = { action: "hypothesize", hypothesis: inferenceDomain.addHypothesis(state, params.content, params.evidence) };
            break;
          case "reason":
            result = { action: "reason", reasoningStep: inferenceDomain.addReasoningStep(state, params.content, params.relatesTo) };
            break;
          case "update-status": {
            const hypothesis = inferenceDomain.updateHypothesisStatus(state, params.hypothesisId, params.newStatus, params.evidence);
            result = { action: "update-status", hypothesis, found: hypothesis !== null };
            break;
          }
          case "confirm": {
            const created = inferenceDomain.confirmHypothesis(state, params.hypothesisId);
            result = { action: "confirm", created, found: created !== null };
            break;
          }
        }
      });

      return jsonToolResult(result);
    },
  };
}
