"use strict";

/**
 * omp-noesis: Command Registration
 *
 * Registers all noesis slash commands.
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import { initCommand } from "./init-command.js";

export function registerCommands(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.registerCommand("omp noesis init", {
    description: "Initialize Noesis cognitive substrate for this project",
    handler: async (_args: string) => {
      await initCommand(pi, {});
    },
  });
}
