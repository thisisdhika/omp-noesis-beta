"use strict";

/**
 * omp-noesis: Compaction Hook
 * Version: 0.1.0
 *
 * Provides survivor context and preserve-data during session compaction.
 * Ensures Noesis cognitive state survives conversation window compression.
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import { buildSurvivorContext } from "../rendering/survivor-builder.js";

/**
 * Register the session.compacting hook that builds a survivor context
 * from the current state and preserves the full state snapshot.
 */
export function registerCompactionHook(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.on("session.compacting", async (_event) => {
    const state = runtime.stateManager.read();
    const survivorContext = buildSurvivorContext(state);

    return {
      context: [survivorContext],
      preserveData: { noesis: { ...state } },
    };
  });
}
