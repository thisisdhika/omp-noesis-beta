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
import {
  setFocus,
  setGraphQueries,
  setFiles,
  storeGraphFindings,
} from "../domains/attention/attention-domain.js";
import { query as graphifyQuery } from "../infrastructure/graphify-client.js";

export function registerAttendTool(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.registerTool({
    name: "noesis_attend",
    label: "Noesis: Attend",
    description:
      "Set the agent's focus, file references, and optional graph queries. " +
      "When graphQueries are provided, each query is run against the project " +
      "knowledge graph and the resulting findings are stored.",
    parameters: pi.zod.object({
      focus: pi.zod.string().max(200),
      files: pi.zod.array(pi.zod.string()).max(10).optional(),
      graphQueries: pi.zod.array(pi.zod.string()).max(5).optional(),
      priority: pi.zod.enum(["low", "normal", "high", "critical"]).default("normal"),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { focus, priority, files, graphQueries } = params;

      // 1. Write focus + files + graph queries to state
      await runtime.stateManager.mutate((state) => {
        setFocus(state, focus, priority);
        setFiles(state, files ?? []);
        setGraphQueries(state, graphQueries ?? []);
      });

      // 2. Run graph queries if provided
      let findingsCount = 0;
      if (graphQueries !== undefined && graphQueries.length > 0) {
        const allFindings: Array<{ query: string; findings: unknown[] }> = [];
        for (const q of graphQueries) {
          try {
            const result = await graphifyQuery(runtime.projectRoot, q);
            allFindings.push({ query: q, findings: result });
            findingsCount += result.length;

            // Store findings in state
            if (result.length > 0) {
              await runtime.stateManager.mutate((state) => {
                storeGraphFindings(state, result);
              });
            }
          } catch {
            // Graphify query failed — non-fatal, continue
            allFindings.push({ query: q, findings: [] });
          }
        }
      }

      return {
        content: [
          {
            type: "text",
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
    },
  });
}
