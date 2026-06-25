"use strict";

/**
 * omp-noesis: Attend Tool
 * Version: 1.0.0
 *
 * "noesis_attend" — set the agent's current focus, file references, and
 * optional graph queries.  When graph queries are provided, each is run
 * through the Graphify CLI and the resulting findings are stored in the
 * attention layer.
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import type { GraphFinding } from "../shared/schema.js";
import { AttendUseCase } from "../application/use-cases/attend.js";
import { query as graphifyQuery } from "../infrastructure/graphify-client.js";
import { log } from "../shared/logger.js";

export function buildAttendParams(pi: ExtensionAPI) {
  return pi.zod.object({
    focus: pi.zod.string(),
    files: pi.zod.array(pi.zod.string()).optional(),
    graphQueries: pi.zod.array(pi.zod.string()).optional(),
    priority: pi.zod.enum(["low", "normal", "high", "critical"]).default("normal"),
    ensureFresh: pi.zod.boolean().optional(),
  });
}
export async function executeAttend(
  runtime: NoesisRuntime,
  params: {
    focus: string;
    files?: string[];
    graphQueries?: string[];
    priority: "low" | "normal" | "high" | "critical";
    ensureFresh?: boolean;
  },
) {
  const { focus, priority, files, graphQueries, ensureFresh } = params;
  let findingsCount = 0;
  const allFindings: GraphFinding[] = [];
  // Ensure fresh graph before queries if requested
  if (ensureFresh && graphQueries !== undefined && graphQueries.length > 0) {
    const { detectCapability, canRunGraphUpdate } = await import("../infrastructure/graphify-client.js");
    const { readNoesisConfig } = await import("../shared/config.js");

    try {
      const capability = await detectCapability(runtime.projectRoot);
      if (capability === "STALE" || capability === "NO_GRAPH") {
        const state = runtime.stateManager.read();
        const config = await readNoesisConfig(runtime.projectRoot);
        const canUpdate = canRunGraphUpdate(
          state._lastGraphUpdate,
          config.maxUpdateInterval,
        );

        if (canUpdate) {
          const opts = capability === "NO_GRAPH" ? { fullRebuild: true, timeout: 120000 } : {};
          const { tryBackgroundGraphUpdate } = await import("../infrastructure/graphify-client.js");
          // Fire-and-forget — graph update can exceed 30s handler timeout
          tryBackgroundGraphUpdate(runtime.projectRoot, runtime.stateManager, opts)
            .catch(() => {});
        }
      }
    } catch (err) {
      log.warn(`[noesis_attend] Graph refresh failed: ${err}`);
      // Continue anyway — queries may work with stale or no graph
    }
  }
  if (graphQueries !== undefined && graphQueries.length > 0) {
    for (const q of graphQueries) {
      const result = await graphifyQuery(runtime.projectRoot, q);
      if (result.error) {
        log.warn(`[noesis_attend] Graph query "${q}" failed: ${result.error}`);
      }
      allFindings.push(...result.findings);
      findingsCount += result.findings.length;
    }
  }

  // Use AttendUseCase with UnitOfWork
  const uow = runtime.stateManager.createUnitOfWork();
  const useCase = new AttendUseCase(uow);
  await useCase.execute({
    focus,
    priority,
    files,
    graphQueries,
    findings: allFindings,
    clearExistingQueries: false,
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
            : "") +
          (ensureFresh ? `\nGraph refresh: requested` : ""),
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
  // ponytail: TS2589 is a pre-existing TypeScript instantiation-depth limit.
  // The OMP ExtensionAPI type has deeply nested generics (~8+ levels) that
  // exceed tsc's default 50-instance limit when combined with strict mode.
  // Fix: extract `pi.registerTool` args into a typed const separate from the call.
  // @ts-expect-error TS2589
  pi.registerTool({
    name: "noesis_attend",
    label: "Noesis: Attend",
    description:
      "Call at task start or focus shift to describe what you're working on and which files are involved. " +
      "Optionally runs graph queries to enrich context — call BEFORE doing work, not after. " +
      "For quick mid-task adjustments, omit graphQueries for a lighter update. " +
      "Updates attention layer with focus, files, priority, and graph findings. " +
      "Fields: focus (required), files, graphQueries, priority (optional), ensureFresh (optional)",
    parameters: buildAttendParams(pi),
    async execute(tCID, params, _signal, _onUpdate, _ctx) {
      return executeAttend(runtime, params);
    },
  });
}
