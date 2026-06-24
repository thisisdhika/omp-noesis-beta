"use strict";

/**
 * omp-noesis: Command Registration
 *
 * Registers all noesis slash commands.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import { initCommand } from "./init-command.js";
import { tokenProfileCommand } from "./token-profile-command.js";
import { debugCommand } from "./debug-command.js";
import { reviewCommand } from "./review-command.js";
import { sandboxCommand } from "./sandbox-command.js";
import { federateCommand } from "./federate-command.js";


export function registerCommands(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.registerCommand("noesis:init", {
    description: "Initialize Noesis cognitive substrate for this project",
    handler: async (_args: string, _ctx: ExtensionCommandContext) => {
      await initCommand(pi, {});
    },
  });
  pi.registerCommand("noesis:token-profile", {
    description: "Display token budget usage across cognitive state sections",
    handler: async (args: string, _ctx: ExtensionCommandContext) => {
      const result = await tokenProfileCommand(args, _ctx, runtime);
      pi.sendMessage({
        customType: "noesis:token-profile",
        content: result,
        display: true,
        attribution: "agent",
      });
    },
  });
  pi.registerCommand("noesis:debug", {
    description: "Cognitive observability — provenance, attention, compaction, state summary",
    handler: async (args: string, _ctx: ExtensionCommandContext) => {
      const result = await debugCommand(args, _ctx, runtime);
      pi.sendMessage({
        customType: "noesis:debug",
        content: result,
        display: true,
        attribution: "agent",
      });
    },
  });
  pi.registerCommand("noesis:review", {
    description: "Manage beliefs flagged for human review — pending, accept <id>, reject <id>",
    handler: async (args: string, _ctx: ExtensionCommandContext) => {
      const result = await reviewCommand(args, _ctx, runtime);
      pi.sendMessage({
        customType: "noesis:review",
        content: result,
        display: true,
        attribution: "agent",
      });
    },
  });
  pi.registerCommand("noesis:sandbox", {
    description: "Speculative belief sandbox — create, explore <id> <content>, merge <id>, discard <id>, list",
    handler: async (args: string, _ctx: ExtensionCommandContext) => {
      const result = await sandboxCommand(args, _ctx, runtime);
      pi.sendMessage({
        customType: "noesis:sandbox",
        content: result,
        display: true,
        attribution: "agent",
      });
    },
  });
  pi.registerCommand("noesis:federate", {
    description: "Multi-agent belief federation — publish, pull, revise, retract, identity, status",
    handler: async (args: string, _ctx: ExtensionCommandContext) => {
      const result = await federateCommand(args, _ctx, runtime);
      pi.sendMessage({
        customType: "noesis:federate",
        content: result,
        display: true,
        attribution: "agent",
      });
    },
  });
}
