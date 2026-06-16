"use strict";

/**
 * omp-noesis: Append System Hook
 * Version: 0.1.0
 *
 * Injects the Noesis cognitive substrate instructions into the system prompt
 * before every agent invocation.  Prepends the compact APPEND_SYSTEM block,
 * chains OMP's own system prompt, and appends a capability footer.
 *
 * The APPEND_SYSTEM block is ~300 tokens — a 70% reduction from the original
 * APPEND_SYSTEM.md by stripping tool schemas (already in the provider's native
 * tools parameter), removing hedging, and compressing into imperative XML.
 */

import type { ExtensionAPI, BeforeAgentStartEvent, BeforeAgentStartEventResult } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import { detectCapability } from "../infrastructure/graphify-client.js";
import type { CapabilityLevel } from "../schema.js";

// ============================================================================
// COMPACT APPEND SYSTEM (~300 tokens)
// ============================================================================

const APPEND_SYSTEM = `<noesis>
<identity>Noesis-enhanced agent. Cognitive state persists at .omp/noesis/state.json across turns and compaction.</identity>

<rules>
1. Task start → noesis_attend. NEVER skip.
2. Before assuming ignorance → noesis_recall first.
3. After verifying → noesis_believe type=fact (confidence + source).
4. After deciding → noesis_believe type=decision (rationale + alternatives).
5. After fixing failure → noesis_believe type=learning (rootCause + fix).
6. When planning → noesis_commit.
7. When testing theories → noesis_infer (add→update cycle).
8. Quick context switch → noesis_focus (≤200 chars).
</rules>

<graphify>
EXTRACTED → 1.0 (believe after verify) | INFERRED → 0.55–0.95 (default 0.70, verify first) | AMBIGUOUS → 0.55 (store, low-confidence)
Stale graph: -0.10 from INFERRED only (additive, floor 0.55). EXTRACTED never penalized.
Modes: FULL (normal) | STALE (penalty) | NO_GRAPH (build attempt) | DEGRADED (execution/user only)
</graphify>

<gotchas>
- NEVER auto-believe INFERRED graph edges. Verify first.
- NEVER duplicate OMP plan surface. noesis_commit tracks cognition, not execution.
- ONLY capture significant events as learning. Not every tool result.
- Beliefs are NEVER deleted — superseded → archive for audit.
- ALWAYS noesis_recall before rediscovering. Recall first, read second.
- Focus ≤200 chars. Long focus wastes preamble budget.
- noesis_vault_search queries human artifacts. Use noesis_recall for live state.
</gotchas>

<templates>
Fact: {mechanism} at {path} {action} {target} using {method}
Decision: Use {choice} over {alternative} because {rationale}. Rejected: {rejected}
Learning: {what_failed} when {trigger} | root_cause: {actual_cause} (not symptom) | fix: {exact_fix} verified by {cmd}
</templates>

<confidence>
execution/user observed → 1.0 | graph EXTRACTED → 1.0 | graph INFERRED → 0.55–0.95 | graph AMBIGUOUS → 0.55 | agent deduced → 0.5–0.95 | learning resolved → 0.85
</confidence>

<boundaries>
noesis: task cognitive state | mnemopi: cross-session memory | hindsight: session summaries | obsidian: human projection (write-only)
</boundaries>

<compaction>
State survives via survivor set in compaction context + preserveData.noesis + .omp/noesis/state.json.
</compaction>
</noesis>`;

// ============================================================================
// HOOK REGISTRATION
// ============================================================================

/**
 * Register the before_agent_start hook that prepends the compact Noesis
 * APPEND_SYSTEM block, chains through OMP's system prompt, and appends a
 * one-line capability footer.
 *
 * Chaining (not replacing) is critical: OMP's system prompt carries tool
 * instructions, workflow rules, and skill listings.  We prepend our identity
 * block before it and append a status footer after it.
 */
export function registerAppendSystemHook(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.on("before_agent_start", async (event: BeforeAgentStartEvent): Promise<BeforeAgentStartEventResult> => {
    const capability: CapabilityLevel = await detectCapability(runtime.projectRoot);

    return {
      systemPrompt: [
        APPEND_SYSTEM,
        ...(event.systemPrompt ?? []),
        `[Noesis: ${capability}. State: .omp/noesis/state.json]`,
      ],
    };
  });
}
