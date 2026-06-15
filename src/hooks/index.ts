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
import { registerContextHook } from "./context-hook.js";
import { registerBeforeAgentStartHook } from "./before-agent-start.js";
import { registerCompactionHook } from "./compaction-hook.js";
import { registerToolResultHook } from "./tool-result-hook.js";
import { registerTurnEndHook } from "./turn-end.js";

/**
 * Register all Noesis hooks with the given OMP extension API.
 * Must be called during extension activation, after runtime creation.
 */
export function registerHooks(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  registerContextHook(pi, runtime);
  registerBeforeAgentStartHook(pi, runtime);
  registerCompactionHook(pi, runtime);
  registerToolResultHook(pi, runtime);
  registerTurnEndHook(pi, runtime);
}
