"use strict";

/**
 * omp-noesis: Federation Domain
 * Version: 1.0.0
 *
 * Pure functions for multi-agent belief federation — publish, pull,
 * revise, retract, import, initialize, serialize, and parse the
 * canonical ledger.
 */

import type { BeliefFact, BeliefDecision } from "../belief/schema.js";
import { generateId } from "../../shared/schema-base.js";
import type {
  CanonicalLedger,
  LedgerEntry,
} from "./schema.js";
import { emptyLedger, LedgerEntrySchema } from "./schema.js";

// ============================================================================
// PUBLISH — add a belief to the canonical ledger
// ============================================================================

/**
 * Publish a belief (fact or decision) to the canonical ledger.
 * Returns the new ledger entry and appends it to the ledger.
 */
export function publishToLedger(
  ledger: CanonicalLedger,
  agentId: string,
  belief: BeliefFact | BeliefDecision,
  beliefKind: "fact" | "decision",
): LedgerEntry {
  const entry: LedgerEntry = {
    ledgerEntryId: generateId("ld"),
    agentId,
    beliefId: belief.id,
    beliefKind,
    action: "publish",
    content: belief.content,
    confidence: (belief as BeliefFact).confidence,
    epistemicStatus: (belief as BeliefFact).epistemicStatus ?? "speculative",
    timestamp: new Date().toISOString(),
    tags: belief.tags,
  };
  ledger.entries.push(entry);
  return entry;
}

// ============================================================================
// PULL — retrieve beliefs published by other agents
// ============================================================================

/**
 * Pull ledger entries that were published by agents other than `ourAgentId`.
 * Returns entries in insertion order.
 */
export function pullFromLedger(
  ledger: CanonicalLedger,
  ourAgentId: string,
): LedgerEntry[] {
  return ledger.entries.filter((e) => e.agentId !== ourAgentId);
}

// ============================================================================
// REVISE — update a previously published belief
// ============================================================================

/**
 * Revise a previously published ledger entry. Creates a new entry that
 * references the previous one. Returns null if the previous entry is
 * not found or belongs to a different agent.
 */
export function reviseLedgerEntry(
  ledger: CanonicalLedger,
  agentId: string,
  previousEntryId: string,
  updates: {
    content?: string;
    confidence?: number;
    epistemicStatus?: string;
  },
): LedgerEntry | null {
  const prev = ledger.entries.find((e) => e.ledgerEntryId === previousEntryId);
  if (!prev) return null;
  if (prev.agentId !== agentId) return null;

  const entry: LedgerEntry = {
    ledgerEntryId: generateId("ld"),
    agentId,
    beliefId: prev.beliefId,
    beliefKind: prev.beliefKind,
    action: "revise",
    content: updates.content ?? prev.content,
    confidence: updates.confidence ?? prev.confidence,
    epistemicStatus: (updates.epistemicStatus ?? prev.epistemicStatus) as LedgerEntry["epistemicStatus"],
    timestamp: new Date().toISOString(),
    previousLedgerEntryId: previousEntryId,
    tags: prev.tags,
  };
  ledger.entries.push(entry);
  return entry;
}

// ============================================================================
// RETRACT — remove a belief from the federation
// ============================================================================

/**
 * Retract a belief from the ledger. Adds a retraction entry.
 * Returns null if the belief is not found by the same agent.
 */
export function retractFromLedger(
  ledger: CanonicalLedger,
  agentId: string,
  beliefId: string,
): LedgerEntry | null {
  // Find the most recent entry for this belief by this agent
  const prev = [...ledger.entries]
    .reverse()
    .find((e) => e.beliefId === beliefId && e.agentId === agentId);
  if (!prev) return null;

  const entry: LedgerEntry = {
    ledgerEntryId: generateId("ld"),
    agentId,
    beliefId,
    beliefKind: prev.beliefKind,
    action: "retract",
    content: prev.content,
    confidence: prev.confidence,
    epistemicStatus: prev.epistemicStatus,
    timestamp: new Date().toISOString(),
    previousLedgerEntryId: prev.ledgerEntryId,
    tags: prev.tags,
  };
  ledger.entries.push(entry);
  return entry;
}

// ============================================================================
// IMPORT — ingest ledger entries as local beliefs
// ============================================================================

