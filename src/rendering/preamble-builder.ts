import type {
  CapabilityLevel,
  LearningEntry,
  NoesisState,
  StaleReviewNote,
} from "../schema.js";
import { estimateTokens } from "../shared/tokens.js";
import { stripTransientState } from "./state-cleanup.js";

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&apos;");
}

import {
  formatBeliefsSection,
  formatDecisionsSection,
  formatGraphSection,
  formatHypothesesSection,
  formatLearningSection,
  formatWorkSection,
} from "./section-formatters.js";

const MAX_TOKENS = 2000;

interface PreambleOpts {
  capability: CapabilityLevel;
  learningRanked: LearningEntry[];
  staleNotes: StaleReviewNote[];
  projectName: string;
  vaultLabel?: string;
  contextUsage?: number;
  communities?: string[];
  godNodes?: string[];
  consistencyWarnings?: string[];
}

export function buildPreamble(state: NoesisState, opts: PreambleOpts): string {
  const activeFacts = state.belief.facts.filter((fact) => fact.status === "active");
  const lowConfFacts = activeFacts.filter((fact) => fact.confidence < 0.75 && fact.confidence >= 0.5);
  const resolvedLearning = state.learning.failures.filter((entry) => entry.rootCause && entry.fix).length;
  const findings = state.attention.graphFindings ?? [];
  const sections: string[] = [
    `[Noesis] Graphify: ${opts.capability} | Project: ${opts.projectName} | ` +
      `Beliefs: ${activeFacts.length} active, ${lowConfFacts.length} low-conf | ` +
      `Learning: ${state.learning.failures.length} failures (${resolvedLearning} resolved)`,
  ];

  pushIf(sections, formatWorkSection(state.commitment.workflow.goal, state.commitment.workflow.steps));
  pushIf(sections, formatDecisionsSection(state.belief.decisions, true));
  pushIf(sections, formatBeliefsSection(activeFacts, true));
  pushIf(sections, formatGraphSection(findings));
  pushIf(sections, formatHypothesesSection(state.inference.hypotheses, true));
  pushIf(sections, formatLearningSection(opts.learningRanked, true));

  const notes = [
    ...opts.staleNotes.map((note) => `⚠ ${note.message}`),
    ...(opts.consistencyWarnings ?? []).map((warning) => `⚠ ${warning}`),
  ];
  pushIf(sections, notes.length > 0 ? `[Notes]\n${notes.join("\n")}` : undefined);

  const preamble = escapeXml(sections.join("\n\n"));
  return estimateTokens(preamble) <= MAX_TOKENS ? preamble : trimToBudget(preamble, state);
}

function pushIf(target: string[], value: string | undefined): void {
  if (value) target.push(value);
}

function trimToBudget(preamble: string, state: NoesisState): string {
  let result = preamble;
  const maxChars = MAX_TOKENS * 4;

  if (estimateTokens(result) > MAX_TOKENS) {
    const beliefsSection = formatBeliefsSection(state.belief.facts, true);
    if (beliefsSection) result = result.replace(/\[Beliefs\][\s\S]*?(?=\n\n\[|\n*$)/, escapeXml(beliefsSection));
  }

  if (estimateTokens(result) > MAX_TOKENS) result = result.replace(/\[Learning\][\s\S]*?(?=\n\n\[|\n*$)/, "");
  if (estimateTokens(result) > MAX_TOKENS) result = result.replace(/\[Hypotheses\][\s\S]*?(?=\n\n\[|\n*$)/, "");

  return result.length > maxChars ? `${result.slice(0, maxChars - 3)}...` : result;
}

export function buildSubagentPreamble(state: NoesisState, _taskFilter?: string): string {
  const allLearning = [...state.learning.failures, ...state.learning.successes];
  const learningTop = allLearning.slice(0, 3);
  return buildPreamble(state, {
    capability: "FULL",
    learningRanked: learningTop,
    staleNotes: [],
    projectName: "",
  });
}
