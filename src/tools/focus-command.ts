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
import { setFocus, setFiles } from "../domains/attention/attention-domain.js";

export function registerFocusTool(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.registerTool({
    name: "noesis_focus",
    label: "Noesis: Focus",
    description:
      "Quickly set the agent's current focus and optional file references. " +
      "Lighter than noesis_attend — does not run graph queries.",
    parameters: pi.zod.object({
      focus: pi.zod.string().max(200),
      files: pi.zod.array(pi.zod.string()).max(10).optional(),
      priority: pi.zod.enum(["low", "normal", "high", "critical"]).default("normal"),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { focus, priority, files } = params;

      await runtime.stateManager.mutate((state) => {
        setFocus(state, focus, priority);
        setFiles(state, files ?? []);
      });

      return {
        content: [
          {
            type: "text",
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
    },
  });
}
