import type {
  BeliefDecision,
  BeliefFact,
  LearningEntry,
  NoesisState,
  VaultArtifact,
} from "../schema.js";

// ---------------------------------------------------------------------------
// MergeResult
// ---------------------------------------------------------------------------

export interface MergeResult {
  /** Beliefs newly imported from vault artifacts. */
  addedFacts: BeliefFact[];
  /** Decisions newly imported or updated from vault artifacts. */
  addedDecisions: BeliefDecision[];
  /** Artifact ids where the state was newer and the vault version was rejected. */
  conflicts: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseStructuredContent(content: string): Record<string, unknown> | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Convert a vault artifact of kind "decision" into a full BeliefDecision.
 * Uses vault metadata fields when present, falling back to sane defaults.
 */
function vaultArtifactToDecision(artifact: VaultArtifact): BeliefDecision {
  const md = artifact.metadata;
  const payload = parseStructuredContent(artifact.content);
  const rawSuperseded = md["superseded-by"] ?? payload?.supersededBy;
  const supersededBy: string | undefined = Array.isArray(rawSuperseded)
    ? rawSuperseded[0]
    : typeof rawSuperseded === "string"
      ? rawSuperseded
      : undefined;
  const content =
    typeof payload?.content === "string" ? payload.content : artifact.content;
  const rationale =
    typeof payload?.rationale === "string" ? payload.rationale : content;

  return {
    id: artifact.id,
    content,
    rationale,
    alternatives: asStringArray(md.alternatives ?? payload?.alternatives),
    source: "vault",
    createdAt: typeof md.created === "string" ? md.created : artifact.pushedAt,
    updatedAt: artifact.pushedAt,
    status:
      (md.status as BeliefDecision["status"]) ??
      (payload?.status as BeliefDecision["status"] | undefined) ??
      "active",
    supersededBy,
    tags: asStringArray(md.tags ?? payload?.tags),
  };
}

/**
 * Convert a vault artifact of kind "belief" into a BeliefFact.
 * Confidence is capped at 0.80 per the vault trust discount (contract §5.2).
 */
function vaultArtifactToFact(artifact: VaultArtifact): BeliefFact {
  const md = artifact.metadata;
  const payload = parseStructuredContent(artifact.content);
  const rawConfidence = (md.confidence ?? payload?.confidence) as number | undefined;
  const vaultConfidence =
    typeof rawConfidence === "number" ? Math.min(0.8, rawConfidence) : 0.8;
  const rawSuperseded = md["superseded-by"] ?? payload?.supersededBy;
  const supersededBy: string | undefined = Array.isArray(rawSuperseded)
    ? rawSuperseded[0]
    : typeof rawSuperseded === "string"
      ? rawSuperseded
      : undefined;
  const content =
    typeof payload?.content === "string" ? payload.content : artifact.content;

  return {
    id: artifact.id,
    content,
    confidence: vaultConfidence,
    source: "vault",
    createdAt: typeof md.created === "string" ? md.created : artifact.pushedAt,
    updatedAt: artifact.pushedAt,
    status:
      (md.status as BeliefFact["status"]) ??
      (payload?.status as BeliefFact["status"] | undefined) ??
      "active",
    supersededBy,
    tags: asStringArray(md.tags ?? payload?.tags),
    communityScope:
      (md["community-scope"] as string | undefined) ??
      (typeof payload?.communityScope === "string" ? payload.communityScope : undefined),
    evidenceNodes: asStringArray(md["evidence-nodes"] ?? payload?.evidenceNodes),
  };
}

/**
 * Convert a vault artifact of kind "learning" into a LearningEntry.
 * Content is truncated to 500 characters (schema limit).
 */
function vaultArtifactToLearning(artifact: VaultArtifact): LearningEntry {
  const md = artifact.metadata;
  const payload = parseStructuredContent(artifact.content);
  const capturedAt =
    typeof md.capturedAt === "string"
      ? md.capturedAt
      : typeof md.created === "string"
        ? md.created
        : typeof payload?.capturedAt === "string"
          ? payload.capturedAt
          : artifact.pushedAt;
  const description =
    typeof payload?.description === "string" ? payload.description : artifact.content;

  return {
    id: artifact.id,
    description: description.slice(0, 500),
    rootCause:
      typeof md.rootCause === "string"
        ? md.rootCause
        : typeof payload?.rootCause === "string"
          ? payload.rootCause
          : undefined,
    fix:
      typeof md.fix === "string"
        ? md.fix
        : typeof payload?.fix === "string"
          ? payload.fix
          : undefined,
    skillScope:
      typeof md["skill-scope"] === "string"
        ? md["skill-scope"]
        : typeof payload?.skillScope === "string"
          ? payload.skillScope
          : undefined,
    toolName:
      typeof md.toolName === "string"
        ? md.toolName
        : typeof payload?.toolName === "string"
          ? payload.toolName
          : undefined,
    capturedAt,
    severity:
      typeof md.severity === "number"
        ? md.severity
        : typeof payload?.severity === "number"
          ? payload.severity
          : 1,
  };
}

/** Normalise a frontmatter value to a string array. */
function asStringArray(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val.filter((v): v is string => typeof v === "string");
  }
  if (typeof val === "string") return [val];
  return [];
}

