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

  // 1. Instantiate infrastructure
  const state = new StateManager(root);
  const graphify = new GraphifyClient(root);

  // 2. Assemble dependencies
  const deps = { state, graphify };

  // 3. Register tools
  pi.registerTool(createAttendTool(deps));
  pi.registerTool(createBelieveTool(deps));
  pi.registerTool(createInferTool(deps));
  pi.registerTool(createCommitTool(deps));

  // 4. Register slash command
  pi.registerCommand("noesis:init", {
    description: "Configure project-local OMP settings for noesis",
    handler: createInitCommandHandler(),
  });

  // 5. Register lifecycle event handlers

  // context hook — sole preamble injector
  pi.on("context", (event: { messages: unknown[] }) => {
    const s = state.read();
    const focus = resolveFocus(s);
    state.mutate(st => { attentionDomain.setFocus(st, focus); });

    const preamble = buildPreamble(state.read(), {
      capability: graphify.capability,
      learningRanked: learningDomain.getTopLearning(state.read(), 10),
      staleNotes: beliefDomain.computeStaleReviewNotes(state.read(), graphify.capability),
      projectName: basename(root),
      consistencyWarnings: checkConsistency(state.read()),
    });

    state.mutate(st => { attentionDomain.clearGraphFindings(st); });

    return { messages: prependPreamble(event.messages, preamble) };
  });

  // session.compacting hook — survivor projection
  pi.on("session.compacting", () => {
    const { contextLines, preserveData } = buildSurvivors(state.read());
    return { context: contextLines, preserveData };
  });

  // session_compact hook — cache invalidation
  pi.on("session_compact", () => {
    state.invalidateAfterCompaction();
  });

  // tool_result hook — learning capture
  pi.on("tool_result", (event: ToolResultEvent) => {
    if (isFailureEvent(event)) {
      state.mutate(s => {
        learningDomain.captureFailure(s, event.toolName, extractDescription(event), inferSkillScope(event));
        learningDomain.applyRetentionPolicy(s, 50);
      });
    }
  });

  // before_agent_start — safety net orientation
  pi.on("before_agent_start", () => {
    const s = state.read();
    if (!s.attention.focus) return undefined;
    return {
      message: {
        customType: "noesis-orientation",
        content: [{ type: "text", text: `[Noesis] Focus: ${s.attention.focus}` }],
        display: true,
        attribution: "agent",
      },
    };
  });
}

// ============================================================================
// Helpers
// ============================================================================

function prependPreamble(messages: unknown[], preamble: string): unknown[] {
  if (!messages || messages.length === 0) {
    return [{
      role: "user",
      content: [{ type: "text", text: `<noesis-state>\n${preamble}\n</noesis-state>` }],
    }];
  }

  // Clone the first user message and prepend preamble
  const first = messages[0]! as { role?: string; content?: Array<{ type: string; text?: string }> };
  if (first?.role === "user" && Array.isArray(first.content)) {
    const textParts = first.content.filter(c => c.type === "text").map(c => c.text ?? "").join("");
    const newContent = [{ type: "text", text: `<noesis-state>\n${preamble}\n</noesis-state>\n\n${textParts}` }];
    return [{ ...first, content: newContent }, ...messages.slice(1)];
  }

  // Prepend as a new user message
  return [{
    role: "user",
    content: [{ type: "text", text: `<noesis-state>\n${preamble}\n</noesis-state>` }],
  }, ...messages];
}

function isFailureEvent(event: ToolResultEvent): boolean {
  if (event.isError) return true;
  if (event.toolName === "bash" && event.details && typeof event.details === "object") {
    const details = event.details as Record<string, unknown>;
    if (typeof details.code === "number" && details.code !== 0) return true;
  }
  return false;
}

function extractDescription(event: ToolResultEvent): string {
  if (event.content && Array.isArray(event.content) && event.content.length > 0) {
    const first = event.content[0]!;
    if ("text" in first && typeof first.text === "string") return truncate(first.text, 500);
  }
  return `${event.toolName} result`;
}

function inferSkillScope(event: ToolResultEvent): string | undefined {
  if (event.toolName === "bash" && event.details && typeof event.details === "object") {
    const details = event.details as Record<string, unknown>;
    if (typeof details.cwd === "string") {
      // Extract last meaningful path component as skill scope
      const parts = details.cwd.split("/").filter(Boolean);
      return parts[parts.length - 1] ?? undefined;
    }
  }
  return undefined;
}
