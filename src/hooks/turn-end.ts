"use strict";

/**
 * omp-noesis: Turn End Hook
 * Version: 0.1.0
 *
 * Performs full state cleanup at the end of every conversation turn.
 * Runs stale-eviction followed by capacity-cap enforcement across all
 * cognitive layers to keep the state file lean and bounded.
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import { fullCleanup } from "../rendering/state-cleanup.js";

/**
 * Register the turn_end hook that triggers full state cleanup
 * (stale eviction + capacity caps) after every agent turn.
 */
export function registerTurnEndHook(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.on("turn_end", async (_event) => {
    await runtime.stateManager.mutate((state) => {
      fullCleanup(state);
    });
  });
}
