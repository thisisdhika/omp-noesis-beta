"use strict";

/**
 * omp-noesis: Extension Entry Point
 * Version: 1.0.1
 *
 * Registers all tools, hooks, and commands with Oh My Pi.
 * No runtime actions occur during module load.
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { createRuntime } from "./runtime.js";
import { registerTools } from "./tools/index.js";
import { registerHooks } from "./hooks/index.js";
import { registerCommands } from "./commands/index.js";
import { startRestApi } from "./api/obsidian-rest-api.js";
import { setLogger } from "./shared/logger.js";

export default async function noesisExtension(pi: ExtensionAPI) {
  setLogger(pi as unknown as { logger?: Partial<{ warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void }> });
  const runtime = await createRuntime(pi);
  registerTools(pi, runtime);
  registerHooks(pi, runtime);
  registerCommands(pi, runtime);
  startRestApi({ vaultStore: runtime.vaultStore });
}
