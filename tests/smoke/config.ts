"use strict";

/**
 * Smoke test configuration constants.
 *
 * All paths reference the experimental workspace where noesis state is
 * persisted and OMP agent sessions are created.
 */

import { tmpdir } from "node:os";
import { join } from "node:path";

export const WORKDIR =
  process.env.SMOKE_WORKDIR || join(tmpdir(), "omp-noesis-smoke-" + Date.now());

export const MODEL = "commandcode/deepseek/deepseek-v4-pro:off";

export const STATE_PATH = join(WORKDIR, ".omp", "noesis", "state.json");

/** Hard timeout for the overall agent prompt call (2 minutes). */
export const TIMEOUT_MS = 120_000;

/** How long to wait for a specific tool to finish (30 seconds). */
export const PROMPT_TIMEOUT_MS = 30_000;
