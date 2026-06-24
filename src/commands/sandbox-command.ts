"use strict";

/**
 * omp-noesis: Sandbox Command
 *
 * `/noesis:sandbox` — speculative belief experimentation with
 * create/explore/merge/discard lifecycle.
 *
 * Subcommands: create, explore, merge, discard, list
 */

import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import { CreateSandboxUseCase } from "../application/use-cases/create-sandbox.js";
import { ExploreInSandboxUseCase } from "../application/use-cases/explore-in-sandbox.js";
import { MergeSandboxUseCase } from "../application/use-cases/merge-sandbox.js";
import { DiscardSandboxUseCase } from "../application/use-cases/discard-sandbox.js";
import { getActiveSandboxes } from "../domains/sandbox/sandbox-domain.js";

function formatList(runtime: NoesisRuntime): string {
  const state = runtime.stateManager.read();
  const active = getActiveSandboxes(state);
  if (active.length === 0) return "No active sandboxes.";
  return active.map(s =>
    `  • ${s.id}  "${s.name}"  (${s.facts.length} facts, ${s.decisions.length} decisions)`,
  ).join("\n");
}

export async function sandboxCommand(
  args: string,
  _ctx: ExtensionCommandContext,
  runtime: NoesisRuntime,
): Promise<string> {
  const trimmed = args.trim();
  if (!trimmed || trimmed === "list") {
    return formatList(runtime);
  }

  const parts = trimmed.split(/\s+/);
  const subcommand = parts[0];
  const stateManager = runtime.stateManager;

  try {
    switch (subcommand) {
      case "create": {
        const rawName = parts[1];
        if (!rawName) {
          return "Usage: /noesis:sandbox create <name> [description]";
        }
        const description = parts.slice(2).join(" ") || undefined;
        const useCase = new CreateSandboxUseCase(stateManager);
        const { sandboxId } = await useCase.execute({ name: rawName, description });
        return `Created sandbox: ${sandboxId} ("${rawName}")`;
      }

      case "explore": {
        const sbId = parts[1];
        if (!sbId) {
          return "Usage: /noesis:sandbox explore <sandboxId> <content> [confidence]";
        }
        const content = parts.slice(2).join(" ");
        if (!content) {
          return "Usage: /noesis:sandbox explore <sandboxId> <content> [confidence]";
        }
        // Parse optional trailing confidence
        let confidence = 0.75;
        const lastToken = parts[parts.length - 1] ?? "";
        const parsed = parseFloat(lastToken);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1 && parts.length > 3) {
          confidence = parsed;
        }
        const useCase = new ExploreInSandboxUseCase(stateManager);
        const { factId } = await useCase.execute(sbId!, {
          content,
          confidence,
          source: "inference",
        });
        return `Explored fact ${factId} in sandbox ${sbId}`;
      }

      case "merge": {
        const sbId = parts[1];
        if (!sbId) {
          return "Usage: /noesis:sandbox merge <sandboxId>";
        }
        const useCase = new MergeSandboxUseCase(stateManager);
        const { promotedFacts, promotedDecisions } = await useCase.execute(sbId);
        return `Merged sandbox ${sbId}: promoted ${promotedFacts} facts, ${promotedDecisions} decisions`;
      }

      case "discard": {
        const sbId = parts[1];
        if (!sbId) {
          return "Usage: /noesis:sandbox discard <sandboxId>";
        }
        const useCase = new DiscardSandboxUseCase(stateManager);
        await useCase.execute(sbId);
        return `Discarded sandbox ${sbId}`;
      }

      default:
        return `Unknown subcommand "${subcommand}". Available: create, explore, merge, discard, list`;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error: ${msg}`;
  }
}
