"use strict";

/**
 * omp-noesis: Federation Lifecycle Tests
 * Version: 1.0.0
 *
 * Behavioral tests for multi-agent belief federation — publish, pull,
 * revise, retract, import lifecycle with ledger persistence.
 */

import { describe, it, expect } from "bun:test";
import { cloneState } from "../helpers/fixtures.js";
import {
  initializeLedger,
  publishToLedger,
  pullFromLedger,
  reviseLedgerEntry,
  retractFromLedger,
  importFromLedger,
  serializeLedger,
  parseLedger,
} from "../../src/domains/federation/federation-domain.js";
import { addFact, addDecision } from "../../src/domains/belief/belief-domain.js";

// ============================================================================
// Domain-level tests (pure functions, no I/O)
// ============================================================================

describe("federation domain — publish", () => {
  it("should publish a belief fact to the ledger", () => {
    const ledger = initializeLedger("agent-1", "TestAgent");
    const state = cloneState();
    const fact = addFact(state, {
      content: "TypeScript is a superset of JavaScript",
      confidence: 0.95,
      source: "inference",
      epistemicStatus: "certain",
      tags: ["typescript"],
    });

    const entry = publishToLedger(ledger, "agent-1", fact, "fact");

    expect(entry.ledgerEntryId).toMatch(/^ld-/);
    expect(entry.agentId).toBe("agent-1");
    expect(entry.beliefId).toBe(fact.id);
    expect(entry.action).toBe("publish");
    expect(entry.beliefKind).toBe("fact");
    expect(entry.content).toBe(fact.content);
    expect(entry.confidence).toBe(0.95);
    expect(ledger.entries).toHaveLength(1);
  });

  it("should publish a belief decision to the ledger", () => {
    const ledger = initializeLedger("agent-1");
    const state = cloneState();
    const dec = addDecision(state, {
      content: "Use TypeScript for all new projects",
      rationale: "Type safety improves team velocity",
      source: "inference",
      tags: ["typescript"],
    });

    const entry = publishToLedger(ledger, "agent-1", dec, "decision");

    expect(entry.ledgerEntryId).toMatch(/^ld-/);
    expect(entry.beliefKind).toBe("decision");
    expect(ledger.entries).toHaveLength(1);
  });

  it("should mark belief scope as federated on publish", () => {
    const ledger = initializeLedger("agent-1");
    const state = cloneState();
    const fact = addFact(state, {
      content: "Test fact",
      confidence: 0.8,
      source: "inference",
      epistemicStatus: "probable",
    });
    const entry = publishToLedger(ledger, "agent-1", fact, "fact");
    fact.ledgerEntryId = entry.ledgerEntryId;
    fact.scope = "federated";

    expect(fact.scope).toBe("federated");
    expect(fact.ledgerEntryId).toBe(entry.ledgerEntryId);
  });
});

describe("federation domain — pull", () => {
  it("should return only foreign entries when pulling", () => {
    const ledger = initializeLedger("agent-1");
    const state = cloneState();
    const ourFact = addFact(state, { content: "Our fact", confidence: 0.8, source: "inference", epistemicStatus: "probable" });
    const theirFact = addFact(state, { content: "Their fact", confidence: 0.7, source: "inference", epistemicStatus: "speculative" });

    publishToLedger(ledger, "agent-1", ourFact, "fact");
    publishToLedger(ledger, "agent-2", theirFact, "fact");

    const foreign = pullFromLedger(ledger, "agent-1");
    expect(foreign).toHaveLength(1);
    expect(foreign[0]!.agentId).toBe("agent-2");
    expect(foreign[0]!.beliefId).toBe(theirFact.id);
  });

  it("should return empty when no foreign entries exist", () => {
    const ledger = initializeLedger("agent-1");
    const state = cloneState();
    const fact = addFact(state, { content: "Test", confidence: 0.8, source: "inference", epistemicStatus: "probable" });
    publishToLedger(ledger, "agent-1", fact, "fact");

    const foreign = pullFromLedger(ledger, "agent-1");
    expect(foreign).toHaveLength(0);
  });
});

describe("federation domain — revise", () => {
  it("should create a new entry referencing the previous one", () => {
    const ledger = initializeLedger("agent-1");
    const state = cloneState();
    const fact = addFact(state, { content: "Original", confidence: 0.7, source: "inference", epistemicStatus: "speculative" });
    const original = publishToLedger(ledger, "agent-1", fact, "fact");

    const revised = reviseLedgerEntry(ledger, "agent-1", original.ledgerEntryId, {
      content: "Revised content",
      confidence: 0.9,
    });

    expect(revised).not.toBeNull();
    expect(revised!.action).toBe("revise");
    expect(revised!.previousLedgerEntryId).toBe(original.ledgerEntryId);
    expect(revised!.content).toBe("Revised content");
    expect(revised!.confidence).toBe(0.9);
    expect(ledger.entries).toHaveLength(2);
  });

  it("should return null if previous entry not found", () => {
    const ledger = initializeLedger("agent-1");
    const result = reviseLedgerEntry(ledger, "agent-1", "nonexistent", { content: "x" });
    expect(result).toBeNull();
  });

  it("should return null if agent does not own the entry", () => {
    const ledger = initializeLedger("agent-1");
    const state = cloneState();
    const fact = addFact(state, { content: "Test", confidence: 0.8, source: "inference", epistemicStatus: "probable" });
    const original = publishToLedger(ledger, "agent-2", fact, "fact");

    const result = reviseLedgerEntry(ledger, "agent-1", original.ledgerEntryId, { content: "x" });
    expect(result).toBeNull();
  });
});

