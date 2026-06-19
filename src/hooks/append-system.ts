"use strict";

/**
 * omp-noesis: Append System Hook
 * Version: 0.1.0
 *
 * Appends static cognitive framing (capability) to the system prompt before
 * each agent invocation.  Static noesis rules live in .omp/RULES.md
 * (auto-discovered by OMP); this hook injects per-session capability detection.
 */

import type { ExtensionAPI, BeforeAgentStartEvent, BeforeAgentStartEventResult } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import { detectCapability } from "../infrastructure/graphify-client.js";


// ============================================================================
// HOOK REGISTRATION
// ============================================================================

/**
 * Register the before_agent_start hook that appends capability framing after
 * OMP's system prompt (which already includes .omp/RULES.md content via native
 * always-apply rule discovery).
 */
export function registerAppendSystemHook(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.on("before_agent_start", async (event: BeforeAgentStartEvent): Promise<BeforeAgentStartEventResult> => {
    const capability = await detectCapability(runtime.projectRoot);

    return {
      systemPrompt: [
        ...(event.systemPrompt ?? []),
        `[Noesis capability: ${capability}]`,
        `[Noesis state: .omp/noesis/state.json]`,
      ],
    };
  });
}
