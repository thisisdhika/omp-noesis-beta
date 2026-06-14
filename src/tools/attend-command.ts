import type { StateManager } from "../infrastructure/state-manager.js";
import type { GraphifyClient } from "../infrastructure/graphify-client.js";
import * as attention from "../domains/attention/attention-domain.js";
import { parseQueryOutput } from "../infrastructure/graphify-parser.js";
import { NoesisAttendParamsSchema, type NoesisAttendParams } from "../schema.js";
import type { GraphFinding } from "../schema.js";

interface AttendDeps {
  state: StateManager;
  graphify: GraphifyClient;
}

export function createAttendTool(deps: AttendDeps) {
  return {
    name: "noesis_attend",
    label: "Noesis Attend",
    description: "Set cognitive focus, file targets, and optionally query Graphify for structural grounding. Returns current focus and any graph findings.",
    parameters: NoesisAttendParamsSchema,
    async execute(
      _toolCallId: string,
      params: NoesisAttendParams,
      _signal?: AbortSignal,
      _onUpdate?: (update: unknown) => void,
      _ctx?: unknown,
    ) {
      const findings: GraphFinding[] = [];

      // Update attention fields
      deps.state.mutate(s => {
        if (params.focus !== undefined) attention.setFocus(s, params.focus);
        if (params.files !== undefined) attention.setFiles(s, params.files);
        if (params.graphQueries !== undefined) attention.setGraphQueries(s, params.graphQueries);
        if (params.clearGraphFindings) attention.clearGraphFindings(s);
      });

      // Run Graphify queries if capability allows
      const cap = deps.graphify.capability;
      if (params.graphQueries && params.graphQueries.length > 0 && cap !== "DEGRADED" && cap !== "NO_GRAPH") {
        if (cap === "STALE") {
          try { await deps.graphify.updateGraph(); } catch { /* proceed with stale */ }
        }
        const isStale = cap === "STALE";
        for (const query of params.graphQueries) {
          try {
            const raw = await deps.graphify.query(query);
            const parsed = parseQueryOutput(raw);
            deps.state.mutate(s => {
              findings.push(...parsed);
              attention.storeGraphFindings(s, findings);
            });
          } catch { /* query failed, skip — agent will see no findings for this query */ }
        }
      }

      const state = deps.state.read();
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            focus: state.attention.focus,
            capability: cap,
            findingsCount: findings.length,
            files: state.attention.files,
          }, null, 2),
        }],
        details: { focus: state.attention.focus, capability: cap, findingsCount: findings.length },
      };
    },
  };
}
