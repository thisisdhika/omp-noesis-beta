import type { IAttentionRepository } from "../domains/attention/repository.js";
import type { IBeliefRepository } from "../domains/belief/repository.js";
import type { IInferenceRepository } from "../domains/inference/repository.js";
import type { ICommitmentRepository } from "../domains/commitment/repository.js";
import type { ILearningRepository } from "../domains/learning/repository.js";
import type { NoesisState } from "../shared/schema.js";
import { AttentionRepository } from "./repositories/attention-repository.js";
import { BeliefRepository } from "./repositories/belief-repository.js";
import { InferenceRepository } from "./repositories/inference-repository.js";
import { CommitmentRepository } from "./repositories/commitment-repository.js";
import { LearningRepository } from "./repositories/learning-repository.js";

export interface IUnitOfWork {
  readonly attention: IAttentionRepository;
  readonly belief: IBeliefRepository;
  readonly inference: IInferenceRepository;
  readonly commitment: ICommitmentRepository;
  readonly learning: ILearningRepository;
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
