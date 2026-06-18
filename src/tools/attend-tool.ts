"use strict";

/**
 * omp-noesis: Attend Tool
 * Version: 0.1.0
 *
 * "noesis_attend" — set the agent's current focus, file references, and
 * optional graph queries.  When graph queries are provided, each is run
 * through the Graphify CLI and the resulting findings are stored in the
 * attention layer.
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import type { GraphFinding } from "../schema.js";
import {
  setFocus,
  setGraphQueries,
  setFiles,
  storeGraphFindings,
  addPendingEvidence,
} from "../domains/attention/attention-domain.js";
import { query as graphifyQuery } from "../infrastructure/graphify-client.js";

export function buildAttendParams(pi: ExtensionAPI) {
  return pi.zod.object({
    focus: pi.zod.string(),
    files: pi.zod.array(pi.zod.string()).optional(),
    graphQueries: pi.zod.array(pi.zod.string()).optional(),
    priority: pi.zod.enum(["low", "normal", "high", "critical"]).default("normal"),
  });
}

export async function executeAttend(
  runtime: NoesisRuntime,
  params: { focus: string; files?: string[]; graphQueries?: string[]; priority: "low" | "normal" | "high" | "critical" },
) {
  const { focus, priority, files, graphQueries } = params;

  // Run graph queries first (if any) and collect all findings
  let findingsCount = 0;
  const allFindings: GraphFinding[] = [];
  if (graphQueries !== undefined && graphQueries.length > 0) {
    for (const q of graphQueries) {
      const result = await graphifyQuery(runtime.projectRoot, q);
      if (result.error) {
        console.warn(`[noesis_attend] Graph query "${q}" failed: ${result.error}`);
      }
      allFindings.push(...result.findings);
      findingsCount += result.findings.length;
    }
  }

  // Single atomic mutation: focus, files, graph queries, findings, and pending evidence
  await runtime.stateManager.mutate((state) => {
    setFocus(state, focus, priority);
    setFiles(state, files ?? []);
    setGraphQueries(state, graphQueries ?? []);
    if (allFindings.length > 0) {
      storeGraphFindings(state, allFindings);
      addPendingEvidence(state, allFindings, graphQueries?.join(", ") ?? "", Date.now());
    }
  });

  return {
    content: [
      {
        type: "text" as const,
        text: `Focus set to: "${focus}" (priority: ${priority})` +
          (files !== undefined && files.length > 0
            ? `\nFiles referenced: ${files.length}`
            : "") +
          (graphQueries !== undefined && graphQueries.length > 0
            ? `\nGraph queries run: ${graphQueries.length} (${findingsCount} findings)`
            : ""),
      },
    ],
    details: {
      focus,
      priority,
      fileCount: files?.length ?? 0,
      graphQueryCount: graphQueries?.length ?? 0,
      findingsCount,
    },
    isError: false,
  };
}

export function registerAttendTool(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.registerTool({
    name: "noesis_attend",
    label: "Noesis: Attend",
    description:
  "Call at task start or when shifting focus to describe what you are working on and which files are involved. " +
  "Optionally runs graph queries to enrich context with knowledge graph findings — call BEFORE doing the work, not after. " +
  "Do NOT skip at task start; for quick mid-task adjustments without graph enrichment use noesis_focus instead. " +
  "Consequence: updates the attention layer with focus, files, priority and stores any graph findings returned. " +
  "Fields: focus (required), files, graphQueries, priority (optional)",
    parameters: buildAttendParams(pi),
    async execute(tCID, params, _signal, _onUpdate, _ctx) {
      return executeAttend(runtime, params);
    },
  });
}
