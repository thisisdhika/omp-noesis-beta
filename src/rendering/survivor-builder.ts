import type { LearningEntry, NoesisState } from "../schema.js";
import { truncate } from "../shared/text.js";
import { rankLearning } from "../domains/learning/ranking-strategy.js";
import { getActiveFacts } from "../domains/belief/belief-domain.js";
import { getUnresolvedHypotheses } from "../domains/inference/inference-domain.js";
import {
  formatBeliefsSection,
  formatDecisionsSection,
  formatHypothesesSection,
  formatLearningSection,
  formatWorkSection,
} from "./section-formatters.js";
import { stripTransientState } from "./state-cleanup.js";

interface SurvivorResult {
  contextLines: string[];
  preserveData: { noesis: NoesisState };
}

export function buildSurvivors(state: NoesisState): SurvivorResult {
  const lines: string[] = [];

  lines.push(`[Focus] ${truncate(state.attention.focus || "No active focus", 200)}`);
  pushIf(lines, formatWorkSection(state.commitment.workflow.goal, state.commitment.workflow.steps));
  pushLines(lines, formatDecisionsSection(state.belief.decisions, false));
  pushLines(lines, formatBeliefsSection(getActiveFacts(state, 0.75), false));
  pushLines(lines, formatHypothesesSection(getUnresolvedHypotheses(state, 3), false));

  const allLearning: LearningEntry[] = [...state.learning.failures, ...state.learning.successes];
  pushLines(lines, formatLearningSection(rankLearning(allLearning).slice(0, 3), false));

  const summary = state.learning.summary;
  lines.push(`Learning summary: ${summary.successCount} successes, ${summary.failureCount} failures (${summary.resolvedCount} resolved)`);
  lines.push("State: .omp/noesis/state.json");

  return { contextLines: lines, preserveData: { noesis: stripTransientState(state) } };
}

function pushIf(target: string[], value: string | undefined): void {
  if (value) target.push(value);
}

function pushLines(target: string[], section: string | undefined): void {
  if (!section) return;
  target.push(section);
}
