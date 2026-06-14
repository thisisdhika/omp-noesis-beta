import type { ToolResultEvent } from "../../src/schema.js";
import type { z } from "zod/v4";

type ToolResult = {
  content: Array<{ type: string; text?: string }>;
  details?: unknown;
};

type RegisteredTool<Params> = {
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

interface ExtensionCommandContext {
  cwd: string;
  ui: {
    notify(message: string, level?: "info" | "warn" | "error" | "success"): void;
  };
}

export class MockExtensionAPI {
  readonly cwd: string;
  private _tools = new Map<string, RegisteredTool<unknown>>();
  private _commands = new Map<
    string,
    {
      description: string;
      handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
    }
  >();
  private _hooks = new Map<string, Array<(...args: unknown[]) => unknown>>();

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  get tools(): ReadonlyMap<string, RegisteredTool<unknown>> {
    return this._tools;
  }

  get commands(): ReadonlyMap<
    string,
    {
      description: string;
      handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
    }
  > {
    return this._commands;
  }

  get hooks(): ReadonlyMap<string, Array<(...args: unknown[]) => unknown>> {
    return this._hooks;
  }

  registerTool<Params>(tool: RegisteredTool<Params>): void {
    this._tools.set(tool.name, tool as RegisteredTool<unknown>);
  }

  registerCommand(
    name: string,
    options: {
      description: string;
      handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
    },
  ): void {
    this._commands.set(name, options);
  }

  on(event: string, handler: (...args: unknown[]) => unknown): void {
    const handlers = this._hooks.get(event);
    if (handlers) {
      handlers.push(handler);
    } else {
      this._hooks.set(event, [handler]);
    }
  }

  // ── Test-only surface ──

  async invokeTool(
    name: string,
    params: Record<string, unknown>,
  ): Promise<ToolResult> {
    const tool = this._tools.get(name);
    if (!tool) throw new Error(`Tool "${name}" not registered`);
    return tool.execute("mock-call-id", params as never);
  }

  invokeHook(event: string, payload?: unknown): unknown {
    const handlers = this._hooks.get(event);
    if (!handlers || handlers.length === 0) return undefined;

    // For hooks that return values, return the first non-undefined result.
    for (const handler of handlers) {
      const result = handler(payload);
      if (result !== undefined) return result;
    }
    return undefined;
  }

  getTool<Params>(name: string): RegisteredTool<Params> | undefined {
    return this._tools.get(name) as RegisteredTool<Params> | undefined;
  }

  getCommand(name: string):
    | {
        description: string;
        handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
      }
    | undefined {
    return this._commands.get(name);
  }

  hookCount(event: string): number {
    return this._hooks.get(event)?.length ?? 0;
  }
}
