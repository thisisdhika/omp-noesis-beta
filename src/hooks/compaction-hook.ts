"use strict";

/**
 * omp-noesis: Compaction Hook
 * Version: 1.0.0
 *
 * Provides survivor context and preserve-data during session compaction.
 * Ensures Noesis cognitive state survives conversation window compression.
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import { buildSurvivorContext } from "../rendering/survivor-builder.js";
import { deepClone } from "../shared/clone.js";
import { computeCompactionResult } from "../domains/compaction/loss-strategy.js";
import { CAPS } from "../shared/schema-base.js";
import type { CompactionResult } from "../domains/compaction/schema.js";

/**
 * Register the session.compacting hook that builds a survivor context
 * from the current state and preserves the full state snapshot.
 */
export function registerCompactionHook(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.on("session.compacting", async (_event) => {
    const state = runtime.stateManager.read();

    // Snapshot pre-compaction belief state for loss metrics
    const preBeliefState = deepClone(state.belief);

    const survivorContext = buildSurvivorContext(state);

    // Compute which beliefs survived in the survivor context by mirroring
    // the same filtering logic the survivor builder uses (active + high enough confidence + cap)
    const survivedFacts = state.belief.facts.filter(
      (f) => f.status === "active" && f.confidence >= 0.75,
    ).slice(0, CAPS.beliefs);

    const result = computeCompactionResult(preBeliefState, {
      facts: survivedFacts,
      decisions: state.belief.decisions,
    });

    // ponytail: use mutate to bypass readonly proxy
    await runtime.stateManager.mutate((s) => {
      s.compactionHistory = [result, ...s.compactionHistory].slice(0, 5) as CompactionResult[];
    });

    return {
      context: [survivorContext],
      preserveData: { "omp-noesis": deepClone(state) },
    };
  });
}
