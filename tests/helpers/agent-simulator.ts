"use strict";

/**
 * AgentSimulator — reusable test helper for omp-noesis behavioral tests.
 *
 * Creates an isolated temp project root with a mock pi, runtime, and
 * registered hooks.  Exposes turn/compact/newSession lifecycle methods
 * so tests can simulate multi-turn sessions without real OMP/LLM deps.
 *
 * USAGE:
 * ```ts
 * mock.module("../../src/infrastructure/graphify-client.js", () => ({
 *   detectCapability: async () => "FULL" as const,
 *   tryLifecycleGraphUpdate: async () => {},
 * }));
 *
 * const sim = await createAgentSimulator();
 * try {
 *   await sim.turn();
 *   const state = sim.getState();
 *   // ... assert on state
 * } finally {
 *   sim.cleanup();
 * }
 * ```
 */

import { mkdtempSync, rmSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { StateManager } from "../../src/infrastructure/state-manager.js";
import { createVaultStore } from "../../src/vault/vault-detector.js";
import type { NoesisRuntime } from "../../src/runtime.js";
import type {
  NoesisState,
  RenderContext,
  CapabilityLevel,
  BeliefFact,
  GraphFinding,
} from "../../src/shared/schema.js";
import { generateId } from "../../src/shared/schema-base.js";
import { buildPreamble as buildPreambleCore } from "../../src/rendering/preamble-builder.js";
import { detectFamilyFromModel } from "../../src/shared/model-profile.js";
import { createMockPi, toExtensionAPI, type MockPi } from "./mock-pi.js";
import { registerHooks } from "../../src/hooks/index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Free model for simulator use — never calls a paid model. */
const DEFAULT_MODEL = "opencode-zen/deepseek-v4-flash-free";

export interface AgentSimulatorOptions {
  /** Default model ID for context preamble rendering. */
  model?: string;
  /** Override for the graphify capability level used in preamble building. */
  defaultGraphifyStatus?: CapabilityLevel;
  /** Override for graph freshness metadata. */
  graphFreshness?: { isStale: boolean; staleHours?: number; lastUpdate?: string };
  /** Override for graphify version string. */
  graphifyVersion?: string;
}

export interface TurnResult {
  /** Current state after the turn (context hook + turn_end cleanup). */
  state: Readonly<NoesisState>;
}

export interface CompactResult {
  /** Survivor context XML from the compaction hook. */
  survivorContext: string;
  /** Preserved data blob from the compaction hook. */
  preserveData: Record<string, unknown>;
  /** State snapshot after compaction. */
  state: Readonly<NoesisState>;
}

export interface AgentSimulator {
  /** The underlying MockPi — lets tests inspect registrations. */
  readonly pi: MockPi;

  /** The NoesisRuntime bound to the isolated project root. */
  readonly runtime: NoesisRuntime;

  /** Temp directory used as the isolated project root. */
  readonly projectRoot: string;

  /** Model ID used for context rendering (default: opencode-zen/deepseek-v4-flash-free). */
  readonly model: string;

  /**
   * Simulate one full turn: fires the context hook, then the turn_end hook.
   * Tests verify state changes via getState().
   * Overrides include graphifyStatus for the render context used during hook execution.
   */
  turn(overrides?: {
    model?: string;
    messages?: unknown[];
    graphifyStatus?: CapabilityLevel;
  }): Promise<TurnResult>;

  /**
   * Simulate session compaction: fires session.compacting hook.
   * Returns the survivor context XML and preserved data.
   */
  compact(): Promise<CompactResult>;

  /**
   * Reset state to EMPTY_STATE and fire session_start hooks.
   */
  newSession(): Promise<void>;

  /** Read the current NoesisState. */
  getState(): Readonly<NoesisState>;

  /**
   * Build a context preamble from current state without firing hooks.
   * Useful for verifying preamble content in isolation.
   * Override graphifyStatus to simulate different capability levels.
   */
  buildPreamble(overrides?: {
    model?: string;
    graphifyStatus?: CapabilityLevel;
  }): string;

  /**
   * Invoke a registered tool's execute handler through the mock pi.
   * Returns the tool's result directly for test assertions.
   * Throws if the tool is not registered or has no execute handler.
   */
  toolCall(toolName: string, params: Record<string, unknown>): Promise<unknown>;

  /**
   * Bulk seed n belief facts into state with optional content overrides.
   * Each fact gets a unique id, active status, and the current timestamp.
   */
  addFacts(
    n: number,
    overrides?: Partial<Pick<BeliefFact, "content" | "source" | "confidence" | "tags">>,
  ): Promise<void>;

  /**
   * Bulk seed n graph findings into attention with optional overrides.
   * Each finding gets a unique timestamp.
   */
  addGraphFindings(
    n: number,
    overrides?: Partial<Pick<GraphFinding, "query" | "confidence" | "community">>,
  ): Promise<void>;


  /** Remove the temp project root directory. */
  cleanup(): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an AgentSimulator with an isolated temp project root.
 *
 * The caller SHOULD wrap usage in try/finally and call `cleanup()`.
 * The graphify-client module MUST be mocked before importing this helper
 * (see USAGE above).
 */
export async function createAgentSimulator(options?: AgentSimulatorOptions): Promise<AgentSimulator> {
  const model = options?.model ?? DEFAULT_MODEL;
  const defaultGraphifyStatus = options?.defaultGraphifyStatus ?? "FULL";
  const defaultGraphFreshness = options?.graphFreshness ?? { isStale: false };
  const graphifyVersion = options?.graphifyVersion;
  // Create isolated project root with state directory
  const projectRoot = mkdtempSync(join(import.meta.dirname ?? process.cwd(), ".sim-"));
  mkdirSync(join(projectRoot, ".omp", "noesis"), { recursive: true });

  // Bootstrap runtime
  const pi = createMockPi();
  const stateManager = new StateManager(projectRoot);
  await stateManager.initialize();
  const vaultStore = await createVaultStore(projectRoot);

  const runtime: NoesisRuntime = {
    projectRoot,
    stateManager,
    vaultStore,
    retainToOmp: async () => {},
    attachMemoryRuntime: () => {},
  };

  registerHooks(toExtensionAPI(pi), runtime);
  // Runtime helpers that close over the captured vars
  async function turn(overrides?: { model?: string; messages?: unknown[]; graphifyStatus?: CapabilityLevel }): Promise<TurnResult> {
    const modelId = overrides?.model ?? model;

    const event = {
      messages: overrides?.messages ?? [
        { role: "user", content: [{ type: "text" as const, text: "Hello" }] },
      ],
    };
    const ctx = { model: { id: modelId }, memory: undefined };

    // Fire context hooks (chained: each sees previous hook's output)
    for (const handler of pi._getHooks("context")) {
      const result: unknown = await handler(event, ctx);
      if (result && typeof result === "object" && "messages" in result) {
        const { messages } = result as { messages: unknown };
        if (Array.isArray(messages)) {
          event.messages = messages;
        }
      }
    }

    // Fire turn_end hooks (cleanup, stale-eviction, graph update)
    for (const handler of pi._getHooks("turn_end")) {
      await handler({});
    }

    return { state: stateManager.read() };
  }

  async function compact(): Promise<CompactResult> {
    let survivorContext = "";
    let preserveData: Record<string, unknown> = {};

    for (const handler of pi._getHooks("session.compacting")) {
      const result: unknown = await handler({});
      if (result && typeof result === "object") {
        const record = result as { context?: unknown; preserveData?: unknown };

        if (Array.isArray(record.context) && record.context.length > 0 && typeof record.context[0] === "string") {
          survivorContext = record.context[0];
        }

        // Extract preserved data blob
        if (record.preserveData && typeof record.preserveData === "object") {
          preserveData = record.preserveData as Record<string, unknown>;
        }
      }
    }

    return { survivorContext, preserveData, state: stateManager.read() };
  }

  async function newSession(): Promise<void> {
    // Wipe persisted state so initialize() creates a fresh EMPTY_STATE
    const statePath = join(projectRoot, ".omp", "noesis", "state.json");
    try {
      if (existsSync(statePath)) {
        unlinkSync(statePath);
      }
    } catch {
      // best-effort
    }
    await stateManager.initialize();

    // Fire session_start hooks (graph health check etc.)
    for (const handler of pi._getHooks("session_start")) {
      await handler({});
    }
  }

  function getState(): Readonly<NoesisState> {
    return stateManager.read();
  }

  function buildPreamble(overrides?: { model?: string; graphifyStatus?: CapabilityLevel }): string {
    const state = getState();
    const modelId = overrides?.model ?? model;
    const capabilityLevel = overrides?.graphifyStatus ?? defaultGraphifyStatus;
    const renderContext: RenderContext = {
      capabilityLevel,
      contextHookFired: true,
      modelFamily: detectFamilyFromModel({ id: modelId }),
      graphFreshness: capabilityLevel === "STALE"
        ? { isStale: true, staleHours: 48 }
        : defaultGraphFreshness,
      graphifyVersion,
    };
    return buildPreambleCore(state, renderContext);
  }

  async function toolCall(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    const def = pi._getTool(toolName);
    if (!def) throw new Error(`Tool "${toolName}" not registered`);
    const execute = (def as Record<string, unknown>).execute as ((...args: unknown[]) => Promise<unknown>) | undefined;
    if (!execute) throw new Error(`Tool "${toolName}" has no execute handler`);
    const controller = new AbortController();
    return execute("", params, controller.signal, undefined, {});
  }

  async function addFacts(
    n: number,
    overrides?: Partial<Pick<BeliefFact, "content" | "source" | "confidence" | "tags">>,
  ): Promise<void> {
    const now = new Date().toISOString();
    const newFacts: BeliefFact[] = [];
    for (let i = 0; i < n; i++) {
      newFacts.push({
        id: generateId("bf"),
        content: overrides?.content ?? `Simulated fact ${i + 1}`,
        confidence: overrides?.confidence ?? 0.85,
        source: overrides?.source ?? "execution",
        status: "active",
        createdAt: now,
        updatedAt: now,
        tags: overrides?.tags,
      });
    }
    await stateManager.mutate((s) => {
      s.belief.facts.push(...newFacts);
    });
  }

  async function addGraphFindings(
    n: number,
    overrides?: Partial<Pick<GraphFinding, "query" | "confidence" | "community">>,
  ): Promise<void> {
    const now = new Date().toISOString();
    const newFindings: GraphFinding[] = [];
    for (let i = 0; i < n; i++) {
      newFindings.push({
        query: overrides?.query ?? `test graph query ${i + 1}`,
        nodes: [],
        relations: [],
        confidence: overrides?.confidence ?? "EXTRACTED",
        community: overrides?.community,
        timestamp: now,
      });
    }
    await stateManager.mutate((s) => {
      s.attention.graphFindings.push(...newFindings);
    });
  }

  function cleanup(): void {
    if (existsSync(projectRoot)) {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  }

  return {
    pi,
    runtime,
    projectRoot,
    model,
    turn,
    compact,
    newSession,
    getState,
    buildPreamble,
    toolCall,
    addFacts,
    addGraphFindings,
    cleanup,
  };
}
