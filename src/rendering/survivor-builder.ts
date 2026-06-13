import type { NoesisState, LearningEntry } from "../schema.js";
import { truncate } from "../shared/text.js";
import { rankLearning } from "../domains/learning/ranking-strategy.js";
import { getActiveFacts } from "../domains/belief/belief-domain.js";
import { getUnresolvedHypotheses } from "../domains/inference/inference-domain.js";

interface SurvivorResult {
  contextLines: string[];
  preserveData: Record<string, unknown>;
}

export function buildSurvivors(state: NoesisState): SurvivorResult {
  const lines: string[] = [];

  // Focus (2 sentences max)
  const focus = state.attention.focus || "No active focus";
  lines.push(`[Focus] ${truncate(focus, 200)}`);

  // Work: goal + current step + 1 next
  const wf = state.commitment.workflow;
  if (wf.goal || wf.steps.length > 0) {
    const current = wf.steps.find(s => s.status === "active") ?? wf.steps.find(s => s.status === "pending");
    const next = current ? wf.steps[wf.steps.indexOf(current) + 1] : undefined;
    let workLine = `[Work] ${wf.goal || "(no goal)"}`;
    if (current) workLine += ` | Step: ${truncate(current.description, 100)}`;
    if (next) workLine += ` | Next: ${truncate(next.description, 100)}`;
    lines.push(workLine);
  }

  // Active decisions (max 5)
  const activeDecisions = state.belief.decisions
    .filter(d => d.status === "active")
    .slice(0, 5);
  if (activeDecisions.length > 0) {
    lines.push("[Decisions]");
    for (const d of activeDecisions) {
      lines.push(`- ${truncate(d.content, 100)}`);
    }
  }

  // Active beliefs ≥ 0.75 (max 10)
  const eligibleFacts = getActiveFacts(state, 0.75).slice(0, 10);
  if (eligibleFacts.length > 0) {
    lines.push("[Beliefs]");
    for (const f of eligibleFacts) {
      lines.push(`[${f.confidence}] ${truncate(f.content, 100)}`);
    }
  }

  // Unresolved hypotheses (max 3)
  const hypotheses = getUnresolvedHypotheses(state, 3);
  if (hypotheses.length > 0) {
    lines.push("[Hypotheses]");
    for (const h of hypotheses) {
      lines.push(`- ${truncate(h.content, 100)}`);
    }
  }

  // Top-ranked learning (max 3) + summary
  const allLearning: LearningEntry[] = [...state.learning.failures, ...state.learning.successes];
  const ranked = rankLearning(allLearning).slice(0, 3);
  if (ranked.length > 0) {
    lines.push("[Learning]");
    for (const l of ranked) {
      const isFailure = l.rootCause !== undefined;
      lines.push(`- [${isFailure ? "FAIL" : "PASS"}] ${truncate(l.description, 100)}`);
    }
  }
  // Summary counters (always included)
  const s = state.learning.summary;
  lines.push(`Learning summary: ${s.successCount} successes, ${s.failureCount} failures (${s.resolvedCount} resolved)`);

  // State file pointer
  lines.push("State: .omp/noesis/state.json");

  // preserveData: deep clone of state (no graphFindings)
  const stateClone: Record<string, unknown> = JSON.parse(JSON.stringify(state));
  const attn = stateClone.attention as Record<string, unknown> | undefined;
  if (attn) {
    delete attn.graphFindings;
    delete attn.__graphFindings;
  }

  return {
    contextLines: lines,
    preserveData: { noesis: stateClone },
  };
}
