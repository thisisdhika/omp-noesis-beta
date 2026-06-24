"use strict";

/**
 * omp-noesis: Debug Command
 * Version: 1.0.0
 *
 * `/noesis:debug` — cognitive observability: provenance chains,
 * attention state, compaction loss reports, and state summary.
 */

import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import { resolveProvenance } from "../application/use-cases/resolve-provenance.js";
import type { CompactionResult } from "../domains/compaction/schema.js";

// ============================================================================
// Provenance formatter
// ============================================================================

function formatProvenanceChain(runtime: NoesisRuntime, beliefId: string): string {
  const state = runtime.stateManager.read();
  const node = resolveProvenance(state, beliefId);
  if (!node) {
    return `Belief not found: ${beliefId}`;
  }

  const lines: string[] = [];
  lines.push(`=== Provenance: ${node.beliefId} ===`);
  lines.push(`Content: ${node.content}`);
  lines.push(`Source: ${node.source}`);
  lines.push(`Created: ${node.createdAt}`);
  if (node.evidence) lines.push(`Evidence: ${node.evidence}`);
  if (node.supersededBy) lines.push(`Superseded by: ${node.supersededBy}`);
  if (node.supersedes.length > 0) {
    lines.push(`Supersedes:`);
    for (const id of node.supersedes) {
      const sub = resolveProvenance(state, id);
      if (sub) {
        lines.push(`  ${sub.beliefId}: ${sub.content.slice(0, 120)}`);
      }
    }
  }

  // Walk forward through supersession chain (newer versions)
  let currentId = node.supersededBy;
  while (currentId) {
    const parent = resolveProvenance(state, currentId);
    if (!parent) break;
    lines.push(``);
    lines.push(`  ↑ supersedes ${parent.beliefId}`);
    lines.push(`  Content: ${parent.content.slice(0, 120)}`);
    currentId = parent.supersededBy;
  }

  return lines.join("\n");
}

// ============================================================================
// Attention formatter
// ============================================================================

function formatAttention(runtime: NoesisRuntime): string {
  const state = runtime.stateManager.read();
  const a = state.attention;
  const lines: string[] = [];
  lines.push(`=== Attention ===`);
  lines.push(`Focus: ${a.focus || "(none)"}`);
  lines.push(`Priority: ${a.priority}`);
  lines.push(`Files: ${a.files.length}`);
  lines.push(`Graph queries: ${a.graphQueries.length}`);
  lines.push(`Graph findings: ${a.graphFindings.length}`);
  return lines.join("\n");
}

// ============================================================================
// Compaction formatter
// ============================================================================

function formatCompaction(runtime: NoesisRuntime, sub: string): string {
  const state = runtime.stateManager.read();
  const history = state.compactionHistory;

  if (history.length === 0) {
    return "(no compaction data available)";
  }

  if (sub === "last") {
    return formatCompactionEntry(history[history.length - 1]!);
  }

  const idx = parseInt(sub, 10);
  if (!isNaN(idx) && idx >= 0 && idx < history.length) {
    return formatCompactionEntry(history[idx]!);
  }

  const lines: string[] = ["=== Compaction History ==="];
  for (let i = 0; i < history.length; i++) {
    const h = history[i]!;
    lines.push(
      `  [${i}] ${h.occurredAt}: pre={facts:${h.preCounts.facts}, decisions:${h.preCounts.decisions}}, post={facts:${h.postCounts.facts}, decisions:${h.postCounts.decisions}}`,
    );
  }
  return lines.join("\n");
}

function formatCompactionEntry(entry: CompactionResult): string {
  const lines: string[] = ["=== Compaction Result ==="];
  lines.push(`Occurred: ${entry.occurredAt}`);
  lines.push(`Before: facts=${entry.preCounts.facts}, decisions=${entry.preCounts.decisions}`);
  lines.push(`After:  facts=${entry.postCounts.facts}, decisions=${entry.postCounts.decisions}`);

  if (entry.evicted.length > 0) {
    lines.push(`Evicted (${entry.evicted.length}):`);
    for (const e of entry.evicted) {
      lines.push(`  ${e.id}: ${e.reason}`);
    }
  }

  if (entry.degraded.length > 0) {
    lines.push(`Degraded (${entry.degraded.length}):`);
    for (const d of entry.degraded) {
      lines.push(`  ${d.id}: ${d.reason}`);
    }
  }
  return lines.join("\n");
}

// ============================================================================
// State summary formatter
// ============================================================================

function formatStateSummary(runtime: NoesisRuntime): string {
  const state = runtime.stateManager.read();
  const lines: string[] = [];
  lines.push(`=== State Summary ===`);
  lines.push(`Version: ${state.version}`);
  lines.push(`Last persisted: ${state.lastPersisted}`);
  const activeFacts = state.belief.facts.filter((f) => f.status === "active").length;
  const supersededFacts = state.belief.facts.filter((f) => f.status === "superseded").length;
  lines.push(`Facts: ${state.belief.facts.length} (${activeFacts} active, ${supersededFacts} superseded)`);
  lines.push(`Decisions: ${state.belief.decisions.length}`);
  lines.push(`Hypotheses: ${state.inference.hypotheses.length}`);
  lines.push(`Reasoning steps: ${state.inference.reasoning.length}`);
  lines.push(`Workflow: ${state.commitment.workflow?.status ?? "(none)"}`);
  lines.push(`Actions: ${state.commitment.actions.length}`);
  lines.push(`Learning successes: ${state.learning.successes.length}`);
  lines.push(`Learning failures: ${state.learning.failures.length}`);
  return lines.join("\n");
}

// ============================================================================
// Command handler
// ============================================================================

export async function debugCommand(
  args: string,
  _ctx: ExtensionCommandContext,
  runtime: NoesisRuntime,
): Promise<string> {
  const trimmed = args.trim();
  const spaceIdx = trimmed.indexOf(" ");
  const subcommand = spaceIdx >= 0 ? trimmed.slice(0, spaceIdx) : trimmed;
  const subargs = spaceIdx >= 0 ? trimmed.slice(spaceIdx + 1).trim() : "";

  switch (subcommand) {
    case "provenance":
      if (!subargs) return "Usage: /noesis:debug provenance <beliefId>";
      return formatProvenanceChain(runtime, subargs);
    case "attention":
      return formatAttention(runtime);
    case "compaction":
      return formatCompaction(runtime, subargs || "last");
    case "state":
      return formatStateSummary(runtime);
    default:
      return (
        "Available subcommands:\n" +
        "  provenance <beliefId>  — resolve and display provenance chain\n" +
        "  attention              — show current focus, priority, files, graph findings\n" +
        "  compaction [last|N]    — show compaction result\n" +
        "  state                  — show state summary (counts per layer)"
      );
  }
}
