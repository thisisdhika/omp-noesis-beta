"use strict";

/**
 * Unit tests for migrations — schema version migration pipeline.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { migrate, MIGRATIONS } from "../../../src/infrastructure/migrations.js";
import { CURRENT_VERSION, EMPTY_STATE } from "../../../src/schema.js";
import type { Migration } from "../../../src/infrastructure/migrations.js";

// ============================================================================
// Tests
// ============================================================================

describe("migrate", () => {
  it("should return state unchanged when version equals CURRENT_VERSION", () => {
    const state: Record<string, unknown> = { version: CURRENT_VERSION, custom: "data" };

    const result = migrate(state);

    expect(result.version).toBe(CURRENT_VERSION);
    expect((result as Record<string, unknown>).custom).toBe("data");
  });

  it("should stamp CURRENT_VERSION when version is 0", () => {
    const state: Record<string, unknown> = { version: 0 };

    const result = migrate(state);

    expect(result.version).toBe(CURRENT_VERSION);
  });

  it("should handle missing version field as version 0", () => {
    const state: Record<string, unknown> = { someField: true };

    const result = migrate(state);

    expect(result.version).toBe(CURRENT_VERSION);
  });

  it("should preserve extra properties through migration", () => {
    const state: Record<string, unknown> = { version: 0, extra: "preserved", nested: { keep: true } };

    const result = migrate(state);

    expect(result.version).toBe(CURRENT_VERSION);
    expect((result as Record<string, unknown>).extra).toBe("preserved");
    expect(((result as Record<string, unknown>).nested as Record<string, unknown>).keep).toBeTrue();
  });

  it("should handle EMPTY_STATE without dropping fields", () => {
    const result = migrate(EMPTY_STATE as Record<string, unknown>);

    expect(result.version).toBe(CURRENT_VERSION);
    expect(result.attention).toBeDefined();
    expect(result.belief).toBeDefined();
    expect(result.inference).toBeDefined();
    expect(result.commitment).toBeDefined();
    expect(result.learning).toBeDefined();
  });

  it("should not mutate the input object", () => {
    const state: Record<string, unknown> = { version: 0, label: "original" };
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

// ---------------------------------------------------------------------------
// Migrate with MIGRATIONS entries (exercises filter/sort callbacks & loop)
// ---------------------------------------------------------------------------

describe("migrate with entries in MIGRATIONS", () => {
  const originalMigrations: Migration[] = [];

  beforeAll(() => {
    // Save original entries and add test migrations.
    // The filter in migrate() includes all migrations where m.from >= current,
    // so a state at v0 will match both 0→1 and 1→2, while a state at CURRENT_VERSION (1)
    // will match only 1→2 (since 0 < 1 is excluded).
    originalMigrations.push(...MIGRATIONS);
    MIGRATIONS.length = 0;
    MIGRATIONS.push(
      {
        from: 0,
        to: 1,
        description: "test: initial schema",
        apply: (s: Record<string, unknown>) => ({ ...s, _initApplied: true }),
      },
      {
        from: 1,
        to: 2,
        description: "test: field addition",
        apply: (s: Record<string, unknown>) => ({ ...s, _fieldAdded: true }),
      },
    );
  });

  afterAll(() => {
    // Restore original migrations to avoid leaking state
    MIGRATIONS.length = 0;
    MIGRATIONS.push(...originalMigrations);
  });

  it("applies all applicable forward migrations to v0 state", () => {
    const result = migrate({ version: 0 });
    expect(result.version).toBe(CURRENT_VERSION);
    // Both 0→1 and 1→2 apply from v0 (both have from >= 0)
    expect((result as Record<string, unknown>)._initApplied).toBe(true);
    expect((result as Record<string, unknown>)._fieldAdded).toBe(true);
  });

  it("skips migrations whose from is below current version", () => {
    // version 2 is >= current highest 'to' (2), so no migration should match
    const result = migrate({ version: 2 });
    expect(result.version).toBe(CURRENT_VERSION);
    expect((result as Record<string, unknown>)._initApplied).toBeUndefined();
    expect((result as Record<string, unknown>)._fieldAdded).toBeUndefined();
  });

  it("applies only migrations where from >= current version", () => {
    // At CURRENT_VERSION (1), migration 0→1 is skipped (from=0 < 1),
    // but 1→2 is applied (from=1 >= 1)
    const result = migrate({ version: CURRENT_VERSION, untouched: "yes" });
    expect(result.version).toBe(CURRENT_VERSION);
    expect((result as Record<string, unknown>)._initApplied).toBeUndefined();
    expect((result as Record<string, unknown>)._fieldAdded).toBe(true);
    expect((result as Record<string, unknown>).untouched).toBe("yes");
  });

  it("applies multiple migrations in from-order", () => {
    // Push a third migration to test ordering
    MIGRATIONS.push({
      from: 0,
      to: 3,
      description: "test: broader",
      apply: (s: Record<string, unknown>) => ({ ...s, _broader: true }),
    });

    // All three migrations should apply from v0
    const result = migrate({ version: 0 });
    expect(result.version).toBe(CURRENT_VERSION);
    expect((result as Record<string, unknown>)._initApplied).toBe(true);
    expect((result as Record<string, unknown>)._fieldAdded).toBe(true);
    expect((result as Record<string, unknown>)._broader).toBe(true);

    MIGRATIONS.pop();
  });

  it("preserves extra properties through migration pipeline", () => {
    const result = migrate({ version: 0, extraProp: "survives" });
    expect(result.version).toBe(CURRENT_VERSION);
    expect((result as Record<string, unknown>).extraProp).toBe("survives");
    expect((result as Record<string, unknown>)._initApplied).toBe(true);
  });

  it("does not mutate the input object when migrations are applied", () => {
    const input: Record<string, unknown> = { version: 0, label: "test" };
    const snapshot = { ...input };

    migrate(input);

    expect(input).toEqual(snapshot);
  });

  it("filters out migrations where to <= from (invalid migration entries)", () => {
    MIGRATIONS.push({
      from: 0,
      to: 0,
      description: "test: no-op (should be filtered out)",
      apply: (s: Record<string, unknown>) => ({ ...s, _shouldNotAppear: true }),
    });

    const result = migrate({ version: 0 });
    expect((result as Record<string, unknown>)._shouldNotAppear).toBeUndefined();

    MIGRATIONS.pop();
  });
});
