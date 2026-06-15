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
import type { CapabilityLevel, RenderContext } from "../schema.js";
import { buildPreamble } from "../rendering/preamble-builder.js";
import { detectCapability } from "../infrastructure/graphify-client.js";

/** Module-level cache: detect once and reuse across turns. */
let _capability: CapabilityLevel | null = null;

/**
 * Register the context hook that prepends the cognitive preamble
 * as the first user message in the conversation.
 */
export function registerContextHook(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.on("context", async (event: ContextEvent, _ctx): Promise<ContextEventResult> => {
    const state = runtime.stateManager.read();
    // Detect capability level once and cache it
    if (_capability === null) {
      _capability = await detectCapability(runtime.projectRoot);
    }

    const renderContext: RenderContext = {
      capabilityLevel: _capability,
      contextHookFired: true,
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
