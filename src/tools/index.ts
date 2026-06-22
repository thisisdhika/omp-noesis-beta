"use strict";

/**
 * omp-noesis: Tool Registration
 * Version: 1.0.0
 *
 * Registers all noesis LLM-callable tools with the Oh My Pi extension API.
 * Each tool is authored in its own file and registered by a dedicated
 * register*Tool function.
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import { registerAttendTool } from "./attend-tool.js";
import { registerBelieveFactTool, registerBelieveDecisionTool } from "./believe-tool.js";
import { registerInferTool } from "./infer-tool.js";
import { registerCommitTool } from "./commit-tool.js";
import { registerStateInspectTool } from "./state-inspect-tool.js";
import { registerToolAliases } from "./aliases.js";

/**
 * Register all noesis tools with the extension API.
 * Must be called during extension load (before tool execution).
 *
 * @param pi      The Oh My Pi extension API.
 * @param runtime The noesis runtime providing state access.
 */
export function registerTools(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  registerAttendTool(pi, runtime);
  registerBelieveFactTool(pi, runtime);
  registerBelieveDecisionTool(pi, runtime);
  registerInferTool(pi, runtime);
  registerCommitTool(pi, runtime);
  registerStateInspectTool(pi, runtime);
  registerToolAliases(pi, runtime);
}
