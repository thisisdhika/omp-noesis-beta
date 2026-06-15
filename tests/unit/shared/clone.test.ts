"use strict";

import { describe, it, expect } from "bun:test";
import { deepClone } from "../../../src/shared/clone.js";

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
