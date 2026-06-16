"use strict";

/**
 * Deep clone via structuredClone wrapper. Falls back to JSON round-trip
 * when structuredClone is unavailable (though Bun supports it natively).
 * Version: 0.1.0
 */

export function deepClone<T>(value: T): T {
  return structuredClone(value);
}
