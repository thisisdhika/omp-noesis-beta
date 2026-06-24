"use strict";

/**
 * Property-based tests for survivor-builder compaction.
 *
 * Invariants:
 * 1. buildSurvivorContext always returns well-formed XML.
 * 2. High-confidence facts (>= 0.85) always appear in the survivor context
 *    when within capacity bounds.
 * 3. The survivor is deterministic: same state → identical string.
 *
 * Version: 1.0.0
 */

import fc from "fast-check";
import { describe, it, expect } from "bun:test";
import { buildSurvivorContext } from "../../src/rendering/survivor-builder.js";
import { noesisState, beliefFact, beliefIdFromState } from "../helpers/generators.js";
import { cloneState } from "../helpers/fixtures.js";
import { addFact } from "../../src/domains/belief/belief-domain.js";
import { escapeXml } from "../../src/shared/text.js";

// ---------------------------------------------------------------------------
// 1. Well-formed XML
// ---------------------------------------------------------------------------

describe("survivor is well-formed XML", () => {
  it("returns a non-empty string that starts and ends with the noesis-state tag", () => {
    fc.assert(
      fc.property(noesisState(), (state) => {
        const xml = buildSurvivorContext(state);
        expect(typeof xml).toBe("string");
        expect(xml.length).toBeGreaterThan(0);
        expect(xml.trim().startsWith("<noesis-state>")).toBe(true);
        expect(xml.trim().endsWith("</noesis-state>")).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
  it("every opening tag has a matching closing tag (balanced nesting)", () => {
    fc.assert(
      fc.property(noesisState(), (state) => {
        const xml = buildSurvivorContext(state);
        // Tokenize tags — split on < and > boundaries
        const tokens: string[] = [];
        const re = /<\/?(\w+)[^>]*>/g;
        let match: RegExpExecArray | null;
        while ((match = re.exec(xml)) !== null) {
          tokens.push(match[0]);
        }

        // Stack-based well-formedness check
        const stack: string[] = [];
        for (const tok of tokens) {
          if (tok.startsWith("</")) {
            const name = tok.slice(2, -1);
            expect(stack.pop()).toBe(name);
          } else if (!tok.endsWith("/>")) {
            // Not self-closing
            const name = tok.slice(1, -1).split(/\s+/)[0]!;
            stack.push(name);
          }
        }
        expect(stack.length).toBe(0);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Critical beliefs survive
// ---------------------------------------------------------------------------

describe("critical beliefs survive compaction", () => {
  it("a high-confidence fact (>= 0.85) added to an empty state appears in the survivor", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.85, max: 1, noNaN: true, noDefaultInfinity: true }),
        fc.string({ minLength: 1, maxLength: 80 }),
        (confidence, content) => {
          const state = cloneState();
          const fact = addFact(state, { content, confidence, source: "execution", contradicts: undefined });
          // addFact doesn't set epistemicStatus — set a valid value so buildSurvivorContext works
          fact.epistemicStatus = "probable";
          const xml = buildSurvivorContext(state);
          expect(xml).toContain(escapeXml(content));
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Deterministic output
// ---------------------------------------------------------------------------

describe("survivor is deterministic", () => {
  it("the same state always produces the same survivor string", () => {
    fc.assert(
      fc.property(noesisState(), (state) => {
        const first = buildSurvivorContext(state);
        const second = buildSurvivorContext(state);
        expect(second).toBe(first);
      }),
      { numRuns: 100 },
    );
  });
});
