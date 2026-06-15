"use strict";

/**
 * Deep clone via structuredClone wrapper. Falls back to JSON round-trip
 * when structuredClone is unavailable (though Bun supports it natively).
 */

export function deepClone<T>(value: T): T {
  return structuredClone(value);
}
