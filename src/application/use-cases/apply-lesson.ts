"use strict";

/**
 * omp-noesis: Apply Lesson Use Case
 * Version: 1.0.0
 *
 * When a lesson is resolved and has a prevention, this use case
 * checks shouldApply and auto-creates a belief fact from the
 * prevention's beliefStatement with source "inference" and
 * epistemicStatus "probable".
 */

import type { IUnitOfWork } from "../../infrastructure/unit-of-work.js";
import { shouldApply } from "../../domains/learning/lesson-retrieval.js";
import { AddBeliefFactUseCase } from "./add-belief-fact.js";
import type { LearningEntry } from "../../domains/learning/schema.js";

export interface ApplyLessonInput {
  lesson: LearningEntry;
}

export interface ApplyLessonOutput {
  factId: string | null;
  applied: boolean;
}

export class ApplyLessonUseCase {
  constructor(private uow: IUnitOfWork) {}

  async execute(input: ApplyLessonInput): Promise<ApplyLessonOutput> {
    const { lesson } = input;
    const prevention = lesson.prevention;
    if (!prevention) {
      return { factId: null, applied: false };
    }

    // Build a temporary object with the confidence from the lesson's intervention
    const confidence = lesson.intervention?.confidence ?? 0;
    if (!shouldApply({ ...prevention, confidence })) {
      return { factId: null, applied: false };
    }

    // Auto-apply the prevention as a belief fact
    const addFactUseCase = new AddBeliefFactUseCase(this.uow);
    const { factId } = await addFactUseCase.execute({
      content: prevention.beliefStatement,
      confidence,
      source: "inference",
      epistemicStatus: "probable",
    });

    return { factId, applied: true };
  }
}
