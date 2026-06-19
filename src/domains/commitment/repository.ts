import type { Workflow, PlannedAction } from "./schema.js";

export interface ICommitmentRepository {
  getWorkflow(): Workflow;
  setWorkflow(workflow: Workflow): void;
  getActions(): PlannedAction[];
  addAction(action: PlannedAction): void;
  setActions(actions: PlannedAction[]): void;
}
