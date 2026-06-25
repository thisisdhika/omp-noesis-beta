"use strict";

/**
 * omp-noesis: Sandbox Tool
 *
 * `noesis:sandbox` — speculative belief experimentation with
 * create/explore/merge/discard lifecycle.
 *
 * Subcommands:
 *   create <name> [description]
 *   explore <sandboxId> <content> [confidence]
 *   merge <sandboxId>
 *   discard <sandboxId>
 *   list
 */

import type { ExtensionAPI, AgentToolResult } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import { CreateSandboxUseCase } from "../application/use-cases/create-sandbox.js";
import { ExploreInSandboxUseCase } from "../application/use-cases/explore-in-sandbox.js";
import { MergeSandboxUseCase } from "../application/use-cases/merge-sandbox.js";
import { DiscardSandboxUseCase } from "../application/use-cases/discard-sandbox.js";
import { getActiveSandboxes } from "../domains/sandbox/sandbox-domain.js";

function formatSandboxList(runtime: NoesisRuntime): string {
  const state = runtime.stateManager.read();
  const active = getActiveSandboxes(state);
  if (active.length === 0) return "No active sandboxes.";
  return active.map(s =>
    `  • ${s.id}  "${s.name}"  (${s.facts.length} facts, ${s.decisions.length} decisions)`,
  ).join("\n");
}

export async function executeSandboxTool(
  runtime: NoesisRuntime,
  params: Record<string, unknown>,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const sub = String(params.subcommand ?? "list");
  const stateManager = runtime.stateManager;

  switch (sub) {
    case "create": {
      const name = String(params.name ?? "");
      const description = params.description ? String(params.description) : undefined;
      if (!name) {
        return {
          content: [{ type: "text", text: "Usage: noesis:sandbox create <name> [description]" }],
          isError: true,
          details: {},
        };
      }
      const useCase = new CreateSandboxUseCase(stateManager);
      const { sandboxId } = await useCase.execute({ name, description });
      return {
        content: [{ type: "text", text: `Created sandbox: ${sandboxId} ("${name}")` }],
        isError: false,
        details: { sandboxId, name },
      };
    }

    case "explore": {
      const sandboxId = String(params.sandboxId ?? "");
      const content = String(params.content ?? "");
      const confidence = typeof params.confidence === "number" ? params.confidence : 0.75;
      if (!sandboxId || !content) {
        return {
          content: [{ type: "text", text: "Usage: noesis:sandbox explore <sandboxId> <content> [confidence]" }],
          isError: true,
          details: {},
        };
      }
      const useCase = new ExploreInSandboxUseCase(stateManager);
      const { factId } = await useCase.execute(sandboxId, {
        content,
        confidence,
        source: "inference",
        tags: params.tags ? (Array.isArray(params.tags) ? params.tags.map(String) : undefined) : undefined,
        evidence: params.evidence ? String(params.evidence) : undefined,
      });
      return {
        content: [{ type: "text", text: `Explored fact ${factId} in sandbox ${sandboxId}` }],
        isError: false,
        details: { sandboxId, factId, content },
      };
    }

    case "merge": {
      const sandboxId = String(params.sandboxId ?? "");
      if (!sandboxId) {
        return {
          content: [{ type: "text", text: "Usage: noesis:sandbox merge <sandboxId>" }],
          isError: true,
          details: {},
        };
      }
      const useCase = new MergeSandboxUseCase(stateManager);
      const { promotedFacts, promotedDecisions } = await useCase.execute(sandboxId);
      return {
        content: [{ type: "text", text: `Merged sandbox ${sandboxId}: promoted ${promotedFacts} facts, ${promotedDecisions} decisions` }],
        isError: false,
        details: { sandboxId, promotedFacts, promotedDecisions },
      };
    }

    case "discard": {
      const sandboxId = String(params.sandboxId ?? "");
      if (!sandboxId) {
        return {
          content: [{ type: "text", text: "Usage: noesis:sandbox discard <sandboxId>" }],
          isError: true,
          details: {},
        };
      }
      const useCase = new DiscardSandboxUseCase(stateManager);
      await useCase.execute(sandboxId);
      return {
        content: [{ type: "text", text: `Discarded sandbox ${sandboxId}` }],
        isError: false,
        details: { sandboxId },
      };
    }

    case "list": {
      const text = formatSandboxList(runtime);
      return {
        content: [{ type: "text", text }],
        isError: false,
        details: {},
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown subcommand "${sub}". Available: create, explore, merge, discard, list` }],
        isError: true,
        details: {},
      };
  }
}

export function registerSandboxTool(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.registerTool({
    name: "noesis_sandbox",
    label: "Noesis: Sandbox",
    description:
      "Speculative belief experimentation sandbox. " +
      "Subcommands: create <name> [desc], explore <sandboxId> <content> [confidence] [tags] [evidence], " +
      "merge <sandboxId>, discard <sandboxId>, list",
    parameters: pi.zod.object({
      subcommand: pi.zod.string().describe("create | explore | merge | discard | list"),
      name: pi.zod.string().optional().describe("Name for the sandbox (create)"),
      description: pi.zod.string().optional().describe("Optional description (create)"),
      sandboxId: pi.zod.string().optional().describe("Sandbox ID (explore/merge/discard)"),
      content: pi.zod.string().optional().describe("Belief content (explore)"),
      confidence: pi.zod.number().min(0).max(1).optional().describe("Confidence 0-1 (explore, default 0.75)"),
      tags: pi.zod.array(pi.zod.string()).optional().describe("Tags (explore)"),
      evidence: pi.zod.string().optional().describe("Evidence (explore)"),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      return executeSandboxTool(runtime, params as Record<string, unknown>);
    },
  });
}
