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
import {
  detectCapability,
  canRunGraphUpdate,
  isGraphSizeManageable,
  tryBackgroundGraphUpdate,
} from "../infrastructure/graphify-client.js";
import { readNoesisConfig } from "../shared/config.js";


/**
 * Register the turn_end hook that triggers full state cleanup
 * (stale eviction + capacity caps) after every agent turn.
 *
 * Vault flush was removed in v0.2 — memory backends were deleted.
 * Obsidian projection operates independently.
 *
 * After cleanup, attempts a background graph update if the graph
 * is stale and auto-update is enabled. The update is fire-and-forget
 * so it does not block subsequent turns.
 */
export function registerTurnEndHook(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.on("turn_end", async (_event) => {
    // 1. Existing cleanup
    const uow = runtime.stateManager.createUnitOfWork();
    const useCase = new EndTurnCleanupUseCase(uow);
    await useCase.execute();
    // 2. Background graph update if stale (fire-and-forget)
    try {
      const state = runtime.stateManager.read();
      const config = await readNoesisConfig(runtime.projectRoot);

      if (!config.autoUpdate) return;

      const capability = await detectCapability(runtime.projectRoot);
      if (capability !== "STALE") return;

      const canUpdate = canRunGraphUpdate(
        (state as any)._lastGraphUpdate,
        config.maxUpdateInterval,
      );

      if (!canUpdate) return;
      if (!(await isGraphSizeManageable(runtime.projectRoot))) return;

      // Fire-and-forget — don't block next turn
      tryBackgroundGraphUpdate(runtime.projectRoot, runtime.stateManager)
        .catch(() => { /* background update failed silently */ });
    } catch {
      // Best-effort — cleanup already ran
    }
  });
}
