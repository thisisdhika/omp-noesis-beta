"use strict";

/**
 * omp-noesis: Review Command
 *
 * `/noesis:review` — list and manage beliefs flagged for human review.
 * Subcommands: pending, accept <id>, reject <id>.
 */

import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import { getPendingReviews } from "../domains/belief/review-strategy.js";
import { AcceptReviewUseCase } from "../application/use-cases/accept-review.js";
import { RejectReviewUseCase } from "../application/use-cases/reject-review.js";

function formatPendingReviews(runtime: NoesisRuntime): string {
  const pending = getPendingReviews(runtime.stateManager.read());
  if (pending.length === 0) {
    return "No beliefs pending review.";
  }
  const lines = pending.map(
    (f) => `  • ${f.id}  [${f.confidence.toFixed(2)}]  ${f.content.slice(0, 80)}`,
  );
  return `Beliefs pending review (${pending.length}):\n${lines.join("\n")}`;
}

export async function reviewCommand(
  args: string,
  _ctx: ExtensionCommandContext,
  runtime: NoesisRuntime,
): Promise<string> {
  const trimmed = args.trim();
  if (!trimmed || trimmed === "pending") {
    return formatPendingReviews(runtime);
  }

  const parts = trimmed.split(/\s+/);
  const subcommand = parts[0];
  const beliefId = parts[1];

  if (!beliefId) {
    return "Usage: /noesis:review pending | /noesis:review accept <id> | /noesis:review reject <id>";
  }

  if (subcommand === "accept") {
    const useCase = new AcceptReviewUseCase(runtime.stateManager);
    const result = await useCase.execute(beliefId);
    return `Accepted belief ${result.factId}.`;
  }

  if (subcommand === "reject") {
    const useCase = new RejectReviewUseCase(runtime.stateManager);
    const result = await useCase.execute(beliefId);
    return `Rejected and archived belief ${result.factId}.`;
  }

  return `Unknown subcommand "${subcommand}". Usage: pending | accept <id> | reject <id>`;
}
