"use strict";

/**
 * omp-noesis: Survivor Builder
 *
 * Builds the survivor context — the compact XML payload that survives
 * session compaction when context is trimmed. Contains the agent's
 * current attention, top beliefs, active workflow, and recent learning.
 *
 * Budget is strictly capped at 500 tokens; if exceeded, sections are
 * evicted bottom-up (learning → beliefs) while attention, workflow,
 * and the state pointer are always preserved.
 */

import type { NoesisState } from "../schema.js";
import { estimateTokens } from "../shared/tokens.js";
import { escapeXml } from "../shared/text.js";

// ---------------------------------------------------------------------------
// Internal section builders
// ---------------------------------------------------------------------------

/** Build the <attention> block. Always present. */
function buildAttention(state: NoesisState): string {
  const a = state.attention;
  return [
    "  <attention>",
    `    <focus>${escapeXml(a.focus)}</focus>`,
    `    <priority>${escapeXml(a.priority)}</priority>`,
    `    <files>${escapeXml(a.files.join(", "))}</files>`,
    "  </attention>",
  ].join("\n");
}

/** Build the <beliefs> block — active facts with confidence >= 0.75, max 5. */
function buildBeliefs(state: NoesisState): string {
  const active = state.belief.facts
    .filter((f) => f.status === "active" && f.confidence >= 0.75)
    .slice(0, 5);

  if (active.length === 0) return "";

  const entries = active.map((f) => {
    const c = escapeXml(String(f.confidence));
    const content = escapeXml(f.content);
    return `    <belief confidence="${c}">${content}</belief>`;
  });

  return ["  <beliefs>", ...entries, "  </beliefs>"].join("\n");
}

/** Build the <workflow> block — goal, status, and pending/active steps (max 3). */
function buildWorkflow(state: NoesisState): string {
  const wf = state.commitment.workflow;
  const steps = wf.steps
    .filter((s) => s.status === "pending" || s.status === "active")
    .slice(0, 3);

  const lines = [
    "  <workflow>",
    `    <goal>${escapeXml(wf.goal)}</goal>`,
    `    <status>${escapeXml(wf.status)}</status>`,
  ];

  for (const s of steps) {
    lines.push(
      `    <step status="${escapeXml(s.status)}">${escapeXml(s.description)}</step>`,
    );
  }

  lines.push("  </workflow>");
  return lines.join("\n");
}

/** Build the <learning> block — top 3 entries by recency (successes + failures). */
function buildLearning(state: NoesisState): string {
  const all = [...state.learning.successes, ...state.learning.failures]
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
    .slice(0, 3);

  if (all.length === 0) return "";

  const entries = all.map((e) => {
    const resolved = String(e.status === "resolved");
    const desc = escapeXml(e.description);
    return `    <entry resolved="${resolved}">${desc}</entry>`;
  });

  return ["  <learning>", ...entries, "  </learning>"].join("\n");
}

// ---------------------------------------------------------------------------
// Assembly helpers
// ---------------------------------------------------------------------------

const POINTER_LINE = '  <pointer>.omp/noesis/state.json</pointer>';

/** Wrap an ordered list of section strings into a complete <noesis-state> document. */
function assemble(sections: string[]): string {
  return `<noesis-state>\n${sections.filter(Boolean).join("\n")}\n</noesis-state>`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the survivor context — a compact XML payload wrapped in
 * `<noesis-state>` tags that survives context trimming during session
 * compaction.
 *
 * Budget enforcement (≤ 500 estimated tokens):
 * 1. Build all sections.
 * 2. If over budget, drop sections bottom-up (learning first, then beliefs).
 * 3. Attention, workflow, and the state pointer are always retained.
 */
export function buildSurvivorContext(state: NoesisState): string {
  const attention = buildAttention(state);
  const beliefs = buildBeliefs(state);
  const workflow = buildWorkflow(state);
  const learning = buildLearning(state);

  // Full payload
  let result = assemble([attention, beliefs, workflow, learning, POINTER_LINE]);
  if (estimateTokens(result) <= 500) return result;

  // Over budget — evict learning (bottom-up)
  result = assemble([attention, beliefs, workflow, POINTER_LINE]);
  if (estimateTokens(result) <= 500) return result;

  // Still over — evict beliefs; attention + workflow + pointer always fits
  result = assemble([attention, workflow, POINTER_LINE]);
  return result;
}
