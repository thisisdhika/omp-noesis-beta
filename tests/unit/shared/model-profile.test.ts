"use strict";

/**
 * Unit tests for src/shared/model-profile.ts
 *
 * Covers:
 * - detectModelFamily: family identification from various ID patterns
 * - detectFamilyFromModel: model-object delegation + undefined handling
 * - getProfile: correct profile returned for each family
 * - isSmallModel: true for deepseek, qwen, llama, mimo
 * - Case insensitivity in detection
 */

import { describe, it, expect } from "bun:test";
import {
  detectModelFamily,
  detectFamilyFromModel,
  getProfile,
  DEFAULT_PROFILE,
  type ModelFamily,
} from "../../../src/shared/model-profile";

// ---------------------------------------------------------------------------
// detectModelFamily
// ---------------------------------------------------------------------------

describe("detectModelFamily", () => {
  it("identifies claude from model ID", () => {
    expect(detectModelFamily("anthropic/claude-3.5-sonnet")).toBe("claude");
  });

  it("identifies claude from 'anthropic' token", () => {
    expect(detectModelFamily("anthropic/claude-3-opus")).toBe("claude");
  });

  it("identifies gpt from model ID", () => {
    expect(detectModelFamily("openai/gpt-4o")).toBe("gpt");
  });

  it("identifies gpt from 'openai' token", () => {
    expect(detectModelFamily("openai/o3-mini")).toBe("gpt");
  });

  it("identifies gpt from o1/o3/o4 IDs", () => {
    expect(detectModelFamily("o1-preview")).toBe("gpt");
    expect(detectModelFamily("o3-mini")).toBe("gpt");
    expect(detectModelFamily("o4-turbo")).toBe("gpt");
  });

  it("identifies deepseek", () => {
    expect(detectModelFamily("deepseek/deepseek-v4-pro")).toBe("deepseek");
  });

  it("identifies qwen", () => {
    expect(detectModelFamily("qwen/qwen-2.5-72b")).toBe("qwen");
  });

  it("identifies llama", () => {
    expect(detectModelFamily("meta-llama/llama-3.1-70b")).toBe("llama");
  });

  it("identifies mimo", () => {
    expect(detectModelFamily("commandcode/xiaomi/mimo-v2.5")).toBe("mimo");
  });

  it("identifies gemini from model ID", () => {
    expect(detectModelFamily("google/gemini-2.0-flash")).toBe("gemini");
  });

  it("identifies gemini from 'google' token", () => {
    expect(detectModelFamily("google/gemini-pro")).toBe("gemini");
  });

  it("returns unknown for unrecognized IDs", () => {
    expect(detectModelFamily("some-random/model-v1")).toBe("unknown");
  });

  it("is case insensitive", () => {
    expect(detectModelFamily("CLAUDE-3.5-SONNET")).toBe("claude");
    expect(detectModelFamily("DEEPSEEK-V4")).toBe("deepseek");
    expect(detectModelFamily("QWEN-2.5")).toBe("qwen");
    expect(detectModelFamily("LLAMA-3")).toBe("llama");
    expect(detectModelFamily("MIMO-V2")).toBe("mimo");
    expect(detectModelFamily("GEMINI-PRO")).toBe("gemini");
    expect(detectModelFamily("OPENAI/GPT-4O")).toBe("gpt");
  });
});

// ---------------------------------------------------------------------------
// detectFamilyFromModel
// ---------------------------------------------------------------------------

describe("detectFamilyFromModel", () => {
  it("returns unknown for undefined model", () => {
    expect(detectFamilyFromModel(undefined)).toBe("unknown");
  });

  it("uses provider field when available", () => {
    expect(
      detectFamilyFromModel({ id: "some-model", provider: "anthropic" }),
    ).toBe("claude");
  });

  it("falls back to id when provider is unknown", () => {
    expect(
      detectFamilyFromModel({ id: "deepseek/deepseek-v4-pro", provider: "custom-host" }),
    ).toBe("deepseek");
  });

  it("detects from id when no provider", () => {
    expect(detectFamilyFromModel({ id: "qwen/qwen-2.5-72b" })).toBe("qwen");
  });

  it("detects mimo from full prefixed ID", () => {
    expect(
      detectFamilyFromModel({ id: "commandcode/xiaomi/mimo-v2.5" }),
    ).toBe("mimo");
  });
});

// ---------------------------------------------------------------------------
// getProfile
// ---------------------------------------------------------------------------

describe("getProfile", () => {
  const families: ModelFamily[] = [
    "claude",
    "gpt",
    "deepseek",
    "qwen",
    "llama",
    "mimo",
    "gemini",
    "unknown",
  ];

  for (const family of families) {
    it(`returns profile for ${family}`, () => {
      const profile = getProfile(family);
      expect(profile.family).toBe(family);
    });
  }

  it("returns correct isSmallModel flags", () => {
    // Small models
    expect(getProfile("deepseek").isSmallModel).toBe(true);
    expect(getProfile("qwen").isSmallModel).toBe(true);
    expect(getProfile("llama").isSmallModel).toBe(true);
    expect(getProfile("mimo").isSmallModel).toBe(true);

    // Frontier models
    expect(getProfile("claude").isSmallModel).toBe(false);
    expect(getProfile("gpt").isSmallModel).toBe(false);
    expect(getProfile("gemini").isSmallModel).toBe(false);
    expect(getProfile("unknown").isSmallModel).toBe(false);
  });

  it("small models have maxNonProtectedSections ≤ 4", () => {
    for (const family of ["deepseek", "qwen", "llama", "mimo"] as const) {
      expect(getProfile(family).maxNonProtectedSections).toBeLessThanOrEqual(4);
    }
  });

  it("DEFAULT_PROFILE equals unknown profile", () => {
    expect(DEFAULT_PROFILE.family).toBe("unknown");
    expect(DEFAULT_PROFILE).toEqual(getProfile("unknown"));
  });
});
