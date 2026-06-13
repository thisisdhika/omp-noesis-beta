import type { BeliefFact } from "../../schema.js";

const STALE_TIERS: [number, number][] = [
  [1.0, 1.0],
  [0.95, 0.85],
  [0.85, 0.75],
  [0.75, 0.65],
  [0.65, 0.55],
  [0.55, 0.55],
];

export function translateGraphConfidence(
  label: string,
  inferredValue?: number,
): number | null {
  switch (label) {
    case "EXTRACTED":
      return 1.0;
    case "INFERRED":
      if (
        inferredValue === 0.55 ||
        inferredValue === 0.65 ||
        inferredValue === 0.75 ||
        inferredValue === 0.85 ||
        inferredValue === 0.95
      ) {
        return inferredValue;
      }
      return null;
    case "AMBIGUOUS":
      return null;
    default:
      return null;
  }
}

export function applyStalePenalty(confidence: number): number {
  for (const [tierInput, tierOutput] of STALE_TIERS) {
    if (confidence >= tierInput) {
      return tierOutput;
    }
  }
  return 0.55;
}

export function isPreambleEligible(fact: BeliefFact): boolean {
  return fact.confidence >= 0.75 && fact.status === "active";
}
