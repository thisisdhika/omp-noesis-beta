import type { NoesisState } from "../../schema.js";

export function checkConsistency(state: NoesisState): string[] {
  const warnings: string[] = [];
  const { workflow } = state.commitment;

  if (workflow.status === "done") {
    for (const step of workflow.steps) {
      if (step.status === "active") {
        warnings.push(
          `Workflow marked done but step ${step.id} is still active`,
        );
      }
    }
  }

  if (workflow.status === "active") {
    const hasActive = workflow.steps.some((s) => s.status === "active");
    if (!hasActive) {
      warnings.push("Workflow active but no active step");
    }
  }

  return warnings;
}
