"use strict";

/**
 * omp-noesis: Session Shutdown Hook
 * Version: 1.0.0
 *
 * Triggers a final graph update on session shutdown, fire-and-forget.
 * Ensures the next session starts with a fresh graph.
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import { tryLifecycleGraphUpdate } from "../infrastructure/graphify-client.js";


/**
 * Register the session_shutdown hook that triggers a final
 * graph update if stale, fire-and-forget.
 */
export function registerSessionShutdownHook(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.on("session_shutdown", async () => {
    tryLifecycleGraphUpdate(runtime.projectRoot, runtime.stateManager, {
      requireAutoUpdate: false,
      requireStale: true,
    }).catch(() => {}); // Best-effort, fire-and-forget
  });
}
