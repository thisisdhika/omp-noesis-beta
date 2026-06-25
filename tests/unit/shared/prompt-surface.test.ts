"use strict";

/**
 * Unit tests for the prompt-surface module.
 *
 * Verifies that the metadata arrays and builder functions produce correct
 * content that reflects the current tool/alias/command surface and does not
 * contain stale terminology.
 */

import { describe, it, expect } from "bun:test";
import {
  CANONICAL_TOOLS,
  ALIAS_ENTRIES,
  COMMANDS,
  TOOL_BY_NAME,
  ALIAS_TO_CANONICAL,
  buildRulesMd,
  buildNoesisIndexMd,
  RULES_START,
  RULES_END,
} from "../../../src/shared/prompt-surface.js";

// ============================================================================
// Tool Metadata
// ============================================================================

describe("CANONICAL_TOOLS", () => {
  it("has the 8 canonical tools", () => {
    expect(CANONICAL_TOOLS).toHaveLength(8);
  });

  it("includes noesis_attend", () => {
    const names = CANONICAL_TOOLS.map((t) => t.name);
    expect(names).toContain("noesis_attend");
    expect(names).toContain("noesis_state_inspect");
    expect(names).toContain("noesis_believe_fact");
    expect(names).toContain("noesis_believe_decision");
    expect(names).toContain("noesis_infer");
    expect(names).toContain("noesis_commit");
    expect(names).toContain("noesis_sandbox");
    expect(names).toContain("noesis_federate");
  });

  it("every canonical tool has a non-empty description", () => {
    for (const t of CANONICAL_TOOLS) {
      expect(t.description).not.toBe("");
      expect(t.label).not.toBe("");
    }
  });

  it("all have category 'canonical'", () => {
    for (const t of CANONICAL_TOOLS) {
      expect(t.category).toBe("canonical");
    }
  });
});

// ============================================================================
// Alias Entries
// ============================================================================

describe("ALIAS_ENTRIES", () => {
  it("has the 7 aliases", () => {
    expect(ALIAS_ENTRIES).toHaveLength(7);
  });

  it("maps each alias to its canonical tool", () => {
    const canonicalNames = CANONICAL_TOOLS.map((t) => t.name);
    for (const a of ALIAS_ENTRIES) {
      expect(a.category).toBe("alias");
      expect(canonicalNames).toContain(a.canonicalName!);
      expect(a.canonicalName).not.toBe(a.name);
    }
  });

  it("no phantom mnemopi or retain aliases", () => {
    const names = ALIAS_ENTRIES.map((a) => a.name);
    expect(names).not.toContain("mnemopi");
    expect(names).not.toContain("retain");
  });

  it("includes focus_task, store_memory, read_memory, track_workflow", () => {
    const names = ALIAS_ENTRIES.map((a) => a.name);
    expect(names).toContain("focus_task");
    expect(names).toContain("switch_focus");
    expect(names).toContain("store_memory");
    expect(names).toContain("store_decision");
    expect(names).toContain("test_hypothesis");
    expect(names).toContain("track_workflow");
    expect(names).toContain("read_memory");
  });

  it("every alias has a valid canonicalName pointing to an existing canonical tool", () => {
    const canonicalNames = new Set(CANONICAL_TOOLS.map((t) => t.name));
    for (const a of ALIAS_ENTRIES) {
      expect(canonicalNames.has(a.canonicalName!)).toBeTrue();
    }
  });
});

// ============================================================================
// Commands
// ============================================================================

describe("COMMANDS", () => {
  it("has the 6 commands", () => {
    expect(COMMANDS).toHaveLength(6);
  });

  it("includes all noesis:* commands", () => {
    const names = COMMANDS.map((c) => c.name);
    expect(names).toContain("noesis:init");
    expect(names).toContain("noesis:token-profile");
    expect(names).toContain("noesis:debug");
    expect(names).toContain("noesis:review");
    expect(names).toContain("noesis:sandbox");
    expect(names).toContain("noesis:federate");
  });

  it("every command has a non-empty description", () => {
    for (const c of COMMANDS) {
      expect(c.description).not.toBe("");
    }
  });
});

// ============================================================================
// Lookup Tables
// ============================================================================

describe("TOOL_BY_NAME", () => {
  it("contains all canonical tools and aliases", () => {
    for (const t of CANONICAL_TOOLS) {
      expect(TOOL_BY_NAME[t.name]).toBeDefined();
      expect(TOOL_BY_NAME[t.name]).toBe(t);
    }
    for (const a of ALIAS_ENTRIES) {
      expect(TOOL_BY_NAME[a.name]).toBeDefined();
      expect(TOOL_BY_NAME[a.name]).toBe(a);
    }
  });
});

