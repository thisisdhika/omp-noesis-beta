"use strict";

/**
 * omp-noesis: Session Start Hook
 * Version: 0.1.0
 *
 * Proactively checks graph health at session start and kicks off
 * a background graph build/update if the graph is stale or missing.
 * Runs detached so session initialization is not blocked.
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
 * Register the session_start hook that proactively checks and
 * updates the graph in the background during session initialization.
 */
export function registerSessionStartHook(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.on("session_start", async () => {
    try {
      const capability = await detectCapability(runtime.projectRoot);

      // No action needed if graph is already fresh
      if (capability === "FULL") return;

      // Don't try to build/update without graphify CLI
      if (capability === "DEGRADED") return;

      // Check rate limiting from state.json
      const state = runtime.stateManager.read();
      const config = await readNoesisConfig(runtime.projectRoot);
      const canUpdate = canRunGraphUpdate(
        (state as any)._lastGraphUpdate,
        config.maxUpdateInterval,
      );

      if (!canUpdate) return;

      // Check graph size before attempting update
      const manageable = await isGraphSizeManageable(runtime.projectRoot);
      if (!manageable) return;

      // Run background update/build (fire-and-forget)
      const promise = capability === "NO_GRAPH"
        ? tryBackgroundGraphUpdate(runtime.projectRoot, runtime.stateManager, { fullRebuild: true, timeout: 120000 })
        : tryBackgroundGraphUpdate(runtime.projectRoot, runtime.stateManager);
      promise.catch(() => { /* background update failed silently */ });
    } catch {
      // Best-effort — don't block session start
    }
  });
}
