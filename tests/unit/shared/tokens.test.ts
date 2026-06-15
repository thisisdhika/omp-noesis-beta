"use strict";

import { describe, it, expect } from "bun:test";
import { estimateTokens } from "../../../src/shared/tokens.js";

describe("estimateTokens", () => {
  it("should return 0 for an empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("should return 1 for a 1-4 character string", () => {
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("abcd")).toBe(1);
  });

  it("should return 2 for an 8-character string (ceil)", () => {
    expect(estimateTokens("12345678")).toBe(2);
  });

  it("should return 2 for a 5-character string (ceil)", () => {
    expect(estimateTokens("12345")).toBe(2);
  });

  it("should scale proportionally with length", () => {
    // 100 chars / 4 = 25
    expect(estimateTokens("x".repeat(100))).toBe(25);
    // 101 chars / 4 = 25.25 → ceil → 26
    expect(estimateTokens("x".repeat(101))).toBe(26);
    // 400 chars / 4 = 100
    expect(estimateTokens("x".repeat(400))).toBe(100);
  });
});