describe("ALIAS_TO_CANONICAL", () => {
  it("maps each alias to its canonical name", () => {
    for (const a of ALIAS_ENTRIES) {
      expect(ALIAS_TO_CANONICAL[a.name]).toBe(a.canonicalName);
    }
  });

  it("does not contain canonical tool names", () => {
    for (const t of CANONICAL_TOOLS) {
      expect(ALIAS_TO_CANONICAL[t.name]).toBeUndefined();
    }
  });
});

// ============================================================================
// RULES.md Builder
// ============================================================================

describe("buildRulesMd", () => {
  const content = buildRulesMd();

  it("contains the managed block markers", () => {
    expect(content).toContain(RULES_START);
    expect(content).toContain(RULES_END);
    expect(content.indexOf(RULES_START)).toBeLessThan(content.indexOf(RULES_END));
  });

  it("lists all canonical tools", () => {
    for (const t of CANONICAL_TOOLS) {
      expect(content).toContain(t.name);
    }
  });

  it("lists all aliases", () => {
    for (const a of ALIAS_ENTRIES) {
      expect(content).toContain(a.name);
      expect(content).toContain(`→ \`${a.canonicalName}\``);
    }
  });

  it("lists all commands", () => {
    for (const c of COMMANDS) {
      expect(content).toContain(c.name);
    }
  });
  it("does not contain phantom mnemopi references", () => {
    expect(content).not.toMatch(/\b(mnemopi)\b/i);
  });

  it("does not mention OMP retain tool", () => {
    expect(content).not.toMatch(/\bretain\s+tool\b/i);
  });

  it("mentions ensureFresh", () => {
    expect(content).toMatch(/ensureFresh/i);
  });

  it("mentions sandbox and federate", () => {
    expect(content).toMatch(/sandbox/i);
    expect(content).toMatch(/federate/i);
  });

  it("includes the confidence section", () => {
    expect(content).toContain("**Confidence:**");
  });

  it("includes boundary descriptions", () => {
    expect(content).toContain("**Boundaries:**");
  });

  it("includes graph section", () => {
    expect(content).toContain("**Graph:**");
  });

  it("includes Workflow instructions", () => {
    expect(content).toContain("**Workflow:**");
  });
});

// ============================================================================
// Noesis Index.md Builder
// ============================================================================

describe("buildNoesisIndexMd", () => {
  const content = buildNoesisIndexMd();

  it("has a title", () => {
    expect(content).toContain("# Noesis Index");
  });

  it("lists all canonical tools in a table", () => {
    for (const t of CANONICAL_TOOLS) {
      expect(content).toContain(`\`${t.name}\``);
    }
  });

  it("lists all aliases in a table with arrows", () => {
    for (const a of ALIAS_ENTRIES) {
      expect(content).toContain(`\`${a.name}\` → \`${a.canonicalName}\``);
    }
  });

  it("lists all commands in a table", () => {
    for (const c of COMMANDS) {
      expect(content).toContain(`\`${c.name}\``);
    }
  });

  // Stale terminology checks
  it("does not contain phantom mnemopi references", () => {
    expect(content).not.toMatch(/\b(mnemopi)\b/i);
  });

  it("mentions OMP Memory correctly", () => {
    expect(content).toContain("OMP Memory");
  });

  it("mentions state.json as authoritative", () => {
    expect(content).toContain("state.json");
    expect(content).toMatch(/Authoritative/i);
  });

  it("includes cognitive layers", () => {
    expect(content).toContain("### Beliefs");
    expect(content).toContain("### Attention");
    expect(content).toContain("### Learning");
    expect(content).toContain("### Commitments");
  });

  it("includes Quick Links section", () => {
    expect(content).toContain("## Quick Links");
  });
});

// ============================================================================
// Cross-consistency
// ============================================================================

describe("cross-consistency", () => {
  it("RULES.md and Index.md both use same tool names", () => {
    const rules = buildRulesMd();
    const index = buildNoesisIndexMd();
    for (const t of CANONICAL_TOOLS) {
      expect(rules).toContain(t.name);
      expect(index).toContain(t.name);
    }
    for (const a of ALIAS_ENTRIES) {
      expect(rules).toContain(a.name);
      expect(index).toContain(a.name);
    }
  });

  it("total tool surface (canonical + alias) matches registration count", () => {
    const total = CANONICAL_TOOLS.length + ALIAS_ENTRIES.length;
    // 8 canonical + 7 aliases = 15 registered tools
    expect(total).toBe(15);
  });
});
