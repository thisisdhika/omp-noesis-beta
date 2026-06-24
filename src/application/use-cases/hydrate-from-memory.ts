"use strict";

/**
 * omp-noesis: Hydrate From Memory Use Case
 * Version: 1.0.0
 *
 * Queries OMP memory for [noesis/belief] and [noesis/decision] entries,
 * parses structured context, deduplicates by content hash, and imports
 * into the noesis cognitive state.
 *
 * @module application/use-cases/hydrate-from-memory
 */

import type { IUnitOfWork } from "../../infrastructure/unit-of-work.js";
import { contentHash, generateId } from "../../shared/schema-base.js";
import type { NoesisRuntime, MemoryStatus } from "../../runtime.js";

// ============================================================================
// TYPES
// ============================================================================

interface ParsedMemoryEntry {
  content: string;
  confidence?: number;
  tags?: string[];
  source?: string;
  id?: string;
}

interface HydrateResult {
  imported: number;
  skipped: number;
  status: MemoryStatus;
}

// ============================================================================
// CONTEXT PARSER
// ============================================================================

/**
 * Parse structured context string from OMP memory entries.
 * Expected format: "id: bf-xxx, confidence: 0.8, source: graph, tags: ts,arch"
 */
function parseContext(content: string, context?: string): ParsedMemoryEntry | null {
  // Strip [noesis/belief] or [noesis/decision] prefix
  const stripped = content.replace(/^\[noesis\/(belief|decision)\]\s*/i, "").trim();
  if (!stripped) return null;

  const confidence = context?.match(/confidence:\s*([\d.]+)/)?.[1];
  const tags = context?.match(/tags:\s*([^,]+(?:,[^,]+)*)/)?.[1]
    ?.split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const source = context?.match(/source:\s*(\S+)/)?.[1];
  const id = context?.match(/id:\s*(\S+)/)?.[1];

  return {
    content: stripped,
    confidence: confidence ? parseFloat(confidence) : undefined,
    tags,
    source,
    id,
  };
}

// ============================================================================
// USE CASE
// ============================================================================

export class HydrateFromMemoryUseCase {
  constructor(private uow: IUnitOfWork) {}

  /**
   * Execute hydration from OMP memory.
   * Searches for [noesis/belief] and [noesis/decision] entries,
   * deduplicates by content hash, and imports as active beliefs.
   */
  async execute(runtime: NoesisRuntime): Promise<HydrateResult> {
    const status = await runtime.getMemoryStatus?.() ?? {
      backend: "off",
      searchable: false,
      writable: false,
    };

    if (!status.searchable) {
      return { imported: 0, skipped: 0, status };
    }

    // Search for beliefs and decisions in parallel
    const [beliefItems, decisionItems] = await Promise.all([
      runtime.searchFromOmp?.("[noesis/belief]", 100) ?? [],
      runtime.searchFromOmp?.("[noesis/decision]", 50) ?? [],
    ]);

    // Build set of existing content hashes for dedup
    const existingHashes = new Set(
      this.uow.belief.getAllFacts().map((f) => contentHash(f.content)),
    );

    let imported = 0;
    let skipped = 0;
    const now = new Date().toISOString();

    // Import belief facts
    for (const item of beliefItems) {
      const parsed = parseContext(item.content, item.context);
      if (!parsed) { skipped++; continue; }

      const hash = contentHash(parsed.content);
      if (existingHashes.has(hash)) { skipped++; continue; }

      // Import with capped confidence — OMP memory entries are supplements
      const confidence = Math.min(parsed.confidence ?? 0.5, 0.75);

      this.uow.belief.addFact({
        id: generateId("bf"),
        content: parsed.content,
        confidence,
        source: "omp-memory",
        tags: parsed.tags,
        createdAt: now,
        updatedAt: now,
        status: "active",
      });
      existingHashes.add(hash);
      imported++;
    }

    // Import decisions
    for (const item of decisionItems) {
      const parsed = parseContext(item.content, item.context);
      if (!parsed) { skipped++; continue; }

      const hash = contentHash(parsed.content);
      if (existingHashes.has(hash)) { skipped++; continue; }

      this.uow.belief.addDecision({
        id: generateId("bd"),
        content: parsed.content,
        rationale: `Imported from OMP memory (source: ${parsed.source ?? "unknown"})`,
        source: "omp-memory",
        tags: parsed.tags,
        createdAt: now,
        updatedAt: now,
        status: "active",
      });
      existingHashes.add(hash);
      imported++;
    }

    if (imported > 0) {
      await this.uow.commit();
    }

    return { imported, skipped, status };
  }
}
