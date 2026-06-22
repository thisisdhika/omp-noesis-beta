"use strict";

/**
 * omp-noesis: Turn End Hook
 * Version: 0.1.0
 *
 * Performs full state cleanup at the end of every conversation turn.
 * Runs stale-eviction followed by capacity-cap enforcement across all
 * cognitive layers to keep the state file lean and bounded.
 * After cleanup, triggers a background graph update if the graph
 * is stale and auto-update is enabled.
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import { EndTurnCleanupUseCase } from "../application/use-cases/end-turn-cleanup.js";
import { tryLifecycleGraphUpdate } from "../infrastructure/graphify-client.js";

/**
 * Register the turn_end hook that triggers full state cleanup
 * (stale eviction + capacity caps) after every agent turn.
 *
 * After cleanup, attempts a background graph update if the graph
 * is stale and auto-update is enabled. The update is fire-and-forget
 * so it does not block subsequent turns.
 */
export function registerTurnEndHook(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.on("turn_end", async (_event) => {
    const uow = runtime.stateManager.createUnitOfWork();
    const useCase = new EndTurnCleanupUseCase(uow);
    await useCase.execute();

    try {
      await tryLifecycleGraphUpdate(runtime.projectRoot, runtime.stateManager, {
        requireStale: true,
      });
    } catch {
      // Best-effort — cleanup already ran
    }
  });
}
