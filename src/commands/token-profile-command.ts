"use strict";

/**
 * omp-noesis: Token Profile Command
 * Version: 1.0.0
 *
 * `/noesis:token-profile` — displays the current token budget usage
 * across all cognitive state sections (core, session, working, reserve).
 *
 * Reads the current Noesis state, builds sections from active state data,
 * computes per-category budget consumption, and formats a terminal table.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import { computeBudget, type SectionBudget } from "../rendering/token-accountant.js";

// ============================================================================
// Constants
// ============================================================================

const CATEGORY_LABEL: Record<SectionBudget["category"], string> = {
  core: "Core Beliefs",
  session: "Session Context",
  working: "Working Memory",
  reserve: "Reserve",
};

const CATEGORY_LIMIT: Record<SectionBudget["category"], number> = {
  core: 600,
  session: 800,
  working: 400,
  reserve: 200,
};

const CATEGORY_ORDER: SectionBudget["category"][] = [
  "core",
  "session",
  "working",
  "reserve",
];

// ============================================================================
// Formatter
// ============================================================================

function formatTable(budget: SectionBudget[]): string {
  const totalAllocated = budget.reduce((s, b) => s + b.allocated, 0);
  const totalUsed = budget.reduce((s, b) => s + b.used, 0);

  const lines: string[] = [];
  lines.push(`Category           Used    Limit   %`);
  lines.push(`─────────────────────────────────────────`);

  for (const cat of CATEGORY_ORDER) {
    const catBudgets = budget.filter((b) => b.category === cat);
    const catUsed = catBudgets.reduce((s, b) => s + b.used, 0);
    const limit = CATEGORY_LIMIT[cat];
    const pct = limit > 0 ? Math.round((catUsed / limit) * 100) : 0;
    lines.push(
      `${CATEGORY_LABEL[cat].padEnd(18)} ${String(catUsed).padStart(4)}  ${String(limit).padStart(5)}  ${String(pct).padStart(3)}%`,
    );

    // Per-section breakdown under each category
    for (const b of catBudgets) {
      const pctS = b.allocated > 0 ? Math.round((b.used / b.allocated) * 100) : 0;
      lines.push(
        `  ${b.name.padEnd(16)} ${String(b.used).padStart(4)}  ${String(b.allocated).padStart(5)}  ${String(pctS).padStart(3)}%`,
      );
    }
  }

  lines.push(`─────────────────────────────────────────`);
  lines.push(
    `${"Total".padEnd(18)} ${String(totalUsed).padStart(4)}  ${String(totalAllocated).padStart(5)}  ${totalAllocated > 0 ? Math.round((totalUsed / totalAllocated) * 100) : 0}%`,
  );

  return lines.join("\n");
}

// ============================================================================
// Command
// ============================================================================

export async function tokenProfileCommand(
  _args: string,
  _ctx: ExtensionCommandContext,
  runtime: NoesisRuntime,
): Promise<string> {
  const state = runtime.stateManager.read();

  // Build sections from active state (parallels preamble-builder section set)
  const sections: { name: string; content: string }[] = [];

  if (state.attention.focus) {
    sections.push({ name: "Focus", content: state.attention.focus });
  }
  if (state.belief.decisions.length > 0) {
    sections.push({
      name: "Active Decisions",
      content: state.belief.decisions.map((d) => d.content).join("\n"),
    });
  }
  if (state.belief.facts.length > 0) {
    sections.push({
      name: "Active Beliefs",
      content: state.belief.facts.map((f) => f.content).join("\n"),
    });
  }
  if (state.commitment.workflow?.goal) {
    sections.push({ name: "Workflow", content: state.commitment.workflow.goal });
  }
  const unresolved = state.inference.hypotheses.filter((h) => h.status === "testing");
  if (unresolved.length > 0) {
    sections.push({
      name: "Unresolved Hypotheses",
      content: unresolved.map((h) => h.content).join("\n"),
    });
  }
  const allEntries = [...state.learning.successes, ...state.learning.failures];
  if (allEntries.length > 0) {
    sections.push({
      name: "Top-Ranked Learning",
      content: allEntries.map((e) => e.description).join("\n"),
    });
  }

  const budget = computeBudget("", sections);
  return formatTable(budget);
}