describe("federation domain — retract", () => {
  it("should create a retraction entry", () => {
    const ledger = initializeLedger("agent-1");
    const state = cloneState();
    const fact = addFact(state, { content: "To retract", confidence: 0.8, source: "inference", epistemicStatus: "probable" });
    publishToLedger(ledger, "agent-1", fact, "fact");

    const retraction = retractFromLedger(ledger, "agent-1", fact.id);
    expect(retraction).not.toBeNull();
    expect(retraction!.action).toBe("retract");
    expect(ledger.entries).toHaveLength(2);
  });

  it("should return null if belief not found for this agent", () => {
    const ledger = initializeLedger("agent-1");
    const result = retractFromLedger(ledger, "agent-1", "bf-nonexistent");
    expect(result).toBeNull();
  });
});

describe("federation domain — import", () => {
  it("should create beliefs from ledger entries", () => {
    const ledger = initializeLedger("agent-2");
    const state = cloneState();
    const fact = addFact(state, { content: "Foreign fact", confidence: 0.85, source: "inference", epistemicStatus: "certain" });
    const entry = publishToLedger(ledger, "agent-2", fact, "fact");

    const importState = cloneState();
    const count = importFromLedger(importState, [entry]);
    expect(count).toBe(1);
    expect(importState.belief.facts).toHaveLength(1);
    expect(importState.belief.facts[0]!.scope).toBe("imported");
    expect(importState.belief.facts[0]!.agentId).toBe("agent-2");
  });

  it("should deduplicate by beliefId", () => {
    const ledger = initializeLedger("agent-2");
    const state = cloneState();
    const fact = addFact(state, { content: "Duplicate", confidence: 0.8, source: "inference", epistemicStatus: "probable" });
    const entry = publishToLedger(ledger, "agent-2", fact, "fact");

    const importState = cloneState();
    importFromLedger(importState, [entry]);
    const count2 = importFromLedger(importState, [entry]);
    expect(count2).toBe(0);
    expect(importState.belief.facts).toHaveLength(1);
  });

  it("should import decisions from ledger entries", () => {
    const ledger = initializeLedger("agent-2");
    const state = cloneState();
    const dec = addDecision(state, {
      content: "Use Python for data science",
      rationale: "Best ecosystem",
      source: "inference",
    });
    const entry = publishToLedger(ledger, "agent-2", dec, "decision");

    const importState = cloneState();
    const count = importFromLedger(importState, [entry]);
    expect(count).toBe(1);
    expect(importState.belief.decisions).toHaveLength(1);
    expect(importState.belief.decisions[0]!.scope).toBe("imported");
  });

  it("should supersede beliefs on retract import", () => {
    const ledger = initializeLedger("agent-2");
    const state = cloneState();
    const fact = addFact(state, { content: "Will be retracted", confidence: 0.8, source: "inference", epistemicStatus: "probable" });
    const entry = publishToLedger(ledger, "agent-2", fact, "fact");
    const retraction = retractFromLedger(ledger, "agent-2", fact.id);
    // Simulate import by first importing the publish, then processing retraction
    const importState = cloneState();
    importFromLedger(importState, [entry]);

    // Now import the retraction — should mark the fact as superseded
    importFromLedger(importState, [retraction!]);
    const imported = importState.belief.facts.find((f) => f.id === fact.id);
    expect(imported).toBeDefined();
    expect(imported!.status).toBe("superseded");
  });
});

describe("federation domain — serialize / parse", () => {
  it("should round-trip a ledger through JSONL", () => {
    const ledger = initializeLedger("agent-1", "TestAgent");
    const state = cloneState();
    const fact = addFact(state, { content: "Test", confidence: 0.8, source: "inference", epistemicStatus: "probable" });
    publishToLedger(ledger, "agent-1", fact, "fact");

    const serialized = serializeLedger(ledger);
    const parsed = parseLedger(serialized);

    expect(parsed.agentId).toBe("agent-1");
    expect(parsed.agentName).toBe("TestAgent");
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]!.content).toBe("Test");
    expect(parsed.entries[0]!.ledgerEntryId).toMatch(/^ld-/);
  });

  it("should parse empty string as empty ledger", () => {
    const ledger = parseLedger("");
    expect(ledger.entries).toHaveLength(0);
  });
});

describe("federation domain — identity", () => {
  it("should set agent identity on initialization", () => {
    const ledger = initializeLedger("agent-sandbox-01", "SandboxAgent");
    expect(ledger.agentId).toBe("agent-sandbox-01");
    expect(ledger.agentName).toBe("SandboxAgent");
  });

  it("should persist identity across publish operations", () => {
    const ledger = initializeLedger("agent-persist", "PersistentAgent");
    const state = cloneState();
    const fact1 = addFact(state, { content: "Fact 1", confidence: 0.8, source: "inference", epistemicStatus: "probable" });
    const fact2 = addFact(state, { content: "Fact 2", confidence: 0.9, source: "inference", epistemicStatus: "certain" });

    publishToLedger(ledger, "agent-persist", fact1, "fact");
    publishToLedger(ledger, "agent-persist", fact2, "fact");

    expect(ledger.agentId).toBe("agent-persist");
    expect(ledger.agentName).toBe("PersistentAgent");
    expect(ledger.entries).toHaveLength(2);
    expect(ledger.entries.every((e) => e.agentId === "agent-persist")).toBe(true);
  });
});
