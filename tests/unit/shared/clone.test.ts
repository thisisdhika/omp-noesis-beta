import { describe, it, expect } from "bun:test";
import { deepClone, deepMergeDefaults } from "../../../src/shared/clone.js";

describe("deepClone", () => {
  it("should create an independent copy of a primitive value", () => {
    const original = 42;
    const clone = deepClone(original);
    expect(clone).toBe(original);
  });

  it("should create an independent copy of a string", () => {
    const original = "hello";
    const clone = deepClone(original);
    expect(clone).toBe(original);
  });

  it("should create an independent copy of an object", () => {
    const original = { a: 1, b: 2 };
    const clone = deepClone(original);
    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
  });

  it("should not affect the original when the clone is modified", () => {
    const original = { a: 1, b: 2 };
    const clone = deepClone(original);
    clone.a = 99;
    expect(original.a).toBe(1);
    expect(clone.a).toBe(99);
  });

  it("should work with nested objects", () => {
    const original = { outer: { inner: { value: 42 } } };
    const clone = deepClone(original);
    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
    expect(clone.outer).not.toBe(original.outer);
    expect(clone.outer.inner).not.toBe(original.outer.inner);
  });

  it("should not affect the original when nested values are modified in the clone", () => {
    const original = { outer: { inner: { value: 42 } } };
    const clone = deepClone(original);
    clone.outer.inner.value = 100;
    expect(original.outer.inner.value).toBe(42);
    expect(clone.outer.inner.value).toBe(100);
  });

  it("should handle arrays", () => {
    const original = [1, [2, 3], { a: 4 }];
    const clone = deepClone(original);
    clone[0] = 99;
    (clone[1]! as number[])[0]! = 200;
    expect(original[0]!).toBe(1);
    expect((original[1]! as number[])[0]!).toBe(2);
    expect(clone).toEqual([99, [200, 3], { a: 4 }]);
  });
});

describe("deepMergeDefaults", () => {
  it("should fill in missing keys from defaults", () => {
    const defaults = { a: 1, b: 2, c: 3 };
    const loaded = { a: 10 };
    const result = deepMergeDefaults(defaults, loaded);
    expect(result).toEqual({ a: 10, b: 2, c: 3 });
  });

  it("should recursively merge nested objects", () => {
    const defaults = { nested: { x: 1, y: 2, z: 3 } };
    const loaded = { nested: { x: 10, y: 20 } };
    const result = deepMergeDefaults(defaults, loaded as any);
    expect(result).toEqual({ nested: { x: 10, y: 20, z: 3 } });
  });

  it("should not replace arrays with defaults", () => {
    const defaults = { items: [1, 2, 3], other: "default" };
    const loaded = { items: [10, 20] };
    const result = deepMergeDefaults(defaults, loaded);
    expect(result).toEqual({ items: [10, 20], other: "default" });
  });

  it("should keep loaded array even when defaults has items", () => {
    const defaults = { items: [1, 2, 3] };
    const loaded = { items: [] };
    const result = deepMergeDefaults(defaults, loaded);
    expect(result).toEqual({ items: [] });
  });

  it("should handle the noesis state shape with pendingEvidence", () => {
    const defaults = {
      attention: {
        focus: "",
        priority: "normal",
        graphFindings: [],
        pendingEvidence: [],
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    };
    const loaded = {
      attention: {
        focus: "test",
        priority: "high",
        graphFindings: [{ query: "q", nodes: [], relations: [], confidence: "EXTRACTED", timestamp: "t" }],
        updatedAt: "2026-06-18T00:00:00.000Z",
        // pendingEvidence missing — old state file
      },
    };
    const result = deepMergeDefaults(defaults, loaded as any);
    expect(result.attention.focus).toBe("test");
    expect(result.attention.priority).toBe("high");
    expect(result.attention.pendingEvidence).toEqual([]);
    expect(result.attention.graphFindings).toHaveLength(1);
  });

  it("should not mutate defaults or loaded", () => {
    const defaults = { a: { b: 1 } };
    const loaded = { a: { c: 2 } };
    const result = deepMergeDefaults(defaults, loaded as any);
    expect(defaults).toEqual({ a: { b: 1 } });
    expect(loaded).toEqual({ a: { c: 2 } });
    expect(result as any).toEqual({ a: { b: 1, c: 2 } });
  });
});
