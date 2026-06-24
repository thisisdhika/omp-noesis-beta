"use strict";

/**
 * Cross-Source Parity Behavioral Tests
 *
 * Verifies OMP memory bidirectional sync:
 * - Hydration (read path): additive, dedup, confidence cap, context parsing
 * - Bridge (write path): fact/decision bridging, standalone operation
 * - Graceful degradation: search failure does not propagate
 *
 * Key contracts:
 * - state.json is always authoritative
 * - OMP memory hydration is additive (only adds missing, never removes)
 * - When OMP memory is off, noesis works 100% standalone
 * - Dedup by content hash across sources
 * - Bridge from noesis to OMP memory uses [noesis/belief] and [noesis/decision] prefixes
 * - Hydration confidence capped at 0.75
 */

import { describe, it, expect, mock } from "bun:test";
import { createTempDir } from "../helpers/temp-dir.js";
import { StateManager } from "../../src/infrastructure/state-manager.js";
import { HydrateFromMemoryUseCase } from "../../src/application/use-cases/hydrate-from-memory.js";
import { executeBelieveFact, executeBelieveDecision } from "../../src/tools/believe-tool.js";
import { mapConfidenceToImportance } from "../../src/runtime.js";
import { contentHash, generateId } from "../../src/shared/schema-base.js";
import { addFact } from "../../src/domains/belief/belief-domain.js";
import { EMPTY_STATE } from "../../src/shared/schema.js";
import type { NoesisRuntime, MemoryRetainItem, MemoryStatus } from "../../src/runtime.js";
import type { NoesisState } from "../../src/shared/schema.js";
import type { MemoryBackendSearchItem } from "@oh-my-pi/pi-coding-agent/memory-backend/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** MemoryBackendSearchItem doesn't carry context in its type, but the
 *  runtime's save path stores it and the hydration use case reads it.
 *  We extend the type so tests can provide context for parseContext. */
