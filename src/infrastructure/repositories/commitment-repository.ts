import type { CommitmentLayer, Workflow, PlannedAction } from "../../domains/commitment/schema.js";

export class CommitmentRepository {
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
export type ICommitmentRepo = Pick<CommitmentRepository, 'getWorkflow' | 'setWorkflow' | 'getActions' | 'addAction' | 'setActions'>;
