"use strict";

/**
 * omp-noesis: Hooks Registry
 * Version: 0.1.0
 *
 * Aggregates and registers all Noesis cognitive hooks with Oh My Pi.
 * Individual hook modules encapsulate their own event handler logic;
 * this module exists solely to wire them into the extension lifecycle.
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import { registerSessionStartHook } from "./session-start-hook.js";
import { registerContextHook } from "./context-hook.js";
import { registerAppendSystemHook } from "./append-system.js";
import { registerCompactionHook } from "./compaction-hook.js";
import { registerToolResultHook } from "./tool-result-hook.js";
import { registerProviderRequestHook } from "./provider-request-hook.js";
import { registerTurnEndHook } from "./turn-end-hook.js";
import { registerSessionShutdownHook } from "./session-shutdown-hook.js";

/**
 * Register all Noesis hooks with the given OMP extension API.
 * Must be called during extension activation, after runtime creation.
 *
 * Order matters: session_start is registered first so it fires
 * before other hooks during session init. session_shutdown is
 * registered last for symmetry.
 */
export function registerHooks(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  registerSessionStartHook(pi, runtime);
  registerContextHook(pi, runtime);
  registerAppendSystemHook(pi, runtime);
  registerCompactionHook(pi, runtime);
  registerToolResultHook(pi, runtime);
  registerTurnEndHook(pi, runtime);
  registerProviderRequestHook(pi);
  registerSessionShutdownHook(pi, runtime);
}
