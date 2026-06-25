"use strict";

/**
 * omp-noesis: Session Start Hook
 * Version: 1.1.0
 *
 * Proactively checks graph health at session start, attaches OMP memory
 * runtime, hydrates beliefs from cross-session memory, and kicks off
 * a background graph build/update if the graph is stale or missing.
 * Runs detached so session initialization is not blocked.
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import { tryLifecycleGraphUpdate } from "../infrastructure/graphify-client.js";
import { ReconcileWithGraphUseCase } from "../application/use-cases/reconcile-with-graph.js";
import { HydrateFromMemoryUseCase } from "../application/use-cases/hydrate-from-memory.js";
import { log } from "../shared/logger.js";

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Execute an async step, retrying once on transaction conflict.
 * If the first attempt throws "Transaction conflict", the state is reloaded
 * from disk and the function is retried once. All errors (conflict after
 * retry, or non-conflict) are silently swallowed — best-effort startup.
 */
export async function withConflictRetry<T>(
  label: string,
  fn: () => Promise<T>,
  invalidate: () => Promise<void>,
): Promise<T | undefined> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const isConflict =
        err instanceof Error && err.message.includes("Transaction conflict");
      if (isConflict && attempt === 0) {
        log.debug(`[Noesis] ${label} transaction conflict, reloading state and retrying`);
        await invalidate().catch(() => {});
        continue;
      }
      // Swallow — best-effort startup
      return undefined;
    }
  }
  return undefined;
}

// ============================================================================
// STARTUP SEQUENCE (extracted for testability)
// ============================================================================

/**
 * Run the serialized startup side effects: graph health check, hydration,
 * and reconcile, in order. Each step is wrapped in withConflictRetry for
 * a single retry on transaction conflict.
 * @internal exported for testing
 */
export async function runStartupSequence(runtime: NoesisRuntime): Promise<void> {
  try {
    // 1. Graph health check (with retry on transaction conflict)
    await withConflictRetry(
      "Graph health",
      () => tryLifecycleGraphUpdate(runtime.projectRoot, runtime.stateManager, {
        allowFreshGraph: false,
        fullRebuildOnNoGraph: true,
        timeout: 120000,
      }),
      () => runtime.stateManager.invalidate(),
    );

    // Reload state from disk so next step sees latest persisted state
    await runtime.stateManager.invalidate().catch(() => {});

    // 2. Hydrate beliefs from OMP cross-session memory (with retry)
    await withConflictRetry(
      "Hydrate",
      async () => {
        const uow = runtime.stateManager.createUnitOfWork();
        const useCase = new HydrateFromMemoryUseCase(uow);
        const { imported } = await useCase.execute(runtime);
        if (imported > 0) {
          log.debug(`[Noesis] Hydrated ${imported} beliefs from OMP memory`);
        }
      },
      () => runtime.stateManager.invalidate(),
    );

    // Reload state from disk so next step sees latest persisted state
    await runtime.stateManager.invalidate().catch(() => {});

    // 3. Reconcile beliefs with current graph state (with retry)
    await withConflictRetry(
      "Reconcile",
      async () => {
        const uow = runtime.stateManager.createUnitOfWork();
        const useCase = new ReconcileWithGraphUseCase(uow);
        const result = await useCase.execute(runtime);
        if (result.revisionCount > 0) {
          log.debug(`[Noesis] Graph reconcile: ${result.revisionCount} beliefs revised`);
        }
      },
      () => runtime.stateManager.invalidate(),
    );
  } catch {
    // Best-effort — never block session start
  }
}

// ============================================================================
// HOOK REGISTRATION
// ============================================================================

/**
 * Register the session_start hook that proactively checks and
 * updates the graph in the background during session initialization,
 * and hydrates beliefs from OMP memory when available.
 */
export function registerSessionStartHook(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.on("session_start", async (_event, ctx) => {
    // Attach OMP memory runtime for cross-session sync
    runtime.attachMemoryRuntime?.(ctx?.memory);

    // Log memory backend status
    const status = await runtime.getMemoryStatus?.();
    if (status) {
      log.debug(`[Noesis] OMP memory backend: ${status.backend} (searchable=${status.searchable}, writable=${status.writable})`);
    }

    // --- Serialized startup side effects ---
    // Run graph health, hydration, and reconcile sequentially so they
    // do not open concurrent UnitOfWorks and cause transaction conflicts.
    // withConflictRetry handles cross-process staleness by reloading
    // and retrying once on transaction conflict.
    void runStartupSequence(runtime);
  });
}
