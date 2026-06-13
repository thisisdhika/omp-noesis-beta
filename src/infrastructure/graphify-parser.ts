import type { GraphFinding } from "../schema.js";

export function parseQueryOutput(raw: string): GraphFinding[] {
  const findings: GraphFinding[] = [];
  const lines = raw.split("\n");

  let currentCommunity: string | undefined;
  let inGodNodesSection = false;
  let inSurprisingSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detect sections
    if (/community/i.test(trimmed)) {
      const match = trimmed.match(/community[:\s]+(.+)/i);
      if (match?.[1]) currentCommunity = match[1].trim();
      continue;
    }
    if (/god\s*nodes?/i.test(trimmed)) { inGodNodesSection = true; inSurprisingSection = false; continue; }
    if (/surprising\s*connections?/i.test(trimmed)) { inSurprisingSection = true; inGodNodesSection = false; continue; }
    if (/^(results?|nodes?|relations?|edges?|finding|summary)/i.test(trimmed)) {
      inGodNodesSection = false;
      inSurprisingSection = false;
      continue;
    }

    // Extract confidence label
    let confidence: number | null = null;
    let confidenceLabel = "unknown";
    const extractedMatch = trimmed.match(/\bEXTRACTED\b/i);
    const inferredMatch = trimmed.match(/\bINFERRED\s+([\d.]+)/i);
    const ambiguousMatch = trimmed.match(/\bAMBIGUOUS\b/i);

    if (extractedMatch) { confidence = 1.0; confidenceLabel = "EXTRACTED"; }
    else if (inferredMatch?.[1]) { confidence = parseFloat(inferredMatch[1]); confidenceLabel = `INFERRED ${inferredMatch[1]}`; }
    else if (ambiguousMatch) { confidence = null; confidenceLabel = "AMBIGUOUS"; }

    // Extract relation keywords
    let relation: string | undefined;
    const relMatch = trimmed.match(/\b(calls?|imports?|depends?\s*on|implements?|extends?|uses?|contains?|exports?)\b/i);
    if (relMatch?.[1]) relation = relMatch[1].toLowerCase();

    // Extract node names (PascalCase or camelCase identifiers)
    const nodeMatches = trimmed.match(/\b([A-Z][a-zA-Z0-9]*(?:\.[A-Z][a-zA-Z0-9]*)*)\b/g)
      ?? trimmed.match(/\b([a-z][a-zA-Z0-9]+)\b/g) ?? [];

    // Create a finding for this line
    findings.push({
      nodeName: nodeMatches[0] ?? trimmed.slice(0, 50),
      relation,
      confidence,
      confidenceLabel,
      community: currentCommunity,
      isGodNode: inGodNodesSection,
      isSurprising: inSurprisingSection,
      rawSnippet: trimmed,
    });
  }

  return findings;
}
