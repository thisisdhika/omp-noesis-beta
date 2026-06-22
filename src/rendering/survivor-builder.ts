"use strict";

/**
 * omp-noesis: Survivor Builder
 * Version: 1.0.0
 *
 * Builds the survivor context — a compact XML payload representing
 * the essential cognitive state for preservation across compaction.
 *
 * Sections: attention, beliefs, workflow, learning.
 * Each section is independently truncated to stay within budget.
 */

import { CAPS } from "../shared/schema.js";
import type { NoesisState } from "../shared/schema.js";
import { estimateTokens } from "../shared/tokens.js";
import { escapeXml } from "../shared/text.js";

// ---------------------------------------------------------------------------
// Internal section builders
// ---------------------------------------------------------------------------

/** Build the <attention> block. Always present. Fields are locally bounded
 * to keep the always-kept skeleton (attention + workflow + pointer) within
 * ≤500 tokens under maximal realistic inputs. */
function buildAttention(state: NoesisState): string {
  const a = state.attention;
  // Survivor snapshot — truncate verbose fields aggressively
  const focus = a.focus.length <= 150 ? a.focus : a.focus.slice(0, 150);
  const files = a.files.slice(0, 5);
  return [
    "  <attention>",
    `    <focus>${escapeXml(focus)}</focus>`,
    `    <priority>${escapeXml(a.priority)}</priority>`,
    `    <files>${escapeXml(files.join(", "))}</files>`,
    "  </attention>",
  ].join("\n");
}

/** Build the <beliefs> block — active facts with confidence >= 0.75, max CAPS.beliefs. */
function buildBeliefs(state: NoesisState): string {
  const active = state.belief.facts
    .filter((f) => f.status === "active" && f.confidence >= 0.75)
    .slice(0, CAPS.beliefs);

  if (active.length === 0) return "";

  const entries = active.map((f) => {
    const c = escapeXml(String(f.confidence));
    const content = escapeXml(f.content);
    return `    <belief confidence="${c}">${content}</belief>`;
  });

  return ["  <beliefs>", ...entries, "  </beliefs>"].join("\n");
}

/** Build the <workflow> block — goal, status, and pending/active steps (max 3).
 * Goal and step descriptions are locally bounded to keep the always-kept
 * skeleton within ≤500 tokens under maximal realistic inputs. */
function buildWorkflow(state: NoesisState): string {
  const wf = state.commitment.workflow;
  const steps = wf.steps
    .filter((s) => s.status === "pending" || s.status === "active")
    .slice(0, 3);

  // Survivor snapshot — truncate verbose fields aggressively
  const goal = wf.goal.length <= 200 ? wf.goal : wf.goal.slice(0, 200);

  const lines = [
    "  <workflow>",
    `    <goal>${escapeXml(goal)}</goal>`,
    `    <status>${escapeXml(wf.status)}</status>`,
  ];

  for (const s of steps) {
    const desc = s.description.length <= 150 ? s.description : s.description.slice(0, 150);
    lines.push(
      `    <step status="${escapeXml(s.status)}">${escapeXml(desc)}</step>`,
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
 * 1. Verbose fields in attention (focus, files) and workflow (goal, step
 *    descriptions) are locally bounded to keep the always-kept skeleton
 *    under budget.
 * 2. Build all bounded sections.
 * 3. If still over budget, drop sections bottom-up (learning first, then beliefs).
 * 4. Attention, workflow, and the state pointer are always retained.
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

  // Still over — evict beliefs; attention + workflow + pointer stays ≤500
  // thanks to local bounding in buildAttention and buildWorkflow.
  result = assemble([attention, workflow, POINTER_LINE]);
  return result;
}
