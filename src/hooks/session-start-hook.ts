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
import { HydrateFromMemoryUseCase } from "../application/use-cases/hydrate-from-memory.js";

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
      console.log(`[Noesis] OMP memory backend: ${status.backend} (searchable=${status.searchable}, writable=${status.writable})`);
    }

    // Graph health check (existing behavior)
    try {
      await tryLifecycleGraphUpdate(runtime.projectRoot, runtime.stateManager, {
        allowFreshGraph: false,
        fullRebuildOnNoGraph: true,
        timeout: 120000,
      });
    } catch {
      // Best-effort — don't block session start
    }

    // Hydrate beliefs from OMP memory
    try {
      const uow = runtime.stateManager.createUnitOfWork();
      const useCase = new HydrateFromMemoryUseCase(uow);
      const { imported } = await useCase.execute(runtime);
      if (imported > 0) {
        console.log(`[Noesis] Hydrated ${imported} beliefs from OMP memory`);
      }
    } catch {
      // Best-effort — never block session start on hydration failure
    }
  });
}
