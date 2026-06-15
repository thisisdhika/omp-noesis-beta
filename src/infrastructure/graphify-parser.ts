"use strict";

/**
 * omp-noesis: Graphify Parser
 * Version: 0.1.0
 *
 * Parses raw JSON output from the `graphify query` CLI into typed
 * GraphFinding objects, handling multiple output formats and legacy
 * key names for backward compatibility.
 */

import type { GraphFinding, GraphConfidence } from "../schema.js";
import { now } from "../shared/time.js";

// ============================================================================
// TYPES
// ============================================================================

/**
 * CLI output shape wrapping results in a `results` array.
 */
interface ResultsOutput {
  results: Array<Record<string, unknown>>;
}

/**
 * CLI output shape with a `findings` array under a top-level query context.
 */
interface FindingsOutput {
  query?: string;
  findings: Array<Record<string, unknown>>;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Normalise a raw confidence string to the GraphConfidence union type.
 *
 * Accepts lowercase or uppercase values; unknown values fall back to
 * "AMBIGUOUS" so callers never receive an invalid enum value.
 *
 * @param value - Raw confidence string from the CLI.
 * @returns Normalised GraphConfidence.
 */
function toGraphConfidence(value: string): GraphConfidence {
  const upper = value.toUpperCase();
  if (upper === "EXTRACTED" || upper === "INFERRED" || upper === "AMBIGUOUS") {
    return upper;
  }
  return "AMBIGUOUS";
}

/**
 * Extract relation strings from a raw finding record.
 *
 * Preference order: `edges` → `links` → `relations`.  Edges and links
 * are serialised as `"source→target"` strings.  If none of these keys
 * exist an empty array is returned.
 *
 * @param raw - A single raw finding object from the CLI.
 * @returns Array of relation descriptors.
 */
function extractRelations(raw: Record<string, unknown>): string[] {
  if (Array.isArray(raw.edges)) {
    return raw.edges.map((e: unknown) => {
      if (typeof e === "string") return e;
      const edge = e as { source?: string; target?: string };
      return `${edge.source ?? "?"}→${edge.target ?? "?"}`;
    });
  }

  if (Array.isArray(raw.links)) {
    return raw.links.map((l: unknown) => {
      if (typeof l === "string") return l;
      const link = l as { source?: string; target?: string };
      return `${link.source ?? "?"}→${link.target ?? "?"}`;
    });
  }

  if (Array.isArray(raw.relations)) {
    return raw.relations as string[];
  }

  return [];
}

// ============================================================================
// PARSER
// ============================================================================

/**
 * Parse raw stdout from the `graphify query` CLI into a typed array of
 * GraphFinding objects.
 *
 * Supports two output shapes:
 *   - `{ results: [...] }` — bare array of result objects
 *   - `{ query: "...", findings: [...] }` — findings under a shared query
 *
 * Each finding's `relations` field is populated from `edges` (preferred),
 * `links` (legacy fallback), or `relations` (direct string list) by
 * serialising edge tuples as `"source→target"` strings.
 *
 * A stable `timestamp` string is applied to every output finding so
 * downstream consumers can reason about freshness.
 *
 * @param raw - Raw stdout string from the CLI.
 * @returns Array of validated GraphFinding objects (empty on parse failure).
 */
export function parseQueryOutput(raw: string): GraphFinding[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (typeof parsed !== "object" || parsed === null) return [];

  const root = parsed as Record<string, unknown>;
  const items: Array<Record<string, unknown>> = [];

  if (Array.isArray(root.results)) {
    // Shape: { results: [...] }
    for (const result of root.results) {
      if (typeof result === "object" && result !== null) {
        items.push(result as Record<string, unknown>);
      }
    }
  } else if (Array.isArray(root.findings)) {
    // Shape: { query: "...", findings: [...] }
    const topQuery =
      typeof root.query === "string" ? root.query : undefined;
    for (const f of root.findings) {
      if (typeof f !== "object" || f === null) continue;
      const record = f as Record<string, unknown>;
      if (!record.query && topQuery) {
        record.query = topQuery;
      }
      items.push(record);
    }
  }

  const timestamp = now();

  return items.map((item): GraphFinding => ({
    query: typeof item.query === "string" ? item.query : "",
    nodes: Array.isArray(item.nodes) ? (item.nodes as string[]) : [],
    relations: extractRelations(item),
    confidence: toGraphConfidence(
      typeof item.confidence === "string" ? item.confidence : "AMBIGUOUS",
    ),
    timestamp,
  }));
}
