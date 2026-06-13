import { truncate } from "../shared/text.js";
import type { BeliefFact, BeliefDecision, LearningEntry, WorkflowStep, GraphFinding } from "../schema.js";

export function formatWorkSection(goal: string, steps: WorkflowStep[]): string | undefined {
  if (!goal && steps.length === 0) return undefined;

  const current = steps.find((s) => s.status === "active") ?? steps.find((s) => s.status === "pending");
  const next = current ? steps[steps.indexOf(current) + 1] : undefined;

  let line = `[Work] ${goal || "(no goal)"}`;
  if (current) line += ` | Step: ${truncate(current.description, 100)}`;
  if (next) line += ` | Next: ${truncate(next.description, 100)}`;
  return line;
}

export function formatDecisionsSection(decisions: BeliefDecision[], includeRationale: boolean): string | undefined {
  const active = decisions.filter((d) => d.status === "active").slice(0, 5);
  if (active.length === 0) return undefined;
  const lines = active.map((d) => {
    const base = `- ${truncate(d.content, 100)}`;
    return includeRationale ? `${base} (rationale: ${truncate(d.rationale, 80)})` : base;
  });
  return `[Decisions]\n${lines.join("\n")}`;
}

export function formatBeliefsSection(facts: BeliefFact[], includeSource: boolean): string | undefined {
  const active = facts.filter((f) => f.status === "active" && f.confidence >= 0.75)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10);
  if (active.length === 0) return undefined;
  const lines = active.map((f) => includeSource
    ? `[${f.confidence}] ${truncate(f.content, 100)} (src: ${f.source})`
    : `[${f.confidence}] ${truncate(f.content, 100)}`);
  return `[Beliefs]\n${lines.join("\n")}`;
}

export function formatHypothesesSection(hypotheses: Array<{ status: string; content: string }>, includeStatus: boolean): string | undefined {
  const active = hypotheses.filter((h) => h.status === "testing").slice(0, 3);
  if (active.length === 0) return undefined;
  const lines = active.map((h) => includeStatus ? `- ${truncate(h.content, 100)} [testing]` : `- ${truncate(h.content, 100)}`);
  return `[Hypotheses]\n${lines.join("\n")}`;
}

export function formatLearningSection(entries: LearningEntry[], includeFix: boolean): string | undefined {
  const top = entries.slice(0, 3);
  if (top.length === 0) return undefined;
  const lines = top.map((l) => {
    const tag = l.rootCause !== undefined ? "FAIL" : "PASS";
    const fixPart = includeFix && l.fix ? ` — fix: ${truncate(l.fix, 80)}` : "";
    return `[${tag}] ${truncate(l.description, 100)}${fixPart}`;
  });
  return `[Learning]\n${lines.join("\n")}`;
}

export function formatGraphSection(findings: GraphFinding[]): string | undefined {
  if (findings.length === 0) return undefined;
  const lines = findings.slice(0, 5).map((f) => `- ${f.nodeName}: ${truncate(f.rawSnippet, 120)}`);
  return `[Graph]\n${lines.join("\n")}`;
}
