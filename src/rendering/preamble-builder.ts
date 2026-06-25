"use strict";

/**
 * omp-noesis: Preamble Builder
 * Version: 1.0.0
 *
 * Builds the cognitive preamble — a structured XML string injected into
 * the conversation context at the start of every turn.
 *
 * Enforces a character budget and delegates to per-section builders.
 */

import type {
  NoesisState,
  RenderContext,
  LearningEntry,
} from "../shared/schema.js";
import { MAX_PREAMBLE_TOKENS, CAPS } from "../shared/schema.js";
import { estimateTokens } from "../shared/tokens.js";
import { truncate, stripMarkdown } from "../shared/text.js";
import { getProfile, type ModelFamily } from "../shared/model-profile.js";

function getContestedWarnings(state: NoesisState): string[] {
  const supersededIds = new Set(
    state.belief.facts
      .filter((f) => f.status === "superseded")
      .map((f) => f.id),
  );

  const warnings: string[] = [];

  for (const supersededId of supersededIds) {
    const dependents = state.inference.hypotheses.filter(
      (h) => h.relatedBeliefId === supersededId,
    );

    for (const hyp of dependents) {
      const fact = state.belief.facts.find((f) => f.id === supersededId);
      if (fact === undefined) continue;

      const factContent =
        fact.content.length > 40
          ? fact.content.slice(0, 40) + "..."
          : fact.content;
      const hypContent =
        hyp.content.length > 40
          ? hyp.content.slice(0, 40) + "..."
          : hyp.content;

      warnings.push(
        `Belief '${factContent}' superseded (${supersededId}); hypothesis '${hypContent}' (${hyp.id}) may need review`,
      );
    }
  }

  return warnings;
}

// ============================================================================
// SECTION BUILDERS (each returns the section text or empty string)
// ============================================================================

function buildCapabilityBlock(render: RenderContext): string {
  const { capabilityLevel, graphifyVersion, graphFreshness } = render;
  const version = graphifyVersion ? ` v${graphifyVersion}` : "";

  switch (capabilityLevel) {
    case "FULL":
      return `[Noesis: FULL — graph-aware${version}]`;
    case "STALE": {
      const hours = graphFreshness?.staleHours ?? "?";
      return `[Noesis: STALE — graph ${hours}h stale, review needed]`;
    }
    case "NO_GRAPH":
      return "[Noesis: NO_GRAPH — graph not built]";
    case "DEGRADED":
      return "[Noesis: DEGRADED — limited operation]";
    default:
      return "[Noesis: UNKNOWN — operating without graph]";
  }
}

function buildContestedWarnings(state: NoesisState): string {
  const warnings = getContestedWarnings(state);
  if (warnings.length === 0) return "";
  return "[WARNINGS]\n" + warnings.map((w) => `- ${w}`).join("\n");
}

function buildFocus(state: NoesisState): string {
  const focus = state.attention.focus;
  if (!focus) return "";
  return `Focus: ${truncate(stripMarkdown(focus), CAPS.focusLength)}`;
}

function buildWorkflow(state: NoesisState): string {
  const { workflow } = state.commitment;
  if (!workflow.goal) return "";

  const lines: string[] = [`Workflow: ${workflow.goal}`];

  const pendingActive = workflow.steps.filter(
    (s) => s.status === "pending" || s.status === "active",
  );
  const shown = pendingActive.slice(0, CAPS.workflow);
  for (const step of shown) {
    lines.push(`  [${step.status}] ${step.description}`);
  }

  return lines.join("\n");
}

function buildActiveDecisions(state: NoesisState): string {
  const active = state.belief.decisions.filter((d) => d.status === "active");
  if (active.length === 0) return "";

  const shown = active.slice(0, CAPS.decisions);
  const lines: string[] = ["Decisions:"];
  for (const d of shown) {
    lines.push(`  - ${d.content}`);
  }
  return lines.join("\n");
}

function buildActiveBeliefs(state: NoesisState, _render: RenderContext): string {
  const highConfidence = state.belief.facts.filter(
    (f) => f.status === "active" && f.confidence >= 0.75,
  );
  if (highConfidence.length === 0) return "";

  const epistemicSymbol: Record<string, string> = {
    certain: "\u25CF",
    probable: "\u25C9",
    speculative: "\u25CB",
    deprecated: "\u25C7",
    contradicted: "\u26A0",
  };

  const shown = highConfidence.slice(0, CAPS.beliefs);
  const lines: string[] = ["Beliefs (\u22650.75):"];
  for (const f of shown) {
    const sym = epistemicSymbol[f.epistemicStatus] ?? "\u25CB";
    lines.push(`  ${sym} [${f.confidence.toFixed(2)}] ${f.content}`);
  }
  return lines.join("\n");
}

function buildUnresolvedHypotheses(state: NoesisState): string {
  const unresolved = state.inference.hypotheses.filter(
    (h) => h.status === "testing",
  );
  if (unresolved.length === 0) return "";

  const shown = unresolved.slice(0, CAPS.hypotheses);
  const lines: string[] = ["Hypotheses:"];
  for (const h of shown) {
    lines.push(`  - [${h.status}] ${h.content}`);
  }
  return lines.join("\n");
}

function buildTopRankedLearning(state: NoesisState): string {
  // Combine successes and failures, sort by most recent first
  const allEntries: LearningEntry[] = [
    ...state.learning.successes,
    ...state.learning.failures,
  ];
  if (allEntries.length === 0) return "";

  allEntries.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  const shown = allEntries.slice(0, CAPS.learning);

  const lines: string[] = ["Learning:"];
  for (const e of shown) {
    let label = `  - ${e.description}`;
    if (e.prevention) {
      label += e.prevention.autoApplied ? " [auto-applied]" : " [review]";
    }
    lines.push(label);
  }
  return lines.join("\n");
}