/**
 * Import ledger entries into the belief state. Skips entries that
 * would be duplicates (by beliefId). Returns count of entries imported.
 *
 * @param state  The mutable NoesisState object (must have belief.facts / belief.decisions)
 * @param entries Ledger entries to import
 * @returns Number of entries actually imported
 */
export function importFromLedger(
  state: { belief: { facts: BeliefFact[]; decisions: BeliefDecision[] } },
  entries: LedgerEntry[],
): number {
  let count = 0;
  const existingFactIds = new Set(state.belief.facts.map((f) => f.id));
  const existingDecisionIds = new Set(state.belief.decisions.map((d) => d.id));

  for (const entry of entries) {
    if (entry.action === "retract") {
      // Mark existing imported beliefs as superseded
      for (const fact of state.belief.facts) {
        if (fact.id === entry.beliefId && fact.ledgerEntryId) {
          fact.status = "superseded";
        }
      }
      for (const dec of state.belief.decisions) {
        if (dec.id === entry.beliefId && dec.ledgerEntryId) {
          dec.status = "superseded";
        }
      }
      continue;
    }

    if (entry.beliefKind === "fact" && !existingFactIds.has(entry.beliefId)) {
      const now = new Date().toISOString();
      const fact: BeliefFact = {
        id: entry.beliefId,
        content: entry.content,
        confidence: entry.confidence,
        source: "inference",
        createdAt: now,
        updatedAt: now,
        status: "active",
        epistemicStatus: entry.epistemicStatus,
        scope: "imported",
        revision: 0,
        agentId: entry.agentId,
        ledgerEntryId: entry.ledgerEntryId,
        tags: entry.tags,
        reviewRequired: false,
      };
      state.belief.facts.push(fact);
      existingFactIds.add(entry.beliefId);
      count++;
    } else if (entry.beliefKind === "decision" && !existingDecisionIds.has(entry.beliefId)) {
      const now = new Date().toISOString();
      const dec: BeliefDecision = {
        id: entry.beliefId,
        content: entry.content,
        rationale: `Imported from federation via agent ${entry.agentId}`,
        source: "inference",
        createdAt: now,
        updatedAt: now,
        status: "active",
        scope: "imported",
        revision: 0,
        agentId: entry.agentId,
        ledgerEntryId: entry.ledgerEntryId,
        tags: entry.tags,
      };
      state.belief.decisions.push(dec);
      existingDecisionIds.add(entry.beliefId);
      count++;
    }
  }

  return count;
}

// ============================================================================
// INITIALIZE — create a new ledger for an agent
// ============================================================================

export function initializeLedger(
  agentId: string,
  agentName?: string,
): CanonicalLedger {
  return {
    entries: [],
    agentId,
    agentName: agentName ?? agentId,
  };
}

// ============================================================================
// SERIALIZE / PARSE — persistence helpers
// ============================================================================

/**
 * Serialize the ledger to JSONL (one JSON object per line).
 */
export function serializeLedger(ledger: CanonicalLedger): string {
  const lines = [
    JSON.stringify({ agentId: ledger.agentId, agentName: ledger.agentName }),
  ];
  for (const entry of ledger.entries) {
    lines.push(JSON.stringify(entry));
  }
  return lines.join("\n") + "\n";
}

/**
 * Parse a JSONL string back into a CanonicalLedger.
 * Returns an empty ledger on parse failure.
 */
export function parseLedger(raw: string): CanonicalLedger {
  const ledger = emptyLedger();
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return ledger;

  // First line is the header
  try {
    const header = JSON.parse(lines[0]!);
    if (header && typeof header === "object") {
      const h = header as Record<string, unknown>;
      if (typeof h.agentId === "string") ledger.agentId = h.agentId;
      if (typeof h.agentName === "string") ledger.agentName = h.agentName;
    }
  } catch {
    // If header is not valid JSON, treat whole file as entries
  }

  // Remaining lines are entries
  for (let i = 1; i < lines.length; i++) {
    try {
      const entry = JSON.parse(lines[i]!);
      const parsed = LedgerEntrySchema.parse(entry); // will need import
      ledger.entries.push(parsed);
    } catch {
      // Skip malformed lines
    }
  }

  return ledger;
}
