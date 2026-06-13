import type { StateManager } from "../infrastructure/state-manager.js";
import * as commitmentDomain from "../domains/commitment/commitment-domain.js";
import { checkConsistency } from "../domains/commitment/consistency-strategy.js";
import { NoesisCommitParamsSchema, type NoesisCommitParams, type Workflow } from "../schema.js";
import { jsonToolResult } from "./tool-result.js";

interface CommitDeps {
  state: StateManager;
}

type CommitResult = {
  mode: NoesisCommitParams["mode"];
  workflow: Workflow;
  warnings: string[];
};

export function createCommitTool(deps: CommitDeps) {
  return {
    name: "noesis_commit",
    label: "Noesis Commit",
    description: "Manage workflow commitment. Extend: add steps/actions. Replace: replace workflow. Update workflow status. Returns consistency warnings if any.",
    parameters: NoesisCommitParamsSchema,
    async execute(
      _toolCallId: string,
      params: NoesisCommitParams,
      _signal?: AbortSignal,
      _onUpdate?: (update: unknown) => void,
      _ctx?: unknown,
    ) {
      let result!: CommitResult;

      deps.state.mutate((state) => {
        if (params.mode === "replace" && params.goal !== undefined) {
          const completed = state.commitment.workflow.steps.filter((step) => step.status === "done" || step.status === "skipped");
          commitmentDomain.replaceWorkflow(state, params.goal, [...completed, ...(params.steps ?? [])], params.actions ?? []);
        } else if (params.mode === "extend") {
          commitmentDomain.extendWorkflow(state, params.steps ?? [], params.actions ?? []);
        }

        if (params.status !== undefined) {
          commitmentDomain.updateWorkflowStatus(state, params.status);
        }

        result = {
          mode: params.mode,
          workflow: state.commitment.workflow,
          warnings: checkConsistency(state),
        };
      });

      return jsonToolResult(result);
    },
  };
}
