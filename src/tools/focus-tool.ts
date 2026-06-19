"use strict";

/**
 * omp-noesis: Focus Tool
 * Version: 0.1.0
 *
 * "noesis_focus" — quickly set the agent's current focus and optional
 * file references without triggering graph queries.
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import { AttendUseCase } from "../application/use-cases/attend.js";

export function buildFocusParams(pi: ExtensionAPI) {
  return pi.zod.object({
    focus: pi.zod.string(),
    files: pi.zod.array(pi.zod.string()).optional(),
    priority: pi.zod.enum(["low", "normal", "high", "critical"]).default("normal"),
  });
}

export async function executeFocus(
  runtime: NoesisRuntime,
  params: { focus: string; files?: string[]; priority: "low" | "normal" | "high" | "critical" },
) {
  const { focus, priority, files } = params;

  const uow = runtime.stateManager.createUnitOfWork();
  const useCase = new AttendUseCase(uow);
  await useCase.execute({
    focus,
    priority,
    files,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: `Focus set to: "${focus}" (priority: ${priority})` +
          (files !== undefined && files.length > 0
            ? `\nFiles referenced: ${files.length}`
            : ""),
      },
    ],
    details: {
      focus,
      priority,
      fileCount: files?.length ?? 0,
    },
    isError: false,
  };
}

export function registerFocusTool(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.registerTool({
    name: "noesis_focus",
    label: "Noesis: Focus",
    description:
  "Quick focus update mid-task without running graph queries. " +
  "Lighter and faster than noesis_attend — use when switching subtopics, narrowing scope, or updating file references during a task. " +
  "Do NOT call at task start; use noesis_attend for initial focus with optional graph enrichment. " +
  "Consequence: updates attention focus and priority only; no graph findings are generated or stored. " +
  "Fields: focus (required), files, priority (optional)",
    parameters: buildFocusParams(pi),
    async execute(tCID, params, _signal, _onUpdate, _ctx) {
      return executeFocus(runtime, params);
    },
  });
}
