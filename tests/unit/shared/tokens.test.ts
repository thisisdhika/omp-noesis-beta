"use strict";

import { describe, it, expect } from "bun:test";
import { estimateTokens } from "../../../src/shared/tokens.js";

describe("estimateTokens", () => {
  it("should return 0 for an empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("should return 1 for a single word", () => {
    expect(estimateTokens("hello")).toBe(1);
  });

  it("should count words, spaces, and punctuation separately", () => {
    expect(estimateTokens("hello world")).toBe(3);
  });

  it("should handle English sentence with contractions", () => {
    // "Hello, world! I'm here." → Hello , space world ! space I 'm space here .
    expect(estimateTokens("Hello, world! I'm here.")).toBe(11);
  });

  it("should handle code snippets", () => {
    // "function foo() { return 42; }" → function space ( ) space { space return space 42 ; space }
    expect(estimateTokens("function foo() { return 42; }")).toBe(14);
  });

  it("should handle mixed markdown-like content", () => {
    // "# Hello\n\nThis is a `code` block."
    expect(estimateTokens("# Hello\n\nThis is a `code` block.")).toBe(16);
  });

  it("should handle longer text with approximate accuracy", () => {
    const sentence = "The quick brown fox jumps over the lazy dog near the bank of the river.";
    // 15 words + 14 spaces + 1 period = 30 tokens
    expect(estimateTokens(sentence)).toBe(30);
  });
});
