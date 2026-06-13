import type { GraphFinding, BeliefFact } from "../schema.js";
import { translateGraphConfidence, applyStalePenalty } from "../domains/belief/confidence-strategy.js";
import { generateId } from "../shared/ids.js";
import { nowISO } from "../shared/time.js";

export function findingsToBeliefs(findings: GraphFinding[], isStale: boolean): BeliefFact[] {
  const beliefs: BeliefFact[] = [];
  const now = nowISO();

  for (const finding of findings) {
    let confidence = translateGraphConfidence(finding.confidenceLabel, finding.confidence ?? undefined);
    if (confidence === null) continue; // AMBIGUOUS → skip

    if (isStale) {
      confidence = applyStalePenalty(confidence);
    }

    const tags: string[] = [];
    if (finding.community) tags.push(finding.community);
    if (finding.nodeName) tags.push(finding.nodeName.toLowerCase());

    beliefs.push({
      id: generateId("bf"),
      content: `[${finding.confidenceLabel}] ${finding.nodeName}${finding.relation ? ` ${finding.relation}` : ""}: ${finding.rawSnippet}`,
      confidence,
      source: "graph",
      createdAt: now,
      updatedAt: now,
      status: "active",
      tags,
      communityScope: finding.community,
    });
  }

  return beliefs;
}
