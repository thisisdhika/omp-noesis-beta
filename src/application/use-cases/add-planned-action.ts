import type { IUnitOfWork } from "../../infrastructure/unit-of-work.js";
import { CAPS, generateId } from "../../shared/schema-base.js";
import type { PlannedAction } from "../../domains/commitment/schema.js";

export interface AddPlannedActionInput {
  content: string;
  priority?: "critical" | "high" | "normal" | "low";
}

export class AddPlannedActionUseCase {
  constructor(private uow: IUnitOfWork) {}

  async execute(input: AddPlannedActionInput): Promise<PlannedAction> {
    const commitmentRepo = this.uow.commitment;
    const action: PlannedAction = {
      id: generateId("pa"),
      content: input.content,
      priority: input.priority ?? "normal",
      createdAt: new Date().toISOString(),
    };

    const actions = commitmentRepo.getActions();
    if (actions.length >= CAPS.actions) {
      throw new Error(`Planned action capacity limit reached. Maximum limit is ${CAPS.actions}.`);
    }
    commitmentRepo.addAction(action);

    await this.uow.commit();
    return action;
  }
}
