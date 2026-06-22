"use strict";

/**
 * omp-noesis: Model Profile
 * Version: 1.0.0
 *
 * Model-family detection and adaptation profiles. Provides per-family
 * settings for preamble density, tool description hints, and field name
 * vocabulary alignment. All detection is training-free (model family string
 * from OMP's model catalog).
 */

// ============================================================================
// TYPES
// ============================================================================

/** Canonical model family identifiers. */
export type ModelFamily =
  | "claude"
  | "gpt"
  | "deepseek"
  | "qwen"
  | "llama"
  | "mimo"
  | "gemini"
  | "unknown";

/** Per-family adaptation profile. */
export interface ModelProfile {
  readonly family: ModelFamily;
  /** True for small/free models that need extra schema guidance. */
  readonly isSmallModel: boolean;
  /** Maximum non-protected preamble sections to show. */
  readonly maxNonProtectedSections: number;
  /** Prefix prepended to tool descriptions for this model family. */
  readonly toolHintPrefix: string;
}

// ============================================================================
// PROFILE REGISTRY
// ============================================================================

const profiles: Record<ModelFamily, ModelProfile> = {
  claude: {
    family: "claude",
    isSmallModel: false,
    maxNonProtectedSections: 8,
    toolHintPrefix: "",
  },
  gpt: {
    family: "gpt",
    isSmallModel: false,
    maxNonProtectedSections: 8,
    toolHintPrefix: "",
  },
  deepseek: {
    family: "deepseek",
    isSmallModel: true,
    maxNonProtectedSections: 3,
    toolHintPrefix: "DeepSeek: ",
  },
  qwen: {
    family: "qwen",
    isSmallModel: true,
    maxNonProtectedSections: 3,
    toolHintPrefix: "Note: ",
  },
  llama: {
    family: "llama",
    isSmallModel: true,
    maxNonProtectedSections: 4,
    toolHintPrefix: "Note: ",
  },
  mimo: {
    family: "mimo",
    isSmallModel: true,
    maxNonProtectedSections: 3,
    toolHintPrefix: "Note: ",
  },
  gemini: {
    family: "gemini",
    isSmallModel: false,
    maxNonProtectedSections: 6,
    toolHintPrefix: "",
  },
  unknown: {
    family: "unknown",
    isSmallModel: false,
    maxNonProtectedSections: 8,
    toolHintPrefix: "",
  },
};

// ============================================================================
// DETECTION
// ============================================================================

/**
 * Resolve a model family from a model ID string or family token.
 * Training-free: uses substring matching against known provider patterns.
 */
export function detectModelFamily(providerOrId: string): ModelFamily {
  const lower = providerOrId.toLowerCase();

  if (lower.includes("claude") || lower.includes("anthropic")) return "claude";
  if (lower.includes("gpt") || lower.includes("openai") || lower.includes("o1") || lower.includes("o3") || lower.includes("o4")) return "gpt";
  if (lower.includes("deepseek")) return "deepseek";
  if (lower.includes("qwen")) return "qwen";
  if (lower.includes("llama") || lower.includes("meta-llama")) return "llama";
  if (lower.includes("mimo")) return "mimo";
  if (lower.includes("gemini") || lower.includes("google")) return "gemini";

  return "unknown";
}

/**
 * Detect family from a Model object that has an `id` and possibly a
 * `provider` field.
 */
export function detectFamilyFromModel(model: { id: string; provider?: string } | undefined): ModelFamily {
  if (!model) return "unknown";

  // The provider field is more reliable when available
  if (model.provider) {
    const fromProvider = detectModelFamily(model.provider);
    if (fromProvider !== "unknown") return fromProvider;
  }

  return detectModelFamily(model.id);
}

// ============================================================================
// PROFILE ACCESS
// ============================================================================

/** Get the best-fit profile for the given model family. */
export function getProfile(family: ModelFamily): ModelProfile {
  return profiles[family];
}

/** Get the default (frontier-model) profile. */
export const DEFAULT_PROFILE: ModelProfile = profiles.unknown;
