"use strict";

/**
 * omp-noesis: Tool Result Hook
 * Version: 1.0.0
 *
 * Captures tool execution outcomes as learning entries in the cognitive
 * state. Records both failures and successes for later ranking.
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import { CaptureLearningUseCase } from "../application/use-cases/capture-learning.js";

/** Keywords in tool output that signal failure. */
const ERROR_KEYWORDS = ["failed", "error", "cannot", "unable", "not found"];

/**
 * Register the tool_result hook that creates learning entries for
 * tool execution outcomes.
 */
export function registerToolResultHook(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.on("tool_result", async (event) => {
    const toolName = event.toolName ?? "unknown";
    const isError = event.isError === true;

    const hasErrorContent = event.content.some(
      (block) =>
        "text" in block && ERROR_KEYWORDS.some((kw) => block.text.toLowerCase().includes(kw)),
    );

    const isFailure = isError || hasErrorContent;

    // Only capture significant events — failures with error content
    if (!isFailure) return;

    const uow = runtime.stateManager.createUnitOfWork();
    const useCase = new CaptureLearningUseCase(uow);
    await useCase.execute({
      description: `Tool ${toolName} failed`,
      toolName,
      isSuccess: false,
    });
  });
}