type SearchItemWithContext = MemoryBackendSearchItem & { context?: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock NoesisRuntime configured for hydration (search + status). */
function createHydrationRuntime(
  stateManager: StateManager,
  beliefItems: SearchItemWithContext[],
  decisionItems: SearchItemWithContext[],
): NoesisRuntime {
  const searchFromOmp = mock(async (query: string) => {
    if (query === "[noesis/belief]") return beliefItems as MemoryBackendSearchItem[];
    if (query === "[noesis/decision]") return decisionItems as MemoryBackendSearchItem[];
    return [];
  });
  const getMemoryStatus = mock(async (): Promise<MemoryStatus> => ({
    backend: "test",
    searchable: true,
    writable: true,
  }));
  const vaultStore = { push: mock(() => Promise.resolve()) };

  return { stateManager, vaultStore, searchFromOmp, getMemoryStatus } as unknown as NoesisRuntime;
}


/** Create a NoesisRuntime with NO memory runtime (standalone). */
function createStandaloneRuntime(stateManager: StateManager): NoesisRuntime {
  const vaultStore = { push: mock(() => Promise.resolve()) };

  return {
    stateManager,
    vaultStore,
    // No retainToOmp, no searchFromOmp, no getMemoryStatus
  } as unknown as NoesisRuntime;
}

// ---------------------------------------------------------------------------
// Tests — OMP memory hydration (read path)
// ---------------------------------------------------------------------------

describe("OMP memory hydration", () => {
  it("hydration is additive — preserves existing beliefs and adds new ones", async () => {
    const tmp = createTempDir();
    try {
      const stateManager = new StateManager(tmp.path);
      await stateManager.initialize();

      // Add an existing belief to the state
      await stateManager.mutate((s: NoesisState) => {
        addFact(s, {
          content: "Existing belief",
          confidence: 0.8,
          source: "execution",
        });
      });

      const stateBefore = stateManager.read();
      expect(stateBefore.belief.facts).toHaveLength(1);

      // Create hydration use case
      const uow = stateManager.createUnitOfWork();
      const useCase = new HydrateFromMemoryUseCase(uow);

      const runtime = createHydrationRuntime(stateManager, [
        { content: "[noesis/belief] New belief from OMP" },
      ], []);

      const result = await useCase.execute(runtime);
      expect(result.imported).toBe(1);

      const state = stateManager.read();
      expect(state.belief.facts).toHaveLength(2);

      const contents = state.belief.facts.map((f) => f.content);
      expect(contents).toContain("Existing belief");
      expect(contents).toContain("New belief from OMP");

      // Existing belief is unchanged (same content, same confidence)
      const existing = state.belief.facts.find((f) => f.content === "Existing belief");
      expect(existing).toBeDefined();
      expect(existing!.confidence).toBe(0.8);
    } finally {
      tmp.cleanup();
    }
  });

  it("deduplicates by content hash across sources", async () => {
    const tmp = createTempDir();
    try {
      const stateManager = new StateManager(tmp.path);
      await stateManager.initialize();

      // Add an existing belief that matches the OMP entry
      await stateManager.mutate((s: NoesisState) => {
        addFact(s, {
          content: "Duplicate belief",
          confidence: 0.7,
          source: "user",
        });
      });

      const stateBefore = stateManager.read();
      expect(stateBefore.belief.facts).toHaveLength(1);

      // Create hydration use case — OMP memory returns the SAME content
      const uow = stateManager.createUnitOfWork();
      const useCase = new HydrateFromMemoryUseCase(uow);

      const runtime = createHydrationRuntime(stateManager, [
        { content: "[noesis/belief] Duplicate belief" },
      ], []);

      const result = await useCase.execute(runtime);
      // Should be skipped (dedup)
      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(1);

      const state = stateManager.read();
      // Still only one fact (not duplicated)
      expect(state.belief.facts).toHaveLength(1);
      expect(state.belief.facts[0]!.content).toBe("Duplicate belief");
      // Original unchanged
      expect(state.belief.facts[0]!.confidence).toBe(0.7);
    } finally {
      tmp.cleanup();
    }
  });

  it("caps hydration confidence at 0.75", async () => {
    const tmp = createTempDir();
    try {
      const stateManager = new StateManager(tmp.path);
      await stateManager.initialize();

      const uow = stateManager.createUnitOfWork();
      const useCase = new HydrateFromMemoryUseCase(uow);

      // Entry with confidence 0.95
      const runtime = createHydrationRuntime(stateManager, [
        {
          content: "[noesis/belief] High confidence belief",
          context: "confidence: 0.95",
        },
      ], []);

      const result = await useCase.execute(runtime);
      expect(result.imported).toBe(1);

      const state = stateManager.read();
      const imported = state.belief.facts.find((f) => f.content === "High confidence belief");
      expect(imported).toBeDefined();
      // Capped at 0.75
      expect(imported!.confidence).toBe(0.75);
    } finally {
      tmp.cleanup();
    }
  });

  it("parses structured context from OMP memory entries", async () => {
    const tmp = createTempDir();
    try {
      const stateManager = new StateManager(tmp.path);
      await stateManager.initialize();

      const uow = stateManager.createUnitOfWork();
      const useCase = new HydrateFromMemoryUseCase(uow);

      // Entry with full structured context
      const runtime = createHydrationRuntime(stateManager, [
        {
          content: "[noesis/belief] Context-rich belief",
          context: "id: test-123, confidence: 0.8, source: execution, tags: test, important",
        },
      ], []);

      const result = await useCase.execute(runtime);
      expect(result.imported).toBe(1);

      const state = stateManager.read();
      const imported = state.belief.facts.find((f) => f.content === "Context-rich belief");
      expect(imported).toBeDefined();

      // Generated id (not from context — use case generates a new one)
      expect(imported!.id).toMatch(/^bf-/);
      expect(imported!.id).not.toBe("bf-test-123"); // not using the parsed id

      // Confidence capped at 0.75 (from 0.8)
      expect(imported!.confidence).toBe(0.75);

      // Source always set to "omp-memory" for hydrated entries
      expect(imported!.source).toBe("omp-memory");

      // Tags parsed from context
      expect(imported!.tags).toEqual(["test", "important"]);
    } finally {
      tmp.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// Tests — OMP memory bridge (write path)
// ---------------------------------------------------------------------------

describe("OMP memory bridge", () => {
  it("bridges a belief fact to OMP memory via retainToOmp", async () => {
    const tmp = createTempDir();
    try {
      const stateManager = new StateManager(tmp.path);
      await stateManager.initialize();

      const retainToOmp = mock(async (_items: MemoryRetainItem[]) => {});
      const vaultStore = { push: mock(() => Promise.resolve()) };

      const runtime = { projectRoot: tmp.path, stateManager, vaultStore, retainToOmp } as unknown as NoesisRuntime;

      await executeBelieveFact(runtime, {
        content: "Bridged belief",
        confidence: 0.8,
        source: "execution",
      });

      // retainToOmp should have been called once
      expect(retainToOmp).toHaveBeenCalledTimes(1);

      const callArgs = retainToOmp.mock.calls[0]![0] as MemoryRetainItem[];
      expect(callArgs).toHaveLength(1);

      // Content includes [noesis/belief] prefix
      expect(callArgs[0]!.content).toContain("[noesis/belief]");
      expect(callArgs[0]!.content).toContain("Bridged belief");
      // Importance derived from confidence: 0.8 → mapConfidenceToImportance(0.8) = 0.5
      expect(callArgs[0]!.importance).toBe(mapConfidenceToImportance(0.8));
    } finally {
      tmp.cleanup();
    }
  });

  it("bridges a belief decision to OMP memory via retainToOmp", async () => {
    const tmp = createTempDir();
    try {
      const stateManager = new StateManager(tmp.path);
      await stateManager.initialize();

      const retainToOmp = mock(async (_items: MemoryRetainItem[]) => {});
      const vaultStore = { push: mock(() => Promise.resolve()) };

      const runtime = { projectRoot: tmp.path, stateManager, vaultStore, retainToOmp } as unknown as NoesisRuntime;

      await executeBelieveDecision(runtime, {
        content: "Bridged decision",
        rationale: "Because",
        source: "user",
      });

      // retainToOmp should have been called once
      expect(retainToOmp).toHaveBeenCalledTimes(1);

      const callArgs = retainToOmp.mock.calls[0]![0] as MemoryRetainItem[];

      // Content includes [noesis/decision] prefix
      expect(callArgs[0]!.content).toContain("[noesis/decision]");
      expect(callArgs[0]!.content).toContain("Bridged decision");
    } finally {
      tmp.cleanup();
    }
  });

  it("works standalone without OMP memory (no retainToOmp)", async () => {
    const tmp = createTempDir();
    try {
      const stateManager = new StateManager(tmp.path);
      await stateManager.initialize();

      const runtime = createStandaloneRuntime(stateManager);

      // Should succeed without error even though there's no memory runtime
      const result = await executeBelieveFact(runtime, {
        content: "Standalone belief",
        confidence: 0.8,
        source: "execution",
      });

      expect(result.isError).toBe(false);

      // Fact created in state
      const state = stateManager.read();
      const fact = state.belief.facts.find((f) => f.content === "Standalone belief");
      expect(fact).toBeDefined();
    } finally {
      tmp.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// Tests — Graceful degradation
// ---------------------------------------------------------------------------

describe("Graceful degradation", () => {
  it("handles OMP memory search failure without throwing", async () => {
    const tmp = createTempDir();
    try {
      const stateManager = new StateManager(tmp.path);
      await stateManager.initialize();

      // Add an existing belief to verify it remains unchanged
      await stateManager.mutate((s: NoesisState) => {
        addFact(s, {
          content: "Surviving belief",
          confidence: 0.9,
          source: "user",
        });
      });
      const existingCount = stateManager.read().belief.facts.length;

      const uow = stateManager.createUnitOfWork();
      const useCase = new HydrateFromMemoryUseCase(uow);

      // Simulate the runtime's searchFromOmp wrapper: catches errors and returns []
      // (same behavior as createRuntime's searchFromOmp implementation)
      const searchFromOmp = mock(async (_query: string): Promise<MemoryBackendSearchItem[]> => {
        // The underlying memory runtime threw; the runtime wrapper caught it and returns []
        return [];
      });
      const getMemoryStatus = mock(async (): Promise<MemoryStatus> => ({
        backend: "test",
        searchable: true,
        writable: true,
      }));

      const runtime = {
        stateManager,
        vaultStore: { push: mock(() => Promise.resolve()) },
        searchFromOmp,
        getMemoryStatus,
      } as unknown as NoesisRuntime;

      // Must NOT throw — graceful degradation
      const result = await useCase.execute(runtime);
      expect(searchFromOmp).toHaveBeenCalled();
      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(0);

      // State is unchanged
      const state = stateManager.read();
      expect(state.belief.facts).toHaveLength(existingCount);
      expect(state.belief.facts[0]!.content).toBe("Surviving belief");

    } finally {
      tmp.cleanup();
    }
  });

  it("gracefully skips hydration when memory backend is not searchable", async () => {
    const tmp = createTempDir();
    try {
      const stateManager = new StateManager(tmp.path);
      await stateManager.initialize();

      await stateManager.mutate((s: NoesisState) => {
        addFact(s, {
          content: "Existing in standalone",
          confidence: 0.8,
          source: "execution",
        });
      });

      const uow = stateManager.createUnitOfWork();
      const useCase = new HydrateFromMemoryUseCase(uow);

      // Memory exists but is not searchable
      const getMemoryStatus = mock(async (): Promise<MemoryStatus> => ({
        backend: "local",
        searchable: false,
        writable: true,
      }));

      const runtime = {
        stateManager,
        vaultStore: { push: mock(() => Promise.resolve()) },
        getMemoryStatus,
        // No searchFromOmp — won't be called since status.searchable is false
      } as unknown as NoesisRuntime;

      const result = await useCase.execute(runtime);
      // Skipped because not searchable
      expect(result.imported).toBe(0);
      expect(result.status.searchable).toBe(false);

      // State unchanged
      const state = stateManager.read();
      expect(state.belief.facts).toHaveLength(1);
      expect(state.belief.facts[0]!.content).toBe("Existing in standalone");
    } finally {
      tmp.cleanup();
    }
  });

  it("gracefully handles missing memory status (getMemoryStatus undefined)", async () => {
    const tmp = createTempDir();
    try {
      const stateManager = new StateManager(tmp.path);
      await stateManager.initialize();

      const uow = stateManager.createUnitOfWork();
      const useCase = new HydrateFromMemoryUseCase(uow);

      // No getMemoryStatus — use case falls back to off defaults
      const runtime = {
        stateManager,
        vaultStore: { push: mock(() => Promise.resolve()) },
        // getMemoryStatus intentionally omitted
      } as unknown as NoesisRuntime;

      // Must NOT throw
      const result = await useCase.execute(runtime);

      // Falls back to off defaults, returns 0 import
      expect(result.imported).toBe(0);
      expect(result.status.searchable).toBe(false);
      expect(result.status.backend).toBe("off");
    } finally {
      tmp.cleanup();
    }
  });
});
