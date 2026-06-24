"use strict";

/**
 * omp-noesis: Federate Command
 * Version: 1.0.0
 *
 * Slash command /noesis:federate — multi-agent belief federation.
 * Subcommands: publish, pull, revise, retract, identity, status.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import { executeFederate } from "../tools/federate-tool.js";

export async function federateCommand(
  _args: string,
  _ctx: ExtensionCommandContext,
  runtime: NoesisRuntime,
): Promise<string> {
  const result = await executeFederate(runtime, _args);
  if (result.isError) {
    return `Error: ${(result.content[0] as { text: string }).text ?? "unknown error"}`;
  }
  return (result.content[0] as { text: string }).text ?? "{}";
}
