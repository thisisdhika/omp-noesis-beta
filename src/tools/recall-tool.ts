"use strict";

/**
 * omp-noesis: Recall Tool
 * Version: 0.1.0
 *
 * "noesis_recall" — query the current cognitive state.
 * Uses a flat object schema with runtime validation for cross-provider
 * (including DeepSeek) compatibility.
 *   - active_beliefs: facts above a confidence threshold
 *   - active_decisions: recorded decisions
 *   - unresolved_hypotheses: hypotheses not yet confirmed/refuted
 *   - relevant_learning: top-ranked learning entries
 *   - current_workflow: active workflow state
 *   - full_state_digest: comprehensive state summary
 *   - search: keyword search across all state layers
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import {
  getActiveFacts,
  getActiveDecisions,
} from "../domains/belief/belief-domain.js";
import {
  getRankedLearning,
  getFailures,
} from "../domains/learning/learning-domain.js";

export function registerRecallTool(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.registerTool({
    name: "noesis_recall",
    label: "Noesis: Recall",
    description:
  "Read cognitive state. Call BEFORE assuming you don't know something. " +
  "Query beliefs, decisions, hypotheses, learning, or search by keyword. " +
  "Do NOT call to store information — use noesis_believe.",
    parameters: pi.zod.object({
      query: pi.zod.enum([
        "active_beliefs",
        "active_decisions",
        "unresolved_hypotheses",
        "relevant_learning",
        "current_workflow",
        "full_state_digest",
        "search",
      ]),
      tagFilter: pi.zod.array(pi.zod.string()).optional(),
      minConfidence: pi.zod.number().min(0).max(1).default(0.75),
      skillScope: pi.zod.string().optional(),
      limit: pi.zod.number().min(1).max(20).optional(),
      includeCompleted: pi.zod.boolean().default(false),
      includeSuperseded: pi.zod.boolean().default(false),
      includeArchived: pi.zod.boolean().default(false),
      keyword: pi.zod.string().min(1).max(200).optional(),
      layers: pi.zod.array(
        pi.zod.enum(["belief", "learning", "inference", "commitment", "attention"]),
      ).optional(),
    }).refine((data) => {
      if (data.query === "search") {
        return typeof data.keyword === "string" && data.keyword.length > 0;
      }
      return true;
    }, { message: "Keyword is required for search query" }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const state = runtime.stateManager.read();

      if (params.query === "active_beliefs") {
        const minConfidence = params.minConfidence;
        const tagFilter = params.tagFilter;
        const facts = getActiveFacts(state, minConfidence, tagFilter);
        const lines = facts.map(
          (f) => `  [${f.id}] ${f.content} (confidence: ${f.confidence}, source: ${f.source})`,
        );

        return {
          content: [
            {
              type: "text",
              text:
                `Active beliefs (min confidence: ${minConfidence}):\n` +
                (lines.length > 0 ? lines.join("\n") : "  (none)"),
            },
          ],
          details: {
            query: "active_beliefs",
            count: facts.length,
            facts: facts.map((f) => ({ id: f.id, content: f.content, confidence: f.confidence, source: f.source })),
          },
          isError: false,
        };
      }

      if (params.query === "active_decisions") {
        const tagFilter = params.tagFilter;
        const decisions = getActiveDecisions(state, tagFilter);
        const lines = decisions.map(
          (d) =>
            `  [${d.id}] ${d.content}\n    rationale: ${d.rationale}` +
            (d.alternatives !== undefined && d.alternatives.length > 0
              ? `\n    alternatives: ${d.alternatives.join(", ")}`
              : ""),
        );

        return {
          content: [
            {
              type: "text",
              text:
                `Active decisions:\n` +
                (lines.length > 0 ? lines.join("\n") : "  (none)"),
            },
          ],
          details: {
            query: "active_decisions",
            count: decisions.length,
            decisions: decisions.map((d) => ({ id: d.id, content: d.content, rationale: d.rationale })),
          },
          isError: false,
        };
      }

      if (params.query === "unresolved_hypotheses") {
        const tagFilter = params.tagFilter;
        const hypotheses = state.inference.hypotheses.filter((h) => {
          if (h.status !== "testing") return false;
          if (tagFilter !== undefined && tagFilter.length > 0) {
            return tagFilter.some((t: string) => h.tags?.includes(t) ?? false);
          }
          return true;
        });

        const lines = hypotheses.map(
          (h) =>
            `  [${h.id}] ${h.content}\n    status: ${h.status}` +
            (h.evidence ? `\n    evidence: ${h.evidence}` : ""),
        );

        return {
          content: [
            {
              type: "text",
              text:
                `Unresolved hypotheses:\n` +
                (lines.length > 0 ? lines.join("\n") : "  (none)"),
            },
          ],
          details: {
            query: "unresolved_hypotheses",
            count: hypotheses.length,
            hypotheses: hypotheses.map((h) => ({
              id: h.id,
              content: h.content,
              status: h.status,
              evidence: h.evidence ?? null,
            })),
          },
          isError: false,
        };
      }

      if (params.query === "relevant_learning") {
        const skillScope = params.skillScope;
        const limit = params.limit ?? 3;
        const entries = getRankedLearning(state, limit, skillScope);
        const failures = getFailures(state);

        const entryLines = entries.map(
          (e) =>
            `  [${e.id}] ${e.description} (status: ${e.status})` +
            (e.skillScope ? ` [skill: ${e.skillScope}]` : "") +
            (e.rootCause ? `\n    root cause: ${e.rootCause}` : "") +
            (e.fix ? `\n    fix: ${e.fix}` : ""),
        );

        const failureLines = failures.map(
          (f) => `  [${f.id}] ${f.description} (status: ${f.status})`,
        );

        return {
          content: [
            {
              type: "text",
              text:
                `Relevant learning (top ${limit}):\n` +
                (entryLines.length > 0 ? entryLines.join("\n") : "  (none)") +
                `\n\nUnresolved failures (${failures.length}):\n` +
                (failureLines.length > 0 ? failureLines.join("\n") : "  (none)"),
            },
          ],
          details: {
            query: "relevant_learning",
            topCount: entries.length,
            unresolvedCount: failures.length,
            entries: entries.map((e) => ({ id: e.id, description: e.description, status: e.status })),
            failures: failures.map((f) => ({ id: f.id, description: f.description, status: f.status })),
          },
          isError: false,
        };
      }

      if (params.query === "current_workflow") {
        const includeCompleted = params.includeCompleted;
        const workflow = state.commitment.workflow;

        if (workflow === undefined) {
          return {
            content: [{ type: "text", text: "No active workflow." }],
            details: { query: "current_workflow", hasWorkflow: false },
            isError: false,
          };
        }

        const steps = includeCompleted
          ? workflow.steps
          : workflow.steps.filter((s) => s.status !== "done");

        const stepLines = steps.map(
          (s) =>
            `  [${s.id}] ${s.description} (status: ${s.status})` +
            (s.dependsOn !== undefined && s.dependsOn.length > 0
              ? ` depends on: ${s.dependsOn.join(", ")}`
              : "") +
            (s.verification ? `\n    verify: ${s.verification}` : ""),
        );

        return {
          content: [
            {
              type: "text",
              text:
                `Workflow: ${workflow.id}\nGoal: ${workflow.goal}\nStatus: ${workflow.status}\n` +
                (stepLines.length > 0
                  ? `Steps${includeCompleted ? "" : " (incomplete)"}:\n${stepLines.join("\n")}`
                  : "  (no steps)"),
            },
          ],
          details: {
            query: "current_workflow",
            id: workflow.id,
            goal: workflow.goal,
            status: workflow.status,
            stepCount: workflow.steps.length,
            incompleteCount: workflow.steps.filter((s) => s.status !== "done").length,
          },
          isError: false,
        };
      }

      if (params.query === "full_state_digest") {
        const includeSuperseded = params.includeSuperseded;
        const includeArchived = params.includeArchived;

        const activeFacts = getActiveFacts(state);
        const activeDecisions = getActiveDecisions(state);
        const unresolvedH = state.inference.hypotheses.filter((h) => h.status === "testing");
        const activeWorkflow = state.commitment.workflow;
        const actions = state.commitment.actions;
        const learningEntries = getRankedLearning(state, 5);

        const lines: string[] = [];
        lines.push(`=== Noesis State Digest ===`);
        lines.push(`Version: ${state.version}`);
        lines.push(`Last persisted: ${state.lastPersisted}`);
        lines.push(``);
        lines.push(`--- Attention ---`);
        lines.push(`Focus: ${state.attention.focus}`);
        lines.push(`Priority: ${state.attention.priority}`);
        lines.push(`Files: ${state.attention.files.length}`);
        lines.push(`Graph queries: ${state.attention.graphQueries.length}`);
        lines.push(`Graph findings: ${state.attention.graphFindings.length}`);
        lines.push(``);
        lines.push(`--- Belief ---`);
        lines.push(`Active facts: ${activeFacts.length}`);
        lines.push(`Active decisions: ${activeDecisions.length}`);
        lines.push(``);
        lines.push(`--- Inference ---`);
        lines.push(`Total hypotheses: ${state.inference.hypotheses.length}`);
        lines.push(`Unresolved: ${unresolvedH.length}`);
        lines.push(`Reasoning steps: ${state.inference.reasoning.length}`);
        lines.push(``);
        lines.push(`--- Commitment ---`);
        lines.push(`Workflow: ${activeWorkflow !== undefined ? `${activeWorkflow.status} — ${activeWorkflow.goal}` : "(none)"}`);
        lines.push(`Pending actions: ${actions.length}`);
        lines.push(``);
        lines.push(`--- Learning ---`);
        lines.push(`Successes: ${state.learning.successes.length}`);
        lines.push(`Failures: ${state.learning.failures.length}`);
        lines.push(`Resolved: ${state.learning.summary.resolvedCount}`);
        lines.push(``);
        lines.push(`--- Key Items ---`);
        if (activeFacts.length > 0) {
          lines.push(`Top facts:`);
          for (const f of activeFacts.slice(0, 3)) {
            lines.push(`  [${f.id}] ${f.content.slice(0, 120)}`);
          }
        }
        if (unresolvedH.length > 0) {
          lines.push(`Top hypotheses:`);
          for (const h of unresolvedH.slice(0, 3)) {
            lines.push(`  [${h.id}] ${h.content.slice(0, 120)}`);
          }
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: {
            query: "full_state_digest",
            version: state.version,
            focus: state.attention.focus,
            activeFactCount: activeFacts.length,
            activeDecisionCount: activeDecisions.length,
            unresolvedHypothesisCount: unresolvedH.length,
            hasWorkflow: activeWorkflow !== undefined,
            pendingActionCount: actions.length,
            learningSummary: state.learning.summary,
          },
          isError: false,
        };
      }

      // query === "search"
      if (!params.keyword) {
        return {
          isError: true,
          content: [{ type: "text", text: "Missing required field: keyword" }],
          details: { error: "missing_fields", query: "search" },
        };
      }
      const keyword = params.keyword;
      const limit = params.limit ?? 10;
      const lowerKeyword = keyword.toLowerCase();

      const matchingFacts = state.belief.facts.filter(
        (f) =>
          f.content.toLowerCase().includes(lowerKeyword) ||
          (f.evidence !== undefined && f.evidence.toLowerCase().includes(lowerKeyword)),
      );

      const matchingDecisions = state.belief.decisions.filter(
        (d) =>
          d.content.toLowerCase().includes(lowerKeyword) ||
          d.rationale.toLowerCase().includes(lowerKeyword) ||
          (d.alternatives !== undefined && d.alternatives.some((a) => a.toLowerCase().includes(lowerKeyword))),
      );

      const matchingHypotheses = state.inference.hypotheses.filter(
        (h) =>
          h.content.toLowerCase().includes(lowerKeyword) ||
          (h.evidence !== undefined && h.evidence.toLowerCase().includes(lowerKeyword)),
      );

      const matchingLearning = [
        ...state.learning.successes,
        ...state.learning.failures,
      ].filter(
        (e) =>
          e.description.toLowerCase().includes(lowerKeyword) ||
          (e.rootCause !== undefined && e.rootCause.toLowerCase().includes(lowerKeyword)) ||
          (e.fix !== undefined && e.fix.toLowerCase().includes(lowerKeyword)),
      );

      const allResults = [
        ...matchingFacts.map((f) => ({ kind: "fact" as const, id: f.id, snippet: f.content.slice(0, 200) })),
        ...matchingDecisions.map((d) => ({ kind: "decision" as const, id: d.id, snippet: d.content.slice(0, 200) })),
        ...matchingHypotheses.map((h) => ({ kind: "hypothesis" as const, id: h.id, snippet: h.content.slice(0, 200) })),
        ...matchingLearning.map((e) => ({ kind: "learning" as const, id: e.id, snippet: e.description.slice(0, 200) })),
      ].slice(0, limit);

      const resultLines = allResults.map(
        (r) => `  [${r.kind}] ${r.id}: ${r.snippet}`,
      );

      return {
        content: [
          {
            type: "text",
            text:
              `Search results for "${keyword}" (${allResults.length} found):\n` +
              (resultLines.length > 0 ? resultLines.join("\n") : "  (no matches)"),
          },
        ],
        details: {
          query: "search",
          keyword,
          totalMatches: allResults.length,
          results: allResults,
        },
        isError: false,
      };
    },
  });
}
