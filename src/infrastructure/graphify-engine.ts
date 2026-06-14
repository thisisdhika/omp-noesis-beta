import type { BeliefFact, CapabilityLevel } from "../schema.js";
import type { GraphifyClient } from "./graphify-client.js";
import { stderrOrMessage } from "./graphify-client.js";
import { parseQueryOutput } from "./graphify-parser.js";
import { applyStalePenalty } from "../domains/belief/confidence-strategy.js";


export interface SeedBelief {
  content: string;
  confidence: number;
  source: "graph";
  tags: string[];
  communityScope?: string;
  metadata: Record<string, unknown>;
}

export interface PerceptionResult {
  beliefs: SeedBelief[];
  communities: string[];
  godNodes: string[];
  capability: CapabilityLevel;
  staleRecovered: boolean;
  error?: string;
}

// Confidence tier mapping (contract §7)
// EXTRACTED → 1.0 (never penalized)
// INFERRED N.NN → exact tier from this map
const INFERRED_TIERS: Record<number, number> = {
  0.95: 0.95,
  0.85: 0.85,
  0.75: 0.75,
  0.65: 0.65,
  0.55: 0.55,
};

const EXTRACTED_CONFIDENCE = 1.0;

/**
 * Map a raw inferred confidence value to the nearest tier in the
 * INFERRED_TIERS lookup table. Values below the floor tier floor at 0.55.
 */
function mapInferredConfidence(raw: number): number {
  const tiers = Object.keys(INFERRED_TIERS).map(Number).sort((a, b) => b - a);
  for (const tier of tiers) {
    if (raw >= tier) return INFERRED_TIERS[tier]!;
  }
  return 0.55;
}


/**
 * Perceive the graph state by querying Graphify and translating the
 * structured output into SeedBelief entries for the cognitive state.
 *
 * Flow:
 *  1. Check graph capability
 *  2. If STALE, attempt staleRecover()
 *  3. Query Graphify with the given question
 *  4. Parse the output via parseQueryOutput
 *  5. Translate findings → SeedBelief[]
 *     - EXTRACTED → 1.0 (never penalized)
 *     - INFERRED X.XX → exact tier mapping
 *     - AMBIGUOUS → skipped (NOT auto-committed)
 *     - STALE penalty on INFERRED only
 *     - God nodes get +0.05 boost
 *     - Surprising connections get -0.10 deduction (min 0.30)
 *  6. Return PerceptionResult
 */
export async function perceive(graphify: GraphifyClient, question: string): Promise<PerceptionResult> {
  // 1. Check capability
  let capability = graphify.capability;
  let staleRecovered = false;

  // 2. If STALE, auto-recover
  if (capability === "STALE") {
    const newCap = await graphify.staleRecover();
    if (newCap === "FULL") {
      staleRecovered = true;
      capability = "FULL";
    }
  }

  // 3. Query Graphify
  let raw: string;
  try {
    raw = await graphify.query(question);
  } catch (e) {
    return {
      beliefs: [],
      communities: [],
      godNodes: [],
      capability,
      staleRecovered,
      error: stderrOrMessage(e),
    };
  }

  // 4. Parse output
  const findings = parseQueryOutput(raw);

  // 5. Translate findings → SeedBelief[]
  const beliefs: SeedBelief[] = [];

  for (const finding of findings) {
    // Skip AMBIGUOUS — never auto-committed
    if (finding.confidenceLabel === "AMBIGUOUS" || finding.confidence === null) continue;

    let confidence: number;

    if (finding.confidenceLabel === "EXTRACTED") {
      confidence = EXTRACTED_CONFIDENCE;
    } else {
      // INFERRED → map to nearest tier
      confidence = mapInferredConfidence(finding.confidence);
      // STALE penalty on INFERRED only (when graph remained STALE after recovery attempt)
      if (capability === "STALE" && !staleRecovered) {
        confidence = applyStalePenalty(confidence);
      }
    }

    // God nodes get +0.05 boost
    if (finding.isGodNode) {
      confidence = Math.min(1.0, confidence + 0.05);
    }

    // Surprising connections get -0.10 deduction (min 0.50)
    // EXTRACTED findings are never penalized (contract §7)
    if (finding.isSurprising && finding.confidenceLabel !== "EXTRACTED") {
      confidence = Math.max(0.50, confidence - 0.10);
    }

    const tags: string[] = [];
    if (finding.community) tags.push(`community:${finding.community}`);
    if (finding.isGodNode) tags.push("god-node");
    if (finding.isSurprising) tags.push("surprising");
    if (finding.relation) tags.push(`relation:${finding.relation}`);

    beliefs.push({
      content: finding.rawSnippet,
      confidence,
      source: "graph",
      tags,
      communityScope: finding.community,
      metadata: {
        nodeName: finding.nodeName,
        relation: finding.relation ?? null,
        confidenceLabel: finding.confidenceLabel,
      },
    });
  }

  // Extract communities and god nodes from the flat finding array
  const communities = [...new Set(findings.filter(f => f.community).map(f => f.community!))];
  const godNodes = [...new Set(findings.filter(f => f.isGodNode).map(f => f.nodeName))];

  return {
    beliefs,
    communities,
    godNodes,
    capability,
    staleRecovered,
  };
}
