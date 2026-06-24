"use strict";

/**
 * omp-noesis: Federate Tool
 * Version: 1.0.0
 *
 * Registers noesis:federate — multi-agent belief federation tool with
 * subcommands: publish, pull, revise, status, identity.
 */

import type { ExtensionAPI, AgentToolResult } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import type { CanonicalLedger } from "../domains/federation/schema.js";
import { PublishBeliefUseCase } from "../application/use-cases/publish-belief.js";
import { PullBeliefsUseCase } from "../application/use-cases/pull-beliefs.js";
import { ReviseBeliefUseCase } from "../application/use-cases/revise-belief.js";
import { RetractBeliefUseCase } from "../application/use-cases/retract-belief.js";
import { ImportLedgerUseCase } from "../application/use-cases/import-ledger.js";

function okResult(data: unknown): AgentToolResult<Record<string, unknown>> {
  const text = typeof data === "string" ? data : JSON.stringify(data);
  return { content: [{ type: "text", text }] };
}

function errResult(message: string): AgentToolResult<Record<string, unknown>> {
  return { isError: true, content: [{ type: "text", text: message }] };
}

interface FederateParams {
  subcommand: string;
  args: string[];
}

function parseFederateArgs(raw: string): FederateParams {
  const parts = raw.trim().split(/\s+/);
  const subcommand = parts[0]?.toLowerCase() ?? "";
  return { subcommand, args: parts.slice(1) };
}

function getAgentId(runtime: NoesisRuntime): string {
  const hash = Number(Bun.hash(runtime.projectRoot));
  return `agent-${(hash >>> 0).toString(36)}`;
}

async function getOrInitLedger(runtime: NoesisRuntime): Promise<CanonicalLedger> {
  const agentId = getAgentId(runtime);
  const existing = await runtime.stateManager.loadLedger();
  if (existing) return existing;
  return { entries: [], agentId, agentName: "noesis-agent" };
}

export async function executeFederate(
  runtime: NoesisRuntime,
  raw: string,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const { subcommand, args } = parseFederateArgs(raw);

  try {
    switch (subcommand) {
      case "publish": {
        const beliefId = args[0];
        if (!beliefId) return errResult("Usage: publish <beliefId>");
        const kind = args[1] as "fact" | "decision" | undefined;
        const beliefKind = kind === "decision" ? "decision" : "fact";
        const ledger = await getOrInitLedger(runtime);
        const agentId = getAgentId(runtime);
        const uow = runtime.stateManager.createUnitOfWork();
        const uc = new PublishBeliefUseCase(uow, ledger);
        const result = await uc.execute({ beliefId, beliefKind, agentId });
        await runtime.stateManager.saveLedger(ledger);
        return okResult({ ...result, agentId, entry: ledger.entries[ledger.entries.length - 1] });
      }
      case "pull": {
        const ledger = await getOrInitLedger(runtime);
        const agentId = getAgentId(runtime);
        const uow = runtime.stateManager.createUnitOfWork();
        const uc = new PullBeliefsUseCase(uow, ledger);
        const result = await uc.execute(agentId);
        await runtime.stateManager.saveLedger(ledger);
        return okResult(result);
      }
      case "revise": {
        const previousEntryId = args[0];
        const content = args.slice(1).join(" ");
        if (!previousEntryId || !content) return errResult("Usage: revise <entryId> <new content>");
        const ledger = await getOrInitLedger(runtime);
        const agentId = getAgentId(runtime);
        const uow = runtime.stateManager.createUnitOfWork();
        const uc = new ReviseBeliefUseCase(uow, ledger);
        const result = await uc.execute({ previousEntryId, agentId, content });
        if (!result) return errResult("Entry not found or not owned by this agent");
        await runtime.stateManager.saveLedger(ledger);
        return okResult(result);
      }
      case "retract": {
        const beliefId = args[0];
        if (!beliefId) return errResult("Usage: retract <beliefId>");
        const ledger = await getOrInitLedger(runtime);
        const agentId = getAgentId(runtime);
        const uow = runtime.stateManager.createUnitOfWork();
        const uc = new RetractBeliefUseCase(uow, ledger);
        const result = await uc.execute({ beliefId, agentId });
        if (!result) return errResult("Belief not found or not owned by this agent");
        await runtime.stateManager.saveLedger(ledger);
        return okResult(result);
      }
      case "identity": {
        const name = args.join(" ");
        if (!name) return errResult("Usage: identity <name>");
        const agentId = getAgentId(runtime);
        const ledger = await getOrInitLedger(runtime);
        ledger.agentName = name;
        ledger.agentId = agentId;
        await runtime.stateManager.saveLedger(ledger);
        return okResult({ agentId, agentName: name });
      }
      case "status": {
        const ledger = await getOrInitLedger(runtime);
        const agentId = getAgentId(runtime);
        return okResult({
          agentId,
          agentName: ledger.agentName ?? "noesis-agent",
          entryCount: ledger.entries.length,
          ownEntries: ledger.entries.filter((e) => e.agentId === agentId).length,
          foreignEntries: ledger.entries.filter((e) => e.agentId !== agentId).length,
        });
      }
      default:
        return errResult("Unknown subcommand. Available: publish, pull, revise, retract, identity, status");
    }
  } catch (err) {
    return errResult(err instanceof Error ? err.message : String(err));
  }
}
export function registerFederateTool(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.registerTool({
    name: "noesis_federate",
    label: "Noesis: Federate",
    description:
      "Multi-agent belief federation — publish, pull, revise beliefs across instances. Subcommands: publish <beliefId> [fact|decision], pull, revise <entryId> <content>, retract <beliefId>, identity <name>, status",
    parameters: pi.zod.object({
      raw: pi.zod.string().describe(
        "Federation command: publish <beliefId> [kind], pull, revise <entryId> <content>, retract <beliefId>, identity <name>, status",
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      return executeFederate(runtime, (params as { raw: string }).raw);
    },
  });
}