// ---------------------------------------------------------------------------
// mergeVaultPull
// ---------------------------------------------------------------------------

/**
 * Merge pulled vault artifacts into the in-memory cognitive state.
 *
 * Conflict rules (contract §5.2–5.3):
 *
 * | Scenario                                   | Resolution                      |
 * |--------------------------------------------|---------------------------------|
 * | Decision not in state                      | Import (vault wins)             |
 * | Decision exists, vault `pushedAt` is newer | Vault wins, patch in place      |
 * | Decision exists, vault `pushedAt` is older | State wins, record conflict     |
 * | Belief not in state                        | Import, confidence capped 0.80  |
 * | Belief exists in state                     | Preserve state (no overwrite)   |
 * | Resolved learning not in state             | Import as success entry         |
 * | Learning exists in state                   | Skip                            |
 * | Pattern artifact                           | Skipped (separate pipeline)     |
 */
export function mergeVaultPull(
  state: NoesisState,
  artifacts: VaultArtifact[],
): MergeResult {
  const result: MergeResult = {
    addedFacts: [],
    addedDecisions: [],
    conflicts: [],
  };

  for (const artifact of artifacts) {
    switch (artifact.kind) {
      case "decision": {
        const existing = state.belief.decisions.find(
          (d) => d.id === artifact.id,
        );
        if (!existing) {
          const decision = vaultArtifactToDecision(artifact);
          state.belief.decisions.push(decision);
          result.addedDecisions.push(decision);
        } else if (artifact.pushedAt > existing.updatedAt) {
          const updated = vaultArtifactToDecision(artifact);
          Object.assign(existing, updated);
          result.addedDecisions.push(existing);
        } else {
          result.conflicts.push(artifact.id);
        }
        break;
      }

      case "belief": {
        const existing = state.belief.facts.find((f) => f.id === artifact.id);
        if (!existing) {
          const fact = vaultArtifactToFact(artifact);
          state.belief.facts.push(fact);
          result.addedFacts.push(fact);
        }
        // Existing beliefs are preserved — state is more current.
        break;
      }

      case "learning": {
        const resolved = artifact.metadata.resolved;
        // Treat missing `resolved` as resolved — vault only stores completed
        // learnings (eviction push), and human-edited notes opt out with
        // `resolved: false`.
        const isResolved =
          resolved === true || resolved === undefined || resolved === null;

        if (isResolved) {
          const inSuccesses = state.learning.successes.some(
            (l) => l.id === artifact.id,
          );
          const inFailures = state.learning.failures.some(
            (l) => l.id === artifact.id,
          );
          if (!inSuccesses && !inFailures) {
            const entry = vaultArtifactToLearning(artifact);
            state.learning.successes.push(entry);
          }
        }
        break;
      }

      // pattern — intentionally skipped; patterns are enriched via a
      // separate pattern-detection pipeline.
    }
  }

  return result;
}
