"use strict";

/**
 * omp-noesis: Append System Hook
 * Version: 0.1.0
 *
 * Appends a dynamic capability footer to the system prompt before each agent
 * invocation.  Static noesis rules live in .omp/RULES.md (auto-discovered by
 * OMP); this hook only injects the per-session capability detection result.
 */

import type { ExtensionAPI, BeforeAgentStartEvent, BeforeAgentStartEventResult } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import { detectCapability } from "../infrastructure/graphify-client.js";
import type { CapabilityLevel } from "../schema.js";

// ============================================================================
// HOOK REGISTRATION
// ============================================================================

/**
 * Register the before_agent_start hook that appends a one-line capability
 * footer after OMP's system prompt (which already includes .omp/RULES.md
 * content via native always-apply rule discovery).
 */
export function registerAppendSystemHook(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.on("before_agent_start", async (event: BeforeAgentStartEvent): Promise<BeforeAgentStartEventResult> => {
    const capability: CapabilityLevel = await detectCapability(runtime.projectRoot);

    return {
      systemPrompt: [
        ...(event.systemPrompt ?? []),
        `[Noesis: ${capability}. State: .omp/noesis/state.json]`,
      ],
    };
  });
}
