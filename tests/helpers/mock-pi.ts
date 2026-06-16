"use strict";

/**
 * Mock ExtensionAPI for testing tools and hooks without a real OMP session.
 */

import { z } from "zod";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

/** Mock pi with test helper methods, structurally matching ExtensionAPI. */
export interface MockPi {
  zod: typeof z;
  logger: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
  };
  registerTool(def: Record<string, unknown>): void;
  registerCommand(name: string, opts: Record<string, unknown>): void;
  on(event: string, handler: (...args: unknown[]) => unknown): void;
  sendMessage(message: {
    customType: string;
    content: string;
    display: boolean;
    attribution?: string;
    details?: unknown;
  }, options?: {
    triggerTurn?: boolean;
    deliverAs?: "steer" | "followUp" | "nextTurn";
  }): void;
  _getMessages(): Array<unknown>;
  _toolCount(): number;
  _getTool(name: string): Record<string, unknown> | undefined;
  _getHooks(event: string): Array<(...args: unknown[]) => unknown>;
}

/** Bridge a MockPi to ExtensionAPI for use in tool/hook registration. */
export function toExtensionAPI(pi: MockPi): ExtensionAPI {
  return pi as unknown as ExtensionAPI;
}

/** Cast a MockPi to ExtensionAPI using the intentional double-cast bypass. */
export function castToExtensionAPI(pi: MockPi): ExtensionAPI {
  return pi as unknown as ExtensionAPI;
}
/**
 * Creates a minimal mock of OMP's ExtensionAPI for testing.
 */
export function createMockPi(): MockPi {
  const tools: Map<string, unknown> = new Map();
  const hooks: Map<string, Array<(...args: unknown[]) => unknown>> = new Map();
  const messages: unknown[] = [];

  return {
    zod: z,

    logger: {
      info: (..._args: unknown[]) => {},
      warn: (..._args: unknown[]) => {},
      error: (..._args: unknown[]) => {},
      debug: (..._args: unknown[]) => {},
    },

    registerTool(def: Record<string, unknown>) {
      tools.set(def.name as string, def);
    },

    registerCommand(_name: string, _opts: Record<string, unknown>) {
      // no-op for tests
    },

    on(event: string, handler: (...args: unknown[]) => unknown) {
      if (!hooks.has(event)) {
        hooks.set(event, []);
      }
      hooks.get(event)!.push(handler);
    },

    // Test helpers
    sendMessage(message: {
      customType: string;
      content: string;
      display: boolean;
      attribution?: string;
      details?: unknown;
    }, _options?: {
      triggerTurn?: boolean;
      deliverAs?: "steer" | "followUp" | "nextTurn";
    }): void {
      messages.push({ message, options: _options });
    },

    _getMessages(): Array<unknown> {
      return [...messages];
    },

    _getTool(name: string): Record<string, unknown> | undefined {
      return tools.get(name) as Record<string, unknown> | undefined;
    },

    _getHooks(event: string): Array<(...args: unknown[]) => unknown> {
      return hooks.get(event) ?? [];
    },

    _toolCount(): number {
      return tools.size;
    },
  };
}
