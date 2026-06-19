"use strict";

/**
 * omp-noesis: Graphify Parser
 * Version: 0.1.0
 *
 * Parses raw JSON output from the `graphify query` CLI into typed
 * GraphFinding objects, handling multiple output formats and legacy
 * key names for backward compatibility.
 */

import type { GraphFinding, GraphConfidence } from "../shared/schema.js";
import { now } from "../shared/time.js";

/** Narrow an unknown value to a record with string keys. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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
 * Preference order: `edges` → `relations`.  Edges
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
      if (!isRecord(e)) return "?→?";
      return `${String(e.source ?? "?")}→${String(e.target ?? "?")}`;
    });
  }


  if (Array.isArray(raw.links)) {
    return raw.links.map((e: unknown) => {
      if (typeof e === "string") return e;
      if (!isRecord(e)) return "?→?";
      return `${String(e.source ?? "?")}→${String(e.target ?? "?")}`;
    });
  }

  if (Array.isArray(raw.relations)) {
    return raw.relations.filter((r): r is string => typeof r === "string");
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
  if (!isRecord(parsed)) return [];

  const items: Array<Record<string, unknown>> = [];

  if (Array.isArray(parsed.results)) {
    // Shape: { results: [...] }
    for (const result of parsed.results) {
      if (isRecord(result)) {
        items.push(result);
      }
    }
  } else if (Array.isArray(parsed.findings)) {
    // Shape: { query: "...", findings: [...] }
    const topQuery =
      typeof parsed.query === "string" ? parsed.query : undefined;
    for (const f of parsed.findings) {
      if (!isRecord(f)) continue;
      if (!f.query && topQuery) {
        f.query = topQuery;
      }
      items.push(f);
    }
  }

  const timestamp = now();

  return items.map((item): GraphFinding => {
    const finding: GraphFinding = {
      query: typeof item.query === "string" ? item.query : "",
      nodes: Array.isArray(item.nodes) ? item.nodes.filter((n): n is string => typeof n === "string") : [],
      relations: extractRelations(item),
      confidence: toGraphConfidence(
        typeof item.confidence === "string" ? item.confidence : "AMBIGUOUS",
      ),
      timestamp,
    };

    // Extract optional fields if present
    if (typeof item.inferredConfidence === "number" && item.inferredConfidence >= 0.55 && item.inferredConfidence <= 0.95) {
      finding.inferredConfidence = item.inferredConfidence;
    }
    if (typeof item.community === "string") {
      finding.community = item.community;
    }
    if (Array.isArray(item.godNodes)) {
      finding.godNodes = item.godNodes.filter((n): n is string => typeof n === "string");
    }
    if (Array.isArray(item.surprisingConnections)) {
      finding.surprisingConnections = item.surprisingConnections.filter((n): n is string => typeof n === "string");
    }
    if (typeof item.rawOutput === "string") {
      finding.rawOutput = item.rawOutput;
    }

    return finding;
  });
}
