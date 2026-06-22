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
import { tryLifecycleGraphUpdate } from "../infrastructure/graphify-client.js";


/**
 * Register the session_start hook that proactively checks and
 * updates the graph in the background during session initialization.
 */
export function registerSessionStartHook(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.on("session_start", async () => {
    try {
      await tryLifecycleGraphUpdate(runtime.projectRoot, runtime.stateManager, {
        allowFreshGraph: false,
        fullRebuildOnNoGraph: true,
        timeout: 120000,
      });
    } catch {
      // Best-effort — don't block session start
    }
  });
}
