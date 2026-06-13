import { truncate } from "../../shared/text.js";
import { nowISO } from "../../shared/time.js";
import type { GraphFinding, NoesisState } from "../../schema.js";

function transientAttention(s: NoesisState) {
  return s.attention;
}

export function setFocus(s: NoesisState, focus: string): void {
  s.attention.focus = truncate(focus, 200);
  s.attention.updatedAt = nowISO();
}

export function setGraphQueries(s: NoesisState, queries: string[]): void {
  s.attention.graphQueries = queries.slice(0, 5).map((q) => truncate(q, 200));
}

export function setFiles(s: NoesisState, files: string[]): void {
  s.attention.files = files.slice(0, 10);
}

export function storeGraphFindings(s: NoesisState, findings: GraphFinding[]): void {
  transientAttention(s).graphFindings = findings;
}

export function clearGraphFindings(s: NoesisState): void {
  delete transientAttention(s).graphFindings;
}
