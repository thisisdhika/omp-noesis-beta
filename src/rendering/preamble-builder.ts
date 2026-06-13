import type {
  NoesisState,
  CapabilityLevel,
  LearningEntry,
  StaleReviewNote,
} from "../schema.js";
import { estimateTokens } from "../shared/tokens.js";
import { truncate } from "../shared/text.js";

const MAX_TOKENS = 2000;

interface PreambleOpts {
  capability: CapabilityLevel;
  learningRanked: LearningEntry[];
  staleNotes: StaleReviewNote[];
  projectName: string;
  consistencyWarnings?: string[];
}

export function buildPreamble(state: NoesisState, opts: PreambleOpts): string {
  const sections: string[] = [];

  // 1. [Noesis] capability block (≤100 tokens)
  const activeFacts = state.belief.facts.filter(f => f.status === "active");
  const lowConfFacts = activeFacts.filter(f => f.confidence < 0.75 && f.confidence >= 0.5);
  const resolvedLearning = state.learning.failures.filter(f => f.rootCause && f.fix).length;
  sections.push(
    `[Noesis] Graphify: ${opts.capability} | Project: ${opts.projectName} | ` +
    `Beliefs: ${activeFacts.length} active, ${lowConfFacts.length} low-conf | ` +
    `Learning: ${state.learning.failures.length} failures (${resolvedLearning} resolved)`
  );

  // 2. [Work] — workflow goal + current step + 1 next step
  const wf = state.commitment.workflow;
  if (wf.goal || wf.steps.length > 0) {
    const currentStep = wf.steps.find(s => s.status === "active") ?? wf.steps.find(s => s.status === "pending");
    const nextStep = currentStep ? wf.steps[wf.steps.indexOf(currentStep) + 1] : undefined;
    let workSection = `[Work] ${wf.goal || "(no goal)"}`;
    if (currentStep) workSection += ` | Step: ${truncate(currentStep.description, 100)}`;
    if (nextStep) workSection += ` | Next: ${truncate(nextStep.description, 100)}`;
    sections.push(workSection);
  }

  // 3. [Decisions] — max 5 active, never truncated
  const activeDecisions = state.belief.decisions
    .filter(d => d.status === "active")
    .slice(0, 5);
  if (activeDecisions.length > 0) {
    const lines = activeDecisions.map(d => `- ${truncate(d.content, 100)} (rationale: ${truncate(d.rationale, 80)})`);
    sections.push(`[Decisions]\n${lines.join("\n")}`);
  }

  // 4. [Beliefs] — max 10, confidence ≥ 0.75, status active
  const eligibleFacts = activeFacts
    .filter(f => f.confidence >= 0.75)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10);
  if (eligibleFacts.length > 0) {
    const lines = eligibleFacts.map(f => `[${f.confidence}] ${truncate(f.content, 100)} (src: ${f.source})`);
    sections.push(`[Beliefs]\n${lines.join("\n")}`);
  }

  // 5. [Graph] — from state.attention.graphFindings
  const findings = (state.attention as Record<string, unknown>).graphFindings;
  if (Array.isArray(findings) && findings.length > 0) {
    const lines = findings.slice(0, 5).map((f: { nodeName: string; rawSnippet: string }) => `- ${f.nodeName}: ${truncate(f.rawSnippet, 120)}`);
    sections.push(`[Graph]\n${lines.join("\n")}`);
  }

  // 6. [Hypotheses] — max 3 unresolved
  const unresolved = state.inference.hypotheses
    .filter(h => h.status === "testing")
    .slice(0, 3);
  if (unresolved.length > 0) {
    const lines = unresolved.map(h => `- ${truncate(h.content, 100)} [testing]`);
    sections.push(`[Hypotheses]\n${lines.join("\n")}`);
  }

  // 7. [Learning] — top 3 ranked
  const topLearning = opts.learningRanked.slice(0, 3);
  if (topLearning.length > 0) {
    const lines = topLearning.map(l => {
      const isFailure = l.rootCause !== undefined;
      const tag = isFailure ? "FAIL" : "PASS";
      const fixPart = l.fix ? ` — fix: ${truncate(l.fix, 80)}` : "";
      return `[${tag}] ${truncate(l.description, 100)}${fixPart}`;
    });
    sections.push(`[Learning]\n${lines.join("\n")}`);
  }

  // 8. [Notes] — stale review + consistency warnings
  const notes: string[] = [];
  for (const note of opts.staleNotes) {
    notes.push(`⚠ ${note.message}`);
  }
  if (opts.consistencyWarnings) {
    for (const w of opts.consistencyWarnings) {
      notes.push(`⚠ ${w}`);
    }
  }
  if (notes.length > 0) {
    sections.push(`[Notes]\n${notes.join("\n")}`);
  }

  // Join and enforce token budget
  const preamble = sections.join("\n\n");
  if (estimateTokens(preamble) <= MAX_TOKENS) {
    return preamble;
  }

  return trimToBudget(preamble, sections, state);
}

function trimToBudget(preamble: string, sections: string[], state: NoesisState): string {
  // Trim order: low-confidence beliefs → older learning → resolved hypotheses → belief descriptions
  // Never trim: [Work], [Decisions], [Hypotheses]
  let result = preamble;
  const maxChars = MAX_TOKENS * 4; // approximate char limit

  // Phase 1: Remove low-confidence facts from [Beliefs] section
  if (estimateTokens(result) > MAX_TOKENS) {
    const activeFacts = state.belief.facts.filter(f => f.status === "active" && f.confidence >= 0.75);
    if (activeFacts.length > 0) {
      const beliefLines = activeFacts.slice(0, 10).map(f => `[${f.confidence}] ${truncate(f.content, 100)} (src: ${f.source})`);
      const beliefsSection = `[Beliefs]\n${beliefLines.join("\n")}`;
      result = result.replace(/\[Beliefs\][\s\S]*?(?=\n\n\[|\n*$)/, beliefsSection);
    }
  }

  // Phase 2: Remove older learning entries
  if (estimateTokens(result) > MAX_TOKENS) {
    result = result.replace(/\[Learning\][\s\S]*?(?=\n\n\[|\n*$)/, "");
  }

  // Phase 3: Remove resolved hypotheses
  if (estimateTokens(result) > MAX_TOKENS) {
    result = result.replace(/\[Hypotheses\][\s\S]*?(?=\n\n\[|\n*$)/, "");
  }

  // Phase 4: Hard truncate at maxChars
  if (result.length > maxChars) {
    result = result.slice(0, maxChars - 3) + "...";
  }

  return result;
}
