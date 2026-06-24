"use strict";

/**
 * omp-noesis: Compaction Loss Metrics Schema
 * Version: 1.0.0
 *
 * Tracks compaction results for loss metrics — what survived, was degraded,
 * or was evicted during session compaction.
 */

import { z } from "zod";

export const CompactionResultSchema = z.object({
  occurredAt: z.string().datetime(),
  preCounts: z.object({ facts: z.number(), decisions: z.number() }),
  postCounts: z.object({ facts: z.number(), decisions: z.number() }),
  preserved: z.array(z.string()),
  degraded: z.array(z.object({
    id: z.string(),
    content: z.string().max(80),
    reason: z.enum(["truncated", "confidence_drop"]),
  })),
  evicted: z.array(z.object({
    id: z.string(),
    content: z.string().max(80),
    reason: z.enum(["capacity", "stale", "low_confidence", "superseded"]),
  })),
  reconstructionHints: z.array(z.string()),
});

export type CompactionResult = z.infer<typeof CompactionResultSchema>;
