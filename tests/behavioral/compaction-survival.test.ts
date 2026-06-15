"use strict";

import { describe, it, expect } from "bun:test";
import { cloneState, populatedState } from "../helpers/fixtures.js";
import { buildSurvivorContext } from "../../src/rendering/survivor-builder.js";

describe("compaction survival — buildSurvivorContext", () => {
  it("should include attention focus in survivor XML", () => {
    const state = populatedState();
    state.attention.focus = "Debug state persistence bug in writeAtomic";
    const xml = buildSurvivorContext(state);

    expect(xml).toContain("<focus>");
    expect(xml).toContain("Debug state persistence bug in writeAtomic");
    expect(xml).toContain("<noesis-state>");
    expect(xml).toContain("</noesis-state>");
  });

  it("should include workflow goal and status in survivor XML", () => {
    const state = populatedState();
    state.commitment.workflow.goal = "Implement cognitive substrate";
    state.commitment.workflow.status = "active";
    const xml = buildSurvivorContext(state);

    expect(xml).toContain("<workflow>");
    expect(xml).toContain("<goal>Implement cognitive substrate</goal>");
    expect(xml).toContain("<status>active</status>");
    expect(xml).toContain("</workflow>");
  });

  it("should include workflow step descriptors in survivor XML", () => {
    const state = populatedState();
    const xml = buildSurvivorContext(state);

    expect(xml).toContain("<step ");
    expect(xml).toContain("Write domain logic");
  });

  it("should produce well-formed XML with escaped special characters", () => {
    const state = populatedState();
    // Content that includes XML-sensitive characters
    state.attention.focus = "Fix <script>alert('xss & injection')</script>";
    state.commitment.workflow.goal = "A > B comparison check";
    const xml = buildSurvivorContext(state);

    // The XML should have escaped entities, not raw special chars
    expect(xml).not.toContain("<script>");
    expect(xml).not.toContain("'");
    expect(xml).toContain("&lt;script&gt;alert(&apos;xss &amp; injection&apos;)&lt;/script&gt;");
    expect(xml).toContain("A &gt; B comparison check");
  });

  it("should always include attention, workflow, and pointer sections", () => {
    const state = cloneState();
    const xml = buildSurvivorContext(state);

    expect(xml).toContain("<attention>");
    expect(xml).toContain("<workflow>");
    expect(xml).toContain("<pointer>");
    expect(xml).toContain("</noesis-state>");
  });

  it("should include learning entries from populated state", () => {
    const state = populatedState();
    const xml = buildSurvivorContext(state);

    expect(xml).toContain("<learning>");
    expect(xml).toContain("State corruption after unhandled exception during write");
  });
});
