"use strict";

/**
 * omp-noesis: Token Accountant
 * Version: 1.0.0
 *
 * Instruments the token budget for the Noesis preamble.
 * Assigns every section to a named category and tracks
 * allocated vs. used tokens within the MAX_PREAMBLE_TOKENS (2000) budget.
 */

import { estimateTokens } from "../shared/tokens.js";

// ============================================================================
// Types
// ============================================================================

export interface SectionBudget {
  name: string;
  allocated: number;
  used: number;
  category: "core" | "session" | "working" | "reserve";
}

// ============================================================================
// Budget constants
// ============================================================================

export const BUDGET = {
  core: 600,
  session: 800,
  working: 400,
  reserve: 200,
} as const;

// ============================================================================
// Section category classification
// ============================================================================

const CATEGORY_MAP: Record<string, "core" | "session" | "working" | "reserve"> = {
  // Core — permanent structural signals
  "capability block": "core",
  "contested warnings": "core",
  "active decisions": "core",
  "active beliefs": "core",
  "graph evidence": "core",
  "state pointer": "core",

  // Session — varies per turn
  "unresolved hypotheses": "session",
  "low confidence signal": "session",

  // Working — ephemeral task context
  focus: "working",
  workflow: "working",
  "top-ranked learning": "working",
};

/** Categorise a section name into a budget category. */
export function categorizeSection(name: string): SectionBudget["category"] {
  const lower = name.trim().toLowerCase();
  return CATEGORY_MAP[lower] ?? "reserve"; // ponytail: unknown sections fall into reserve
}

// ============================================================================
// Budget computation
// ============================================================================

/**
 * Compute per-section budget usage for the given sections.
 *
 * Each section is categorised, its token consumption estimated,
 * and compared against the category's total budget. Used token
 * counts are prorated within each category when multiple sections
 * share a category.
 */
export function computeBudget(
  _preamble: string,
  sections: { name: string; content: string }[],
): SectionBudget[] {
  if (sections.length === 0) return [];

  // 1. Estimate per-section tokens
  const estimates = sections.map((s) => ({
    name: s.name,
    content: s.content,
    category: categorizeSection(s.name),
    tokens: estimateTokens(s.content),
  }));

  // 2. Sum used tokens per category
  const usedByCategory: Record<string, number> = {};
  for (const e of estimates) {
    usedByCategory[e.category] = (usedByCategory[e.category] ?? 0) + e.tokens;
  }

  // 3. Build SectionBudget entries — each section gets its share of the category budget
  //    If a category has zero used tokens, no section in it gets any allocation.
  return estimates.map((e) => {
    const totalUsed = usedByCategory[e.category] ?? 0;
    const allocated = totalUsed > 0
      ? Math.round((e.tokens / totalUsed) * BUDGET[e.category])
      : 0;
    return {
      name: e.name,
      allocated,
      used: e.tokens,
      category: e.category,
    };
  });
}
