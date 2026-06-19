"use strict";

/**
 * omp-noesis: Context Hook
 * Version: 0.1.0
 *
 * Injects the Noesis cognitive preamble into the conversation context
 * at the start of every turn. Provides the agent with state awareness
 * including focus, workflow, beliefs, and learning summary.
 */

import type { ExtensionAPI, ContextEvent, ContextEventResult } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import type { CapabilityLevel, RenderContext } from "../shared/schema.js";
import { detectFamilyFromModel } from "../shared/model-profile.js";

import { buildPreamble } from "../rendering/preamble-builder.js";
import { detectCapability } from "../infrastructure/graphify-client.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Module-level cache: detect once and reuse across turns. */

/** Check if MCP config has graphify server entry. */
function hasMcpGraphify(projectRoot: string): boolean {
  const mcpPath = join(projectRoot, ".omp", "mcp.json");
  if (!existsSync(mcpPath)) return false;
  try {
    const config = JSON.parse(readFileSync(mcpPath, "utf-8"));
    return !!config.mcpServers?.graphify;
  } catch {
    return false;
  }
}
let _capability: CapabilityLevel | null = null;

/**
 * Register the context hook that prepends the cognitive preamble
 * as the first user message in the conversation.
 */
export function registerContextHook(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.on("context", async (event: ContextEvent, ctx): Promise<ContextEventResult> => {
    const state = runtime.stateManager.read();
    // Detect capability level once and cache it
    if (_capability === null) {
      _capability = await detectCapability(runtime.projectRoot);
    }

    const hasMcp = hasMcpGraphify(runtime.projectRoot);
    const modelFamily = detectFamilyFromModel(ctx?.model);

    const renderContext: RenderContext = {
      capabilityLevel: _capability,
      contextHookFired: true,
      hasMcpGraphify: hasMcp,
      modelFamily,
      graphFreshness: {
        isStale: _capability === "STALE",
        staleHours: 24,
      },
    };


    const preamble = buildPreamble(state, renderContext);

    const preambleMessage = {
      role: "user" as const,
      content: [{ type: "text" as const, text: preamble }],
      timestamp: Date.now(),
    };

    return { messages: [preambleMessage, ...event.messages] };
  });
}
