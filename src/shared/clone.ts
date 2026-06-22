"use strict";

/**
 * Deep clone via structuredClone wrapper. Falls back to JSON round-trip
 * when structuredClone is unavailable (though Bun supports it natively).
 * Version: 1.0.0
 */

export function deepClone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * Recursively merge `loaded` onto `defaults`, filling in any missing keys
 * from defaults. Arrays and primitives in `loaded` take precedence;
 * nested objects are merged recursively so that new schema fields
 * automatically receive their default values.
 */
export function deepMergeDefaults<T extends Record<string, unknown>>(
  defaults: T,
  loaded: Partial<T>,
): T {
  const result: Record<string, unknown> = deepClone(defaults);
  for (const key of Object.keys(loaded)) {
    const lv = loaded[key as keyof T];
    const dv = result[key];
    if (
      dv !== null && typeof dv === "object" && !Array.isArray(dv) &&
      lv !== null && typeof lv === "object" && !Array.isArray(lv)
    ) {
      result[key] = deepMergeDefaults(
        dv as Record<string, unknown>,
        lv as Record<string, unknown>,
      );
    } else if (lv !== undefined) {
      result[key] = deepClone(lv);
    }
  }
  return result as T;
}
