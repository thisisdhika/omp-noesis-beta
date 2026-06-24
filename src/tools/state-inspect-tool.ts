"use strict";

/**
 * omp-noesis: State Inspect Tool
 * Version: 1.0.0
 *
 * "noesis_state_inspect" — query the current cognitive state.
 * Uses a flat object schema with runtime validation for cross-provider
 * (including DeepSeek) compatibility.
 *   - active_beliefs: facts above a confidence threshold
 *   - active_decisions: recorded decisions
 *   - unresolved_hypotheses: hypotheses not yet confirmed/refuted
 *   - relevant_learning: top-ranked learning entries
 *   - current_workflow: active workflow state
 *   - full_state_digest: comprehensive state summary
 *   - token_profile: token usage statistics across sessions
 *   - compaction_loss: last compaction loss report
 *   - compaction_history: historical compaction loss records
 *   - provenance: fact/decision provenance trace
 *   - search: keyword search across all state layers
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { AgentToolResult } from "@oh-my-pi/pi-agent-core";
import type { NoesisRuntime } from "../runtime.js";
import {
  getActiveFacts,
  getActiveDecisions,
} from "../domains/belief/belief-domain.js";
import {
  getRankedLearning,
  getFailures,
} from "../domains/learning/learning-domain.js";
import { resolveProvenance } from "../application/use-cases/resolve-provenance.js";
import { estimateTokens } from "../shared/tokens.js";


// ============================================================
// Extracted params builder
// ============================================================
export function buildRecallParams(pi: ExtensionAPI) {
  return pi.zod.object({
    query: pi.zod.enum([
      "active_beliefs",
      "active_decisions",
      "unresolved_hypotheses",
      "relevant_learning",
      "current_workflow",
      "full_state_digest",
      "attention",
      "token_profile",
      "compaction_loss",
      "compaction_history",
      "provenance",
      "search",
    ]),
    tagFilter: pi.zod.array(pi.zod.string()).optional(),
    minConfidence: pi.zod.number().min(0).max(1).default(0.75),
    skillScope: pi.zod.string().optional(),
    limit: pi.zod.number().min(1).max(20).optional(),
    includeCompleted: pi.zod.boolean().default(false),
    includeSuperseded: pi.zod.boolean().default(false),
    includeArchived: pi.zod.boolean().default(false),
    keyword: pi.zod.string().optional(),
    layers: pi.zod.array(
      pi.zod.enum(["belief", "learning", "inference", "commitment", "attention"]),
    ).optional(),
  }).refine((data) => {
    if (data.query === "search") {
      return typeof data.keyword === "string" && data.keyword.length > 0;
    }
    return true;
  }, {
    message: "Validation feedback: keyword is required when query is 'search'.",
    params: {
      suggestions: {
      search: "Required: keyword. Optional: tagFilter, minConfidence, skillScope, limit, layers."
      }
    }
  });
}

// ============================================================
// Extracted execute handler
// ============================================================
export async function executeRecall(
  runtime: NoesisRuntime,
  params: {
    query: "active_beliefs" | "active_decisions" | "unresolved_hypotheses" | "relevant_learning" | "current_workflow" | "full_state_digest" | "attention" | "token_profile" | "compaction_loss" | "compaction_history" | "provenance" | "search";
    tagFilter?: string[];
    minConfidence: number;
    skillScope?: string;
    limit?: number;
    includeCompleted: boolean;
    includeSuperseded: boolean;
    includeArchived: boolean;
    keyword?: string;
    layers?: ("belief" | "learning" | "inference" | "commitment" | "attention")[];
  },
): Promise<AgentToolResult<Record<string, unknown>>> {
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

  if (params.query === "compaction_loss") {
    const history = state.compactionHistory ?? [];
    const last = history.length > 0 ? history[0] : null;

    if (!last) {
      return {
        content: [{ type: "text", text: "No compaction loss data available." }],
        details: { query: "compaction_loss", hasData: false },
        isError: false,
      };
    }

    const evictedLines = last.evicted.map(
      (e) => `  [${e.id}] ${e.content} (reason: ${e.reason})`,
    );
    const degradedLines = last.degraded.map(
      (d) => `  [${d.id}] ${d.content} (reason: ${d.reason})`,
    );

    return {
      content: [
        {
          type: "text",
          text:
            `Compaction Loss Report (${last.occurredAt}):\n` +
            `Before: ${last.preCounts.facts} facts, ${last.preCounts.decisions} decisions\n` +
            `After:  ${last.postCounts.facts} facts, ${last.postCounts.decisions} decisions\n` +
            `Preserved: ${last.preserved.length}\n` +
            (last.degraded.length > 0
              ? `Degraded (${last.degraded.length}):\n${degradedLines.join("\n")}\n`
              : "Degraded: none\n") +
            (last.evicted.length > 0
              ? `Evicted (${last.evicted.length}):\n${evictedLines.join("\n")}`
              : "Evicted: none"),
        },
      ],
      details: {
        query: "compaction_loss",
        hasData: true,
        occurredAt: last.occurredAt,
        preCounts: last.preCounts,
        postCounts: last.postCounts,
        preservedCount: last.preserved.length,
        degraded: last.degraded,
        evicted: last.evicted,
      },
      isError: false,
    };
  }
  if (params.query === "attention") {
    const attn = state.attention;
    const lines: string[] = [];
    lines.push(`Attention Summary:`);
    lines.push(`  Focus: ${attn.focus}`);
    lines.push(`  Priority: ${attn.priority}`);
    lines.push(`  Files (${attn.files.length}): ${attn.files.length > 0 ? attn.files.join(", ") : "(none)"}`);
    lines.push(`  Graph queries (${attn.graphQueries.length}): ${attn.graphQueries.length > 0 ? attn.graphQueries.join(", ") : "(none)"}`);
    lines.push(`  Graph findings: ${attn.graphFindings.length}`);
    lines.push(`  Pending evidence items: ${attn.pendingEvidence.length}`);
    lines.push(`  Updated: ${attn.updatedAt}`);

    return {
      content: [{ type: "text", text: lines.join("\n") }],
      details: {
        query: "attention",
        focus: attn.focus,
        priority: attn.priority,
        fileCount: attn.files.length,
        graphQueryCount: attn.graphQueries.length,
        graphFindingCount: attn.graphFindings.length,
        pendingEvidenceCount: attn.pendingEvidence.length,
        updatedAt: attn.updatedAt,
      },
      isError: false,
    };
  }

  if (params.query === "token_profile") {
    const sections = [
      { name: "beliefs", content: JSON.stringify(state.belief) },
      { name: "inference", content: JSON.stringify(state.inference) },
      { name: "commitment", content: JSON.stringify(state.commitment) },
      { name: "learning", content: JSON.stringify(state.learning) },
      { name: "attention", content: JSON.stringify(state.attention) },
    ];
    const sectionTokens = sections.map((s) => ({
      name: s.name,
      tokens: estimateTokens(s.content),
    }));
    const totalTokens = sectionTokens.reduce((sum, s) => sum + s.tokens, 0);

    const lineText = sectionTokens.map((s) => `  ${s.name}: ${s.tokens} tokens`);

    return {
      content: [{ type: "text", text: `Token Profile:\n${lineText.join("\n")}\n  Total: ${totalTokens} tokens` }],
      details: {
        query: "token_profile",
        sections: sectionTokens,
        totalTokens,
      },
      isError: false,
    };
  }

  if (params.query === "compaction_history") {
    const history = state.compactionHistory ?? [];
    const lines = history.length > 0
      ? history.map((e, i) =>
          `  [${i}] ${e.occurredAt}: pre={facts:${e.preCounts.facts}, decisions:${e.preCounts.decisions}}, post={facts:${e.postCounts.facts}, decisions:${e.postCounts.decisions}}`,
        )
      : ["  (none)"];

    return {
      content: [{ type: "text", text: `Compaction History (${history.length} entries):\n${lines.join("\n")}` }],
      details: {
        query: "compaction_history",
        count: history.length,
        entries: history.map((e) => ({
          occurredAt: e.occurredAt,
          preCounts: e.preCounts,
          postCounts: e.postCounts,
          preservedCount: e.preserved.length,
          degradedCount: e.degraded.length,
          evictedCount: e.evicted.length,
        })),
      },
      isError: false,
    };
  }
  if (params.query === "provenance") {
    const beliefId = params.keyword;
    const facts = state.belief.facts;
    const decisions = state.belief.decisions;

    if (!beliefId) {
      // Preview mode: show first 3 items with supersession chains + total count
      const allItems = [
        ...facts.map((f) => ({ id: f.id, content: f.content, supersededBy: f.supersededBy, kind: "fact" as const })),
        ...decisions.map((d) => ({ id: d.id, content: d.content, supersededBy: d.supersededBy, kind: "decision" as const })),
      ];
      const withChain = allItems.filter(
        (item) => item.supersededBy || allItems.some((other) => other.supersededBy === item.id),
      );
      const preview = withChain.slice(0, 3).map(
        (item) => `  [${item.kind}] ${item.id}: ${item.content.slice(0, 120)}`,
      );

      return {
        content: [{
          type: "text",
          text: `Provenance Overview: ${allItems.length} total items, ${withChain.length} with supersession chains.\n` +
            (preview.length > 0 ? `Preview (first ${preview.length}):\n${preview.join("\n")}\n` : "") +
            `\nUse keyword (belief ID) to trace a specific chain.`,
        }],
        details: {
          query: "provenance",
          totalItems: allItems.length,
          itemsWithChain: withChain.length,
          preview: withChain.slice(0, 3).map((item) => ({
            id: item.id,
            kind: item.kind,
            content: item.content.slice(0, 120),
          })),
        },
        isError: false,
      };
    }

    const node = resolveProvenance(state, beliefId);
    if (!node) {
      return {
        isError: true,
        content: [{ type: "text", text: `No provenance found for belief ID: ${beliefId}` }],
        details: { error: "not_found", query: "provenance", beliefId },
      };
    }

    const plines: string[] = [];
    plines.push(`Provenance for ${beliefId}:`);
    plines.push(`  Content: ${node.content}`);
    plines.push(`  Source: ${node.source}`);
    plines.push(`  Created: ${node.createdAt}`);
    plines.push(`  Supersedes: ${node.supersedes.length > 0 ? node.supersedes.join(", ") : "(none)"}`);
    plines.push(`  Superseded by: ${node.supersededBy ?? "(none)"}`);
    if (node.evidence) plines.push(`  Evidence: ${node.evidence}`);

    return {
      content: [{ type: "text", text: plines.join("\n") }],
      details: {
        query: "provenance",
        beliefId,
        node,
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
}
export function registerStateInspectTool(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.registerTool({
    name: "noesis_state_inspect",
    label: "Noesis: State Inspect",
    description:
      "Read current (live, in-memory) cognitive state — beliefs, decisions, hypotheses, learning entries, active workflows, attention, token profile, compaction loss/history, provenance chains, and keyword search across all layers (query:\"search\"). " +
      "Call BEFORE assuming you do not know something; check current-session memory first rather than guessing or fabricating. " +
      "Do NOT call to store information — use noesis_believe_fact, noesis_believe_decision. " +
      "Consequence: returns a snapshot of live in-memory state without modifying anything; does NOT search durable cross-session storage. For persistent artifacts stored across sessions consider vault backends. " +
      "Fields: query(required), keyword(required if query=search), tagFilter, minConfidence, skillScope, limit, layers, includeCompleted, includeSuperseded, includeArchived (optional)",
    parameters: buildRecallParams(pi),
    async execute(tCID, params, _signal, _onUpdate, _ctx) {
      return executeRecall(runtime, params);
    },
  });
}
