"use strict";

/**
 * omp-noesis: Graphify Engine
 * Version: 0.1.0
 *
 * Enriches raw graph findings with inferred confidence scores and
 * community cluster tags, and converts them into belief candidates
 * suitable for ingestion into the belief layer.
 */

import type { GraphFinding } from "../schema.js";
import { mapGraphConfidence } from "../domains/belief/confidence-strategy.js";

// ============================================================================
// FINDING ENRICHMENT
// ============================================================================

/**
 * Enrich an array of graph findings with additional metadata.
 *
 * For each finding:
 *   - Sets `inferredConfidence` using the confidence-strategy mapping
 *     (EXTRACTED → 0.9, INFERRED → 0.7, AMBIGUOUS → 0.55; overridable
 *     by an existing `inferredConfidence` on the finding via `Math.max`).
 *   - Tags the finding with a community cluster label derived from the
 *     first godNode, if godNodes are present.
 *
 * The enrichment creates shallow copies — the original array is not mutated.
 *
 * @param findings - Raw findings from graphify-parser.
 * @returns Enriched findings with `inferredConfidence` and optional `community`.
 */
export function enrichFindings(findings: GraphFinding[]): GraphFinding[] {
  return findings.map((finding) => {
    const enriched = { ...finding };
    enriched.inferredConfidence = mapGraphConfidence(finding);

    if (finding.godNodes && finding.godNodes.length > 0) {
      enriched.community = finding.godNodes[0];
    }

    return enriched;
  });
}

// ============================================================================
// BELIEF CANDIDATE CONVERSION
// ============================================================================

/**
 * Shape of a belief candidate produced by {@link toBeliefCandidates}.
 */
export interface BeliefCandidate {
  content: string;
  confidence: number;
  source: "graph";
  evidence: string;
}

/**
 * Convert graph findings into belief candidates.
 *
 * Only findings whose numeric confidence meets or exceeds the threshold
 * (default 0.7) are included.  The effective confidence is taken from
 * `inferredConfidence` (if present) or computed via `mapGraphConfidence`.
 *
 * Each candidate's `evidence` is the JSON serialisation of the finding's
 * node list, providing full traceability back to the graph.
 *
 * @param findings - Graph findings (enriched or raw).
 * @param minConfidence - Minimum confidence threshold (default 0.7).
 * @returns Array of belief candidates ready for belief-layer ingestion.
 */
export function toBeliefCandidates(
  findings: GraphFinding[],
  minConfidence: number = 0.7,
): BeliefCandidate[] {
  const candidates: BeliefCandidate[] = [];

  for (const finding of findings) {
    const confidence =
      finding.inferredConfidence ?? mapGraphConfidence(finding);

    if (confidence < minConfidence) continue;

    candidates.push({
      content: finding.query,
      confidence,
      source: "graph",
      evidence: JSON.stringify(finding.nodes),
    });
  }

  return candidates;
}