function buildGraphEvidence(state: NoesisState): string {
  const { graphFindings } = state.attention;
  if (graphFindings.length === 0) return "";

  const budget = CAPS.graphQueryTokenBudget;
  const header = `Graph evidence (${graphFindings.length}):`;

  // If even the header alone exceeds budget, return it anyway (graceful minimum)
  const lines: string[] = [header];

  // Most recent 2 findings by timestamp
  const recent = [...graphFindings]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 2);

  for (const f of recent) {
    const findingLines: string[] = [
      `  - Query: ${f.query}`,
    ];
    if (f.nodes.length > 0) findingLines.push(`    Nodes: ${f.nodes.slice(0, 3).join(", ")}`);
    if (f.relations.length > 0) findingLines.push(`    Relations: ${f.relations.slice(0, 2).join(", ")}`);
    findingLines.push(`    Confidence: ${f.confidence}${f.inferredConfidence ? ` (${f.inferredConfidence})` : ""}`);
    if (f.community) findingLines.push(`    Community: ${f.community}`);

    // Check budget before adding this finding
    const candidate = [...lines, ...findingLines].join("\n");
    if (budget > 0 && estimateTokens(candidate) > budget) break;

    lines.push(...findingLines);
  }

  return lines.join("\n");
}

function buildLowConfidenceSignal(state: NoesisState): string {
  const count = state.belief.facts.filter(
    (f) => f.status === "active" && f.confidence < 0.75,
  ).length;
  if (count === 0) return "";
  return `Low-confidence beliefs: ${count}`;
}



// ============================================================================
// SECTION REGISTRY
// ============================================================================

interface Section {
  readonly index: number;
  readonly content: string;
  readonly protected: boolean;
}

function buildSections(state: NoesisState, render: RenderContext): Section[] {
  // Ordered by signal strength: highest-signal content first.
  // Protected sections are always kept when dropping under budget.
  const allSections: Section[] = [
    { index: 1, content: buildCapabilityBlock(render), protected: true },
    { index: 2, content: buildContestedWarnings(state), protected: true },
    { index: 3, content: buildFocus(state), protected: true },
    { index: 4, content: buildActiveDecisions(state), protected: false },
    { index: 5, content: buildActiveBeliefs(state, render), protected: false },
    { index: 6, content: buildWorkflow(state), protected: false },
    { index: 7, content: buildUnresolvedHypotheses(state), protected: false },
    { index: 8, content: buildTopRankedLearning(state), protected: false },
    { index: 9, content: buildGraphEvidence(state), protected: false },
    { index: 10, content: buildLowConfidenceSignal(state), protected: false },
    { index: 11, content: "State: .omp/noesis/state.json", protected: true },
  ];

  // Limit non-protected sections for small models
  const profile = getProfile((render.modelFamily ?? "unknown") as ModelFamily);
  const nonProtected = allSections.filter(s => !s.protected);
  if (nonProtected.length > profile.maxNonProtectedSections) {
    const toRemove = new Set(
      nonProtected
        .slice(profile.maxNonProtectedSections)
        .map(s => s.index)
    );
    return allSections.filter(s => !toRemove.has(s.index));
  }
  return allSections;

}

/** Map section index to the canonical section name used by token-accountant categorisation. */
export const SECTION_NAMES: Record<number, string> = {
  1: "Capability Block",
  2: "Contested Warnings",
  3: "Focus",
  4: "Active Decisions",
  5: "Active Beliefs",
  6: "Workflow",
  7: "Unresolved Hypotheses",
  8: "Top-Ranked Learning",
  9: "Graph Evidence",
  10: "Low Confidence Signal",
  11: "State Pointer",
};

/**
 * Build a section list compatible with token-accountant's computeBudget.
 * Each entry has a `name` (for category mapping) and `content` (for token estimation).
 * Only non-empty sections are included.
 */
export function buildSectionList(
  state: NoesisState,
  render: RenderContext,
): { name: string; content: string }[] {
  return buildSections(state, render)
    .filter(s => s.content.length > 0)
    .map(s => ({
      name: SECTION_NAMES[s.index] ?? `Section ${s.index}`,
      content: s.content,
    }));
}


// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Build the context preamble string for the given state and render context.
 *
 * The preamble is assembled from up to 11 ordered sections. Sections with
 * no content are omitted. If the total exceeds MAX_PREAMBLE_TOKENS,
 * non-protected sections are dropped from the bottom upward (section 10
 * first, then 9, etc.) until the budget is met or only protected sections
 * remain.
 */
export function buildPreamble(
  state: NoesisState,
  render: RenderContext,
): string {
  let active = buildSections(state, render).filter(
    (s) => s.content.length > 0,
  );

  let preamble = active.map((s) => s.content).join("\n\n");

  // Budget enforcement: drop non-protected sections bottom-up until under budget
  while (estimateTokens(preamble) > MAX_PREAMBLE_TOKENS) {
    const droppable = active
      .filter((s) => !s.protected)
      .sort((a, b) => b.index - a.index);

    if (droppable.length === 0) break; // nothing left to drop

    const dropIndex = droppable[0]!.index;
    active = active.filter((s) => s.index !== dropIndex);

    preamble = active.map((s) => s.content).join("\n\n");
  }

  return preamble;
}
