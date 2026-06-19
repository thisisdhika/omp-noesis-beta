import type { ICommitmentRepository } from "../../domains/commitment/repository.js";
import type { CommitmentLayer, Workflow, PlannedAction } from "../../domains/commitment/schema.js";

export class CommitmentRepository implements ICommitmentRepository {
  constructor(private segment: CommitmentLayer) {}

  getWorkflow(): Workflow {
    return this.segment.workflow;
  }

  setWorkflow(workflow: Workflow): void {
    this.segment.workflow = workflow;
  }

  getActions(): PlannedAction[] {
    return [...this.segment.actions];
  }

  addAction(action: PlannedAction): void {
    this.segment.actions.push(action);
  }

  setActions(actions: PlannedAction[]): void {
    this.segment.actions = [...actions];
  }
}
