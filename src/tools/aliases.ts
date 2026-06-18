"use strict";

/**
 * omp-noesis: PA-Tool Aliases
 *
 * Thin registration file — all schema definitions and execute logic live in the
 * 7 canonical tool files.  Each alias registration simply delegates to the
 * corresponding canonical tool's build*Params and execute* exports.
 *
 * Alias table:
 *   focus_task        → noesis_attend
 *   switch_focus      → noesis_focus
 *   store_memory      → noesis_believe_fact
 *   store_decision    → noesis_believe_decision
 *   store_learning    → noesis_believe_learning
 *   test_hypothesis   → noesis_infer
 *   track_workflow    → noesis_commit
 *   read_memory       → noesis_recall
 *   search_archives   → noesis_vault_search
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";

import { buildAttendParams, executeAttend } from "./attend-tool.js";
import { buildFocusParams, executeFocus } from "./focus-tool.js";
import { buildBelieveFactParams, executeBelieveFact } from "./believe-tool.js";
import { buildBelieveDecisionParams, executeBelieveDecision } from "./believe-tool.js";
import { buildBelieveLearningParams, executeBelieveLearning } from "./believe-tool.js";
import { buildCommitParams, executeCommit } from "./commit-tool.js";
import { buildInferParams, executeInfer } from "./infer-tool.js";
import { buildRecallParams, executeRecall } from "./recall-tool.js";
import { buildVaultSearchParams, executeVaultSearch } from "./vault-search-tool.js";

export function registerToolAliases(pi: ExtensionAPI, runtime: NoesisRuntime): void {

  // ── focus_task ── alias of noesis_attend ──────────────────────────────────
  pi.registerTool({
    name: "focus_task",
    label: "Noesis: Focus Task",
    description: "Alias for noesis_attend. Set current task focus at task start.",
    parameters: buildAttendParams(pi),
    async execute(_tCID, params, _signal, _onUpdate, _ctx) {
      return executeAttend(runtime, params);
    },
  });

  // ── switch_focus ── alias of noesis_focus ─────────────────────────────────
  pi.registerTool({
    name: "switch_focus",
    label: "Noesis: Switch Focus",
    description: "Alias for noesis_focus. Quick mid-task focus update.",
    parameters: buildFocusParams(pi),
    async execute(_tCID, params, _signal, _onUpdate, _ctx) {
      return executeFocus(runtime, params);
    },
  });

  // ── store_memory ── alias of noesis_believe_fact ──────────────────────────
  pi.registerTool({
    name: "store_memory",
    label: "Noesis: Store Memory",
    description: "Alias for noesis_believe_fact. Store a verified fact. For storing decisions, use store_decision. For storing learnings, use store_learning.",
    parameters: buildBelieveFactParams(pi),
    async execute(_tCID, params, _signal, _onUpdate, _ctx) {
      return executeBelieveFact(runtime, params);
    },
  });

  // ── store_decision ── alias of noesis_believe_decision ────────────────────
  pi.registerTool({
    name: "store_decision",
    label: "Noesis: Store Decision",
    description: "Alias for noesis_believe_decision. Store a design decision with rationale.",
    parameters: buildBelieveDecisionParams(pi),
    async execute(_tCID, params, _signal, _onUpdate, _ctx) {
      return executeBelieveDecision(runtime, params);
    },
  });

  // ── store_learning ── alias of noesis_believe_learning ────────────────────
  pi.registerTool({
    name: "store_learning",
    label: "Noesis: Store Learning",
    description: "Alias for noesis_believe_learning. Record a failure, root cause, and fix.",
    parameters: buildBelieveLearningParams(pi),
    async execute(_tCID, params, _signal, _onUpdate, _ctx) {
      return executeBelieveLearning(runtime, params);
    },
  });

  // ── test_hypothesis ── alias of noesis_infer ──────────────────────────────
  pi.registerTool({
    name: "test_hypothesis",
    label: "Noesis: Test Hypothesis",
    description: "Alias for noesis_infer. Manage hypotheses and reasoning.",
    parameters: buildInferParams(pi),
    async execute(_tCID, params, _signal, _onUpdate, _ctx) {
      return executeInfer(runtime, params);
    },
  });

  // ── track_workflow ── alias of noesis_commit ──────────────────────────────
  pi.registerTool({
    name: "track_workflow",
    label: "Noesis: Track Workflow",
    description: "Alias for noesis_commit. Track multi-step workflows.",
    parameters: buildCommitParams(pi),
    async execute(_tCID, params, _signal, _onUpdate, _ctx) {
      return executeCommit(runtime, params);
    },
  });

  // ── read_memory ── alias of noesis_recall ─────────────────────────────────
  pi.registerTool({
    name: "read_memory",
    label: "Noesis: Read Memory",
    description: "Alias for noesis_recall. Query beliefs, decisions, hypotheses, learning, or search by keyword.",
    parameters: buildRecallParams(pi),
    async execute(_tCID, params, _signal, _onUpdate, _ctx) {
      return executeRecall(runtime, params);
    },
  });

  // ── search_archives ── alias of noesis_vault_search ───────────────────────
  pi.registerTool({
    name: "search_archives",
    label: "Noesis: Search Archives",
    description: "Alias for noesis_vault_search. Search persistent vault for stored artifacts.",
    parameters: buildVaultSearchParams(pi),
    async execute(_tCID, params, _signal, _onUpdate, _ctx) {
      return executeVaultSearch(runtime, params);
    },
  });
}
