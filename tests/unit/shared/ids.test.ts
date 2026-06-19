"use strict";

import { describe, it, expect } from "bun:test";
import { generateId } from "../../../src/shared/schema.js";

describe("generateId", () => {
  it("should return a string starting with the given prefix", () => {
    const id = generateId("test");
    expect(id.startsWith("test-")).toBe(true);
  });

  it("should include a UUID after the prefix", () => {
    const id = generateId("foo");
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const suffix = id.slice("foo-".length);
    expect(suffix).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("should generate unique IDs on each call", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateId("t")));
    expect(ids.size).toBe(50);
  });

  it("should work with an empty prefix", () => {
    const id = generateId("");
    // When prefix is empty, the result starts with "-"
    expect(id.startsWith("-")).toBe(true);
  });
});
