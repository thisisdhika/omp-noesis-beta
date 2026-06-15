"use strict";

/**
 * omp-noesis: Extension Entry Point
 * Version: 0.1.0
 *
 * Registers all tools, hooks, and commands with Oh My Pi.
 * No runtime actions occur during module load.
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { createRuntime } from "./runtime.js";
import { registerTools } from "./tools/index.js";
import { registerHooks } from "./hooks/index.js";
import { registerCommands } from "./commands/index.js";

export default async function noesisExtension(pi: ExtensionAPI) {
  const runtime = await createRuntime(pi);
  registerTools(pi, runtime);
  registerHooks(pi, runtime);
  registerCommands(pi, runtime);
}
