"use strict";

/**
 * omp-noesis: Federation Schema
 * Version: 1.0.0
 *
 * Schemas for multi-agent belief federation — the canonical ledger,
 * agent identities, and ledger entry types.
 */

import { z } from "zod";

// ============================================================================
// AGENT IDENTITY
// ============================================================================

export const AgentIdentitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  capabilities: z.array(z.string()).optional(),
  publicKey: z.string().optional(), // for future signed messages
});
export type AgentIdentity = z.infer<typeof AgentIdentitySchema>;

// ============================================================================
// LEDGER ENTRY
// ============================================================================

export const LedgerEntrySchema = z.object({
  ledgerEntryId: z.string().regex(/^ld-[a-z0-9-]+$/),
  agentId: z.string(),
  beliefId: z.string(),          // the belief fact or decision ID
  beliefKind: z.enum(["fact", "decision"]),
  action: z.enum(["publish", "revise", "retract"]),
  content: z.string().max(1000),
  confidence: z.number().min(0).max(1),
  epistemicStatus: z.enum(["certain", "probable", "speculative", "deprecated", "contradicted"]),
  timestamp: z.string().datetime(),
  previousLedgerEntryId: z.string().optional(), // for revisions
  tags: z.array(z.string().max(50)).max(10).optional(),
});
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

// ============================================================================
// CANONICAL LEDGER
// ============================================================================

export const CanonicalLedgerSchema = z.object({
  entries: z.array(LedgerEntrySchema),
  agentId: z.string().optional(),  // this agent's identity
  agentName: z.string().optional(),
});
export type CanonicalLedger = z.infer<typeof CanonicalLedgerSchema>;

// ============================================================================
// EMPTY LEDGER FACTORY
// ============================================================================

export function emptyLedger(): CanonicalLedger {
  return { entries: [] };
}
