import type { StateManager } from "../infrastructure/state-manager.js";
import * as commitmentDomain from "../domains/commitment/commitment-domain.js";
import { checkConsistency } from "../domains/commitment/consistency-strategy.js";
import { NoesisCommitParamsSchema, type NoesisCommitParams } from "../schema.js";

interface CommitDeps {
  state: StateManager;
}

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
      let result: unknown;

      deps.state.mutate(s => {
        if (params.mode === "replace" && params.goal !== undefined) {
          // Preserve completed steps from old workflow
          const completed = s.commitment.workflow.steps.filter(st => st.status === "done" || st.status === "skipped");
          const newSteps = [...completed, ...(params.steps ?? [])];
          commitmentDomain.replaceWorkflow(s, params.goal, newSteps, params.actions ?? []);
        } else if (params.mode === "extend") {
          commitmentDomain.extendWorkflow(s, params.steps ?? [], params.actions ?? []);
        }

        if (params.status !== undefined) {
          commitmentDomain.updateWorkflowStatus(s, params.status);
        }

        const warnings = checkConsistency(s);
        result = {
          mode: params.mode,
          workflow: s.commitment.workflow,
          warnings,
        };
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}
