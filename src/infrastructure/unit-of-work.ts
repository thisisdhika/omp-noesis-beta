import type { NoesisState } from "../shared/schema.js";
import { AttentionRepository, type IAttentionRepo } from "./repositories/attention-repository.js";
import { BeliefRepository, type IBeliefRepo } from "./repositories/belief-repository.js";
import { InferenceRepository, type IInferenceRepo } from "./repositories/inference-repository.js";
import { CommitmentRepository, type ICommitmentRepo } from "./repositories/commitment-repository.js";
import { LearningRepository, type ILearningRepo } from "./repositories/learning-repository.js";

export interface IUnitOfWork {
  readonly attention: IAttentionRepo;
  readonly belief: IBeliefRepo;
  readonly inference: IInferenceRepo;
  readonly commitment: ICommitmentRepo;
  readonly learning: ILearningRepo;
  commit(): Promise<void>;
  rollback(): void;
}

export class UnitOfWork implements IUnitOfWork {
  readonly attention: AttentionRepository;
  readonly belief: BeliefRepository;
  readonly inference: InferenceRepository;
  readonly commitment: CommitmentRepository;
  readonly learning: LearningRepository;

  #clonedState: NoesisState;
  #commitFn: (state: NoesisState) => Promise<void>;
  #isCompleted = false;

  constructor(clonedState: NoesisState, commitFn: (state: NoesisState) => Promise<void>) {
    this.#clonedState = clonedState;
    this.#commitFn = commitFn;

    this.attention = new AttentionRepository(clonedState.attention);
    this.belief = new BeliefRepository(clonedState.belief);
    this.inference = new InferenceRepository(clonedState.inference);
    this.commitment = new CommitmentRepository(clonedState.commitment);
    this.learning = new LearningRepository(clonedState.learning);
  }

  async commit(): Promise<void> {
    if (this.#isCompleted) {
      throw new Error("UnitOfWork has already been completed (committed or rolled back).");
    }
    await this.#commitFn(this.#clonedState);
    this.#isCompleted = true;
  }

  rollback(): void {
    if (this.#isCompleted) {
      throw new Error("UnitOfWork has already been completed (committed or rolled back).");
    }
    this.#isCompleted = true;
  }
}
