"use strict";

/**
 * Mock ExtensionAPI for testing tools and hooks without a real OMP session.
 */

import { z } from "zod";

/**
 * Creates a minimal mock of OMP's ExtensionAPI for testing.
 */
export function createMockPi(): Record<string, unknown> {
  const tools: Map<string, unknown> = new Map();
  const hooks: Map<string, Array<(...args: unknown[]) => unknown>> = new Map();

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
    _getTool(name: string): unknown | undefined {
      return tools.get(name);
    },

    _getHooks(event: string): Array<(...args: unknown[]) => unknown> {
      return hooks.get(event) ?? [];
    },

    _toolCount(): number {
      return tools.size;
    },
  };
}
