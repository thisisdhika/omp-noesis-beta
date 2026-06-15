"use strict";

/**
 * Unit tests for migrations — schema version migration pipeline.
 */

import { describe, it, expect } from "bun:test";
import { migrate, MIGRATIONS } from "../../../src/infrastructure/migrations.js";
import { CURRENT_VERSION, EMPTY_STATE } from "../../../src/schema.js";

// ============================================================================
// Tests
// ============================================================================

describe("migrate", () => {
  it("should return state unchanged when version equals CURRENT_VERSION", () => {
    const state = { version: CURRENT_VERSION, custom: "data" } as Record<string, unknown>;

    const result = migrate(state);

    expect(result.version).toBe(CURRENT_VERSION);
    expect((result as Record<string, unknown>).custom).toBe("data");
  });

  it("should stamp CURRENT_VERSION when version is 0", () => {
    const state = { version: 0 } as Record<string, unknown>;

    const result = migrate(state);

    expect(result.version).toBe(CURRENT_VERSION);
  });

  it("should handle missing version field as version 0", () => {
    const state = { someField: true } as Record<string, unknown>;

    const result = migrate(state);

    expect(result.version).toBe(CURRENT_VERSION);
  });

  it("should preserve extra properties through migration", () => {
    const state = { version: 0, extra: "preserved", nested: { keep: true } } as Record<string, unknown>;

    const result = migrate(state);

    expect(result.version).toBe(CURRENT_VERSION);
    expect((result as Record<string, unknown>).extra).toBe("preserved");
    expect(((result as Record<string, unknown>).nested as Record<string, unknown>).keep).toBeTrue();
  });

  it("should handle EMPTY_STATE without dropping fields", () => {
    const result = migrate(EMPTY_STATE as unknown as Record<string, unknown>);

    expect(result.version).toBe(CURRENT_VERSION);
    expect(result.attention).toBeDefined();
    expect(result.belief).toBeDefined();
    expect(result.inference).toBeDefined();
    expect(result.commitment).toBeDefined();
    expect(result.learning).toBeDefined();
  });

  it("should not mutate the input object", () => {
    const state = { version: 0, label: "original" } as Record<string, unknown>;
    const snapshot = { ...state };

    migrate(state);

    expect(state).toEqual(snapshot);
  });
});

describe("MIGRATIONS registry", () => {
  it("should export an array", () => {
    expect(Array.isArray(MIGRATIONS)).toBeTrue();
  });

  it("migrations should have sequential version transitions", () => {
    for (const m of MIGRATIONS) {
      expect(m.from).toBeLessThan(m.to);
      expect(m.description).toBeTruthy();
      expect(typeof m.apply).toBe("function");
    }
  });
});
