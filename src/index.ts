/**
 * omp-noesis: Extension activation entry point.
 *
 * Registers 4 cognitive tools, 1 slash command, and 5 lifecycle event handlers.
 * Delegates all business logic to domain modules.
 */

import type { ToolResultEvent } from "./schema.js";
import type { z } from "zod/v4";
import { StateManager } from "./infrastructure/state-manager.js";
import { GraphifyClient } from "./infrastructure/graphify-client.js";
import { createAttendTool } from "./tools/attend-command.js";
import { createBelieveTool } from "./tools/believe-command.js";
import { createInferTool } from "./tools/infer-command.js";
import { createCommitTool } from "./tools/commit-command.js";
import { createInitCommandHandler } from "./commands/init-command.js";
import * as attentionDomain from "./domains/attention/attention-domain.js";
import * as beliefDomain from "./domains/belief/belief-domain.js";
import * as learningDomain from "./domains/learning/learning-domain.js";
import { resolveFocus } from "./rendering/focus-resolver.js";
import { buildPreamble } from "./rendering/preamble-builder.js";
import { buildSurvivors } from "./rendering/survivor-builder.js";
import { checkConsistency } from "./domains/commitment/consistency-strategy.js";
import { truncate } from "./shared/text.js";
import { basename } from "node:path";

type ToolResult = {
  content: Array<{ type: string; text?: string }>;
  details?: unknown;
};

type ExtensionTool<Params> = {
  name: string;
  label: string;
  description: string;
  parameters: z.ZodType<Params>;
  execute: (
    toolCallId: string,
    params: Params,
    signal?: AbortSignal,
    onUpdate?: (update: unknown) => void,
    ctx?: unknown,
  ) => Promise<ToolResult>;
};

type RegisteredTool<Params> = ExtensionTool<Params>;

interface ExtensionCommandContext {
  cwd: string;
  ui: {
    notify(message: string, level?: "info" | "warn" | "error" | "success"): void;
  };
}

type ContextHookEvent = { messages: unknown[] };
type ContextHookResult = { messages: unknown[] };
type SessionCompactingResult = {
  context?: string[];
  prompt?: string;
  preserveData?: Record<string, unknown>;
};
type BeforeAgentStartResult = {
  message: {
    customType: string;
    content: Array<{ type: "text"; text: string }>;
    display: boolean;
    attribution: "agent" | "user" | "system";
    details?: Record<string, unknown>;
  };
};

interface ExtensionAPI {
  cwd: string;
  registerTool<Params>(tool: RegisteredTool<Params>): void;
  registerCommand(
    name: string,
    options: {
      description: string;
      handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
    },
  ): void;
  on(event: "context", handler: (event: ContextHookEvent) => ContextHookResult | undefined): void;
  on(event: "session.compacting", handler: () => SessionCompactingResult | undefined): void;
  on(event: "session_compact", handler: () => void): void;
  on(event: "tool_result", handler: (event: ToolResultEvent) => { content?: unknown; details?: unknown; isError?: boolean } | void): void;
  on(event: "before_agent_start", handler: () => BeforeAgentStartResult | undefined): void;
}

export default function activate(pi: ExtensionAPI): void {
  const root = pi.cwd ?? process.cwd();
  const state = new StateManager(root);
  const graphify = new GraphifyClient(root);
  const deps = { state, graphify };

  pi.registerTool(createAttendTool(deps));
  pi.registerTool(createBelieveTool(deps));
  pi.registerTool(createInferTool(deps));
  pi.registerTool(createCommitTool(deps));

  pi.registerCommand("noesis:init", {
    description: "Configure project-local OMP settings for noesis",
    handler: createInitCommandHandler(),
  });

  pi.on("context", (event: ContextHookEvent) => {
    const snapshot = state.read();
    const focus = resolveFocus(snapshot);
    state.mutate((current) => {
      attentionDomain.setFocus(current, focus);
    });

    const preamble = buildPreamble(state.read(), {
      capability: graphify.capability,
      learningRanked: learningDomain.getTopLearning(state.read(), 10),
      staleNotes: beliefDomain.computeStaleReviewNotes(state.read(), graphify.capability),
      projectName: basename(root),
      consistencyWarnings: checkConsistency(state.read()),
    });

    state.mutate((current) => {
      attentionDomain.clearGraphFindings(current);
    });

    return { messages: prependPreamble(event.messages, preamble) };
  });

  pi.on("session.compacting", () => {
    const { contextLines, preserveData } = buildSurvivors(state.read());
    return { context: contextLines, preserveData };
  });

  pi.on("session_compact", () => {
    state.invalidateAfterCompaction();
  });

  pi.on("tool_result", (event: ToolResultEvent) => {
    if (isFailureEvent(event)) {
      state.mutate((current) => {
        learningDomain.captureFailure(current, event.toolName, extractDescription(event), inferSkillScope(event));
        learningDomain.applyRetentionPolicy(current, 50);
      });
    }
  });

  pi.on("before_agent_start", () => {
    const snapshot = state.read();
    if (!snapshot.attention.focus) return undefined;
    return {
      message: {
        customType: "noesis-orientation",
        content: [{ type: "text", text: `[Noesis] Focus: ${snapshot.attention.focus}` }],
        display: true,
        attribution: "agent",
      },
    };
  });
}

function prependPreamble(messages: unknown[], preamble: string): unknown[] {
  if (messages.length === 0) {
    return [{ role: "user", content: [{ type: "text", text: `<noesis-state>\n${preamble}\n</noesis-state>` }] }];
  }

  const first = messages[0];
  if (isUserTextMessage(first)) {
    const textParts = first.content.filter((part) => part.type === "text").map((part) => part.text ?? "").join("");
    return [{ ...first, content: [{ type: "text", text: `<noesis-state>\n${preamble}\n</noesis-state>\n\n${textParts}` }] }, ...messages.slice(1)];
  }

  return [{ role: "user", content: [{ type: "text", text: `<noesis-state>\n${preamble}\n</noesis-state>` }] }, ...messages];
}

function isUserTextMessage(value: unknown): value is { role: "user"; content: Array<{ type: string; text?: string }> } {
  if (!isRecord(value)) return false;
  return value.role === "user" && Array.isArray(value.content);
}

function isFailureEvent(event: ToolResultEvent): boolean {
  if (event.isError) return true;
  if (event.toolName === "bash" && isRecord(event.details)) {
    return typeof event.details.code === "number" && event.details.code !== 0;
  }
  return false;
}

function extractDescription(event: ToolResultEvent): string {
  if (Array.isArray(event.content) && event.content.length > 0) {
    const first = event.content[0];
    if (isRecord(first) && typeof first.text === "string") return truncate(first.text, 500);
  }
  return `${event.toolName} result`;
}

function inferSkillScope(event: ToolResultEvent): string | undefined {
  if (event.toolName !== "bash" || !isRecord(event.details) || typeof event.details.cwd !== "string") return undefined;
  const parts = event.details.cwd.split("/").filter(Boolean);
  return parts[parts.length - 1];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
