"use strict";

/**
 * omp-noesis: Obsidian REST API
 * Version: 1.0.0
 *
 * Lightweight HTTP server for querying noesis vault artifacts as JSON.
 * Delegates all filesystem access to the VaultStore interface.
 *
 * Opt-in: set NOESIS_REST_API=true to enable.
 * Port: 2934 default, configurable via NOESIS_REST_PORT.
 */

import type { VaultStore } from "../vault/vault-store.js";
import { log } from "../shared/logger.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PORT = 2934;
const VALID_KINDS = ["decision", "learning", "belief", "pattern", "session"] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RestApiOptions {
  vaultStore: VaultStore;
  port?: number;
}

export interface RestApiServer {
  stop(): void;
  port: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function isValidKind(kind: string): kind is (typeof VALID_KINDS)[number] {
  return (VALID_KINDS as readonly string[]).includes(kind);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

async function handleRequest(req: Request, vaultStore: VaultStore): Promise<Response> {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);

  // OPTIONS (CORS preflight)
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  // GET /health
  if (segments[0] === "health" && segments.length === 1) {
    const valid = await vaultStore.validate();
    const all = await vaultStore.pull(undefined, 1000);
    return jsonResponse({
      status: valid ? "ok" : "degraded",
      vault: valid,
      artifactCount: all.artifacts.length,
      kinds: [...VALID_KINDS],
    });
  }

  // GET /artifacts/:kind/:id
  if (segments[0] === "artifacts" && segments.length === 3) {
    const kind = segments[1]!;
    const id = segments[2]!;
    if (!isValidKind(kind)) {
      return jsonResponse({ error: `Invalid kind: ${kind}` }, 400);
    }
    const result = await vaultStore.pull(kind, 500);
    const artifact = result.artifacts.find((a) => a.id === id);
    if (!artifact) {
      return jsonResponse({ error: "Not found" }, 404);
    }
    return jsonResponse(artifact);
  }

  // GET /artifacts/:kind
  if (segments[0] === "artifacts" && segments.length === 2) {
    const kind = segments[1]!;
    if (!isValidKind(kind)) {
      return jsonResponse({ error: `Invalid kind: ${kind}` }, 400);
    }
    const result = await vaultStore.pull(kind, 100);
    return jsonResponse({ artifacts: result.artifacts, total: result.artifacts.length });
  }

  // GET /artifacts?kind=...&limit=...
  if (segments[0] === "artifacts" && segments.length === 1) {
    const kind = url.searchParams.get("kind") ?? undefined;
    const limit = parseInt(url.searchParams.get("limit") ?? "100", 10);
    if (kind && !isValidKind(kind)) {
      return jsonResponse({ error: `Invalid kind: ${kind}` }, 400);
    }
    const result = await vaultStore.pull(kind, limit);
    return jsonResponse({ artifacts: result.artifacts, total: result.artifacts.length });
  }

  // GET /search?q=...&kind=...
  if (segments[0] === "search" && segments.length === 1) {
    const q = url.searchParams.get("q");
    if (!q) {
      return jsonResponse({ error: "Missing query parameter: q" }, 400);
    }
    const kind = url.searchParams.get("kind") ?? undefined;
    const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
    const results = await vaultStore.search(q, kind, limit);
    return jsonResponse({ results, total: results.length, query: q });
  }

  return jsonResponse({ error: "Not found" }, 404);
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

/**
 * Start the Obsidian REST API server.
 *
 * Returns null when startup fails (graceful degradation).
 * Only starts when NOESIS_REST_API=true env var is set.
 */
export function startRestApi(options: RestApiOptions): RestApiServer | null {
  if (process.env.NOESIS_REST_API !== "true") {
    return null;
  }

  const port = options.port ?? parseInt(process.env.NOESIS_REST_PORT ?? String(DEFAULT_PORT), 10);

  try {
    const server = Bun.serve({
      port,
      fetch: (req) => handleRequest(req, options.vaultStore),
    });

    log.debug(`[ObsidianRestAPI] Server running on http://localhost:${server.port}`);

    return {
      stop() {
        server.stop();
        log.debug("[ObsidianRestAPI] Server stopped");
      },
      port: server.port ?? DEFAULT_PORT,
    };
  } catch (err) {
    log.warn(
      `[ObsidianRestAPI] Failed to start: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
