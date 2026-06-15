"use strict";

/**
 * Per-section Markdown formatters for preamble rendering.
 *
 * Each function produces a single Markdown section string suitable for
 * inclusion in the cognitive preamble. All are pure with no side effects.
 */

import {
  BeliefDecision,
  BeliefFact,
  CapabilityLevel,
  CAPS,
  GraphFinding,
  Hypothesis,
  LearningEntry,
  WorkflowStep,
} from "../schema.js";
import { truncate } from "../shared/text.js";

/**
 * Format capability level as a one-line block string.
 *
 * @param capability  - The current graph capability level.
 * @param version     - Optional graphify version string.
 * @param staleHours  - Optional hours since last graph update (STALE only).
 */
export function formatCapability(
  capability: CapabilityLevel,
  version?: string,
  staleHours?: number,
): string {
  switch (capability) {
    case "FULL": {
      const ver = version ? ` (v${version})` : "";
      return `Capability: FULL — Graph available and current${ver}`;
    }
    case "STALE": {
      const hrs = staleHours !== undefined ? ` (${staleHours}h old)` : "";
      return `Capability: STALE — Graph data is stale${hrs}`;
    }
    case "NO_GRAPH":
      return "Capability: NO_GRAPH — No graphify integration available";
    case "DEGRADED":
      return "Capability: DEGRADED — Context hook not yet fired";
  }
}

/**
 * Format the current focus sentence.
 *
 * @param focus - Focus string to format (truncated to CAPS.focusLength).
 */
export function formatFocus(focus: string): string {
  return `Focus: ${truncate(focus, CAPS.focusLength)}`;
}

/**
 * Format a workflow section.
 *
 * Returns empty string when goal is empty.
 * Shows at most CAPS.workflow (3) steps.
 *
 * @param goal  - Workflow goal description.
 * @param steps - Ordered workflow steps.
 * @param status - Overall workflow status.
 */
export function formatWorkflow(
  goal: string,
  steps: WorkflowStep[],
  _status: string,
): string {
  if (!goal) return "";
  const header = `Workflow: ${goal}`;
  const visible = steps.slice(0, CAPS.workflow);
  if (visible.length === 0) return header;
  const lines = visible.map((s) => `  [${s.status}] ${s.description}`);
  return `${header}\n${lines.join("\n")}`;
}

/**
 * Format decisions section.
 *
 * Returns empty string when decisions array is empty.
 *
 * @param decisions - Decisions to display, limited to `max` items.
 * @param max       - Maximum number of items to include.
 */
export function formatDecisions(
  decisions: BeliefDecision[],
  max: number,
): string {
  if (decisions.length === 0) return "";
  const visible = decisions.slice(0, max);
  const lines = visible.map((d) => `  - ${d.content}`);
  return `Decisions:\n${lines.join("\n")}`;
}

/**
 * Format beliefs section with a minimum confidence filter.
 *
 * Returns empty string when no facts meet the confidence threshold.
 *
 * @param facts         - Belief facts to display.
 * @param max           - Maximum number of items to include.
 * @param minConfidence - Minimum confidence threshold (0–1).
 */
export function formatBeliefs(
  facts: BeliefFact[],
  max: number,
  minConfidence: number,
): string {
  const filtered = facts.filter((f) => f.confidence >= minConfidence);
  if (filtered.length === 0) return "";
  const visible = filtered.slice(0, max);
  const lines = visible.map((f) => `  - [${f.confidence}] ${f.content}`);
  return `Beliefs (≥${minConfidence}):\n${lines.join("\n")}`;
}

/**
 * Format hypotheses section.
 *
 * Returns empty string when hypotheses array is empty.
 *
 * @param hypotheses - Hypotheses to display, limited to `max` items.
 * @param max        - Maximum number of items to include.
 */
export function formatHypotheses(
  hypotheses: Hypothesis[],
  max: number,
): string {
  if (hypotheses.length === 0) return "";
  const visible = hypotheses.slice(0, max);
  const lines = visible.map((h) => `  - [${h.status}] ${h.content}`);
  return `Hypotheses:\n${lines.join("\n")}`;
}

/**
 * Format learning section.
 *
 * Returns empty string when entries array is empty.
 *
 * @param entries - Learning entries to display, limited to `max` items.
 * @param max     - Maximum number of items to include.
 */
export function formatLearning(
  entries: LearningEntry[],
  max: number,
): string {
  if (entries.length === 0) return "";
  const visible = entries.slice(0, max);
  const lines = visible.map((e) => `  - ${e.description}`);
  return `Learning:\n${lines.join("\n")}`;
}

/**
 * Format graph evidence section with total count.
 *
 * Returns empty string when findings array is empty.
 *
 * @param findings - Graph findings to display, limited to `max` items.
 * @param max      - Maximum number of items to include.
 */
export function formatGraphEvidence(
  findings: GraphFinding[],
  max: number,
): string {
  if (findings.length === 0) return "";
  const visible = findings.slice(0, max);
  const lines = visible.map(
    (f) => `  - ${f.query}: ${f.nodes.length} nodes`,
  );
  return `Graph evidence (${findings.length}):\n${lines.join("\n")}`;
}
