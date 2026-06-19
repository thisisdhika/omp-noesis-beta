"use strict";

/**
 * omp-noesis: Session Shutdown Hook
 * Version: 0.1.0
 *
 * Triggers a final graph update on session shutdown, fire-and-forget.
 * Ensures the next session starts with a fresh graph.
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import {
  detectCapability,
  canRunGraphUpdate,
  isGraphSizeManageable,
  tryBackgroundGraphUpdate,
} from "../infrastructure/graphify-client.js";
import { readNoesisConfig } from "../shared/config.js";


/**
 * Register the session_shutdown hook that triggers a final
 * graph update if stale, fire-and-forget.
 */
export function registerSessionShutdownHook(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.on("session_shutdown", async () => {
    try {
      const capability = await detectCapability(runtime.projectRoot);

      // Only update if graph exists but is stale
      if (capability !== "STALE") return;

      const state = runtime.stateManager.read();
      const config = await readNoesisConfig(runtime.projectRoot);
      const canUpdate = canRunGraphUpdate(
        (state as any)._lastGraphUpdate,
        config.maxUpdateInterval,
      );

      if (!canUpdate) return;
      if (!(await isGraphSizeManageable(runtime.projectRoot))) return;

      tryBackgroundGraphUpdate(runtime.projectRoot, runtime.stateManager)
        .catch(() => { /* shutdown update failed silently */ });
    } catch {
      // Best-effort
    }
  });
}
