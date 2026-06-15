"use strict";

/**
 * omp-noesis: Before Agent Start Hook
 * Version: 0.1.0
 *
 * Safety-net hook that injects the Noesis cognitive substrate instruction
 * into the system prompt before every agent invocation.  Always fires
 * regardless of whether the context hook already ran, ensuring the agent
 * always knows the state file location.
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import { detectCapability } from "../infrastructure/graphify-client.js";
import type { CapabilityLevel } from "../schema.js";

interface BeforeAgentStartResult {
  systemPrompt?: string[];
}

/**
 * Register the before_agent_start hook that appends the Noesis
 * substrate pointer to the system prompt.  Acts as a safety-net
 * for turns where the context hook may not have fired.
 */
export function registerBeforeAgentStartHook(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.on("before_agent_start", async (_event) => {
    // Detect capability dynamically so the agent knows its operational mode
    const capability: CapabilityLevel = await detectCapability(runtime.projectRoot);
    return {
      systemPrompt: [
        `[Noesis cognitive substrate active. Mode: ${capability}. State: .omp/noesis/state.json]`,
      ],
    };
  });
}
