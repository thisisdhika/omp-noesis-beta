"use strict";

/**
 * omp-noesis: Prompt Surface Module
 * Version: 1.0.1
 *
 * Source-of-truth metadata for the prompt-facing surface: canonical tool names,
 * alias mappings, command definitions, and builders for RULES.md / Noesis Index.md.
 *
 * Keep this file boring — const arrays and string templates, no runtime logic.
 * Adding a new tool/alias/command? Add it here and in the registration file.
 * The builders emit text that stays in sync with what is actually registered.
 */

// ============================================================================
// Types
// ============================================================================

export interface ToolDef {
  /** Canonical tool name as registered with OMP (e.g. "noesis_attend"). */
  name: string;
  /** Short human-readable label (e.g. "Noesis: Attend"). */
  label: string;
  /** One-line description of what the tool does. */
  description: string;
  /**
   * "canonical" — a first-class noesis tool.
   * "alias" — alternative name that delegates to a canonical tool.
   */
  category: "canonical" | "alias";
  /** For aliases: the canonical tool this delegates to. */
  canonicalName?: string;
}

export interface CommandDef {
  /** Command name including namespace (e.g. "noesis:init"). */
  name: string;
  /** One-line description. */
  description: string;
}

// ============================================================================
// Canonical Tools
// ============================================================================

export const CANONICAL_TOOLS: readonly ToolDef[] = [
  {
    name: "noesis_attend",
    label: "Noesis: Attend",
    description:
      "Set current focus (task, files, graph queries) at task start or on shift. Optionally runs graph queries to enrich context.",
    category: "canonical",
  },
  {
    name: "noesis_state_inspect",
    label: "Noesis: State Inspect",
    description:
      "Read live in-memory cognitive state — beliefs, decisions, hypotheses, learning, workflows, attention, token profile, compaction, provenance. Supports full-text search across all layers.",
    category: "canonical",
  },
  {
    name: "noesis_believe_fact",
    label: "Noesis: Believe Fact",
    description:
      "Store a verified belief fact (from graph, execution, user, or confident inference). Not for speculation or routine tool calls. For decisions use noesis_believe_decision.",
    category: "canonical",
  },
  {
    name: "noesis_believe_decision",
    label: "Noesis: Believe Decision",
    description:
      "Record a design or workflow decision with rationale. Alternative-aware: what was chosen, what was rejected, and why.",
    category: "canonical",
  },
  {
    name: "noesis_infer",
    label: "Noesis: Infer",
    description:
      "Manage hypotheses and reasoning. Supports add_hypothesis, update_hypothesis, add_reasoning, capture_lesson. Confirmed hypotheses auto-promote to beliefs.",
    category: "canonical",
  },
  {
    name: "noesis_commit",
    label: "Noesis: Commit",
    description:
      "Workflow tracking for multi-step tasks. Supports extend_workflow, replace_workflow, update_step, add_action. Tracks cognition, not execution.",
    category: "canonical",
  },
  {
    name: "noesis_sandbox",
    label: "Noesis: Sandbox",
    description:
      "Speculative belief experimentation sandbox. Supports create, explore <content> [confidence] [tags] [evidence], merge, discard, list. Safe what-if space before committing.",
    category: "canonical",
  },
  {
    name: "noesis_federate",
    label: "Noesis: Federate",
    description:
      "Multi-agent belief federation. Supports publish <beliefId> [fact|decision], pull, revise, retract, identity, status. Share beliefs across agent instances.",
    category: "canonical",
  },
];

// ============================================================================
// Aliases
// ============================================================================

export const ALIAS_ENTRIES: readonly ToolDef[] = [
  {
    name: "focus_task",
    label: "Noesis: Focus Task",
    description: "Alias for noesis_attend. Set current task focus at task start.",
    category: "alias",
    canonicalName: "noesis_attend",
  },
  {
    name: "switch_focus",
    label: "Noesis: Switch Focus",
    description: "Alias for noesis_attend. Quick mid-task focus update without graph queries.",
    category: "alias",
    canonicalName: "noesis_attend",
  },
  {
    name: "store_memory",
    label: "Noesis: Store Memory",
    description: "Alias for noesis_believe_fact. Store a verified fact. For decisions, use store_decision.",
    category: "alias",
    canonicalName: "noesis_believe_fact",
  },
  {
    name: "store_decision",
    label: "Noesis: Store Decision",
    description: "Alias for noesis_believe_decision. Store a design decision with rationale.",
    category: "alias",
    canonicalName: "noesis_believe_decision",
  },
  {
    name: "test_hypothesis",
    label: "Noesis: Test Hypothesis",
    description: "Alias for noesis_infer. Manage hypotheses and reasoning.",
    category: "alias",
    canonicalName: "noesis_infer",
  },
  {
    name: "track_workflow",
    label: "Noesis: Track Workflow",
    description: "Alias for noesis_commit. Track multi-step workflows.",
    category: "alias",
    canonicalName: "noesis_commit",
  },
  {
    name: "read_memory",
    label: "Noesis: Read Memory",
    description: "Alias for noesis_state_inspect. Query live in-memory cognitive state — beliefs, decisions, hypotheses, learning, or keyword search across layers.",
    category: "alias",
    canonicalName: "noesis_state_inspect",
  },
];

// ============================================================================
// Commands
// ============================================================================

export const COMMANDS: readonly CommandDef[] = [
  {
    name: "noesis:init",
    description: "Initialize Noesis cognitive substrate for this project",
  },
  {
    name: "noesis:token-profile",
    description: "Display token budget usage across cognitive state sections",
  },
  {
    name: "noesis:debug",
    description: "Cognitive observability — provenance, attention, compaction, state summary",
  },
  {
    name: "noesis:review",
    description: "Manage beliefs flagged for human review — pending, accept <id>, reject <id>",
  },
  {
    name: "noesis:sandbox",
    description: "Speculative belief sandbox — create, explore <id> <content>, merge <id>, discard <id>, list",
  },
  {
    name: "noesis:federate",
    description: "Multi-agent belief federation — publish, pull, revise, retract, identity, status",
  },
];

// ============================================================================
// Lookup Tables (small static tables → Record per project convention)
// ============================================================================

/** Tool name → ToolDef for both canonical and alias entries. */
export const TOOL_BY_NAME: Record<string, ToolDef> = Object.fromEntries(
  [...CANONICAL_TOOLS, ...ALIAS_ENTRIES].map((t) => [t.name, t]),
);

/** Alias name → canonical tool name. */
export const ALIAS_TO_CANONICAL: Record<string, string> = Object.fromEntries(
  ALIAS_ENTRIES.map((a) => [a.name, a.canonicalName!]),
);

// ============================================================================
// RULES.md Builder
// ============================================================================

const RULES_START = "[noesis-rules]";
const RULES_END = "[end-noesis-rules]";

/**
 * Build the managed block content for RULES.md from live metadata.
 * The block is delimited by [noesis-rules] / [end-noesis-rules] markers
 * so init-command's mergeRulesMd can surgically replace it.
 */
export function buildRulesMd(): string {
  const toolsSection = CANONICAL_TOOLS.map(
    (t) => `- **\`${t.name}\`** — ${t.description}`,
  ).join("\n");

  const aliasesSection = ALIAS_ENTRIES.map(
    (a) => `- \`${a.name}\` → \`${a.canonicalName}\` — ${a.description.replace(/^Alias for \S+\. /, "")}`,
  ).join("\n");

  const commandsSection = COMMANDS.map(
    (c) => `- \`${c.name}\` — ${c.description}`,
  ).join("\n");

  return `# Noesis Rules
- **${RULES_START}**

**Workflow:**
- **Task start →** \`noesis_attend\` (focus + optional graph queries). ALWAYS. No exceptions.
- **Before assuming →** \`noesis_state_inspect\` (check live session state first).
- **After verifying a fact →** \`noesis_believe_fact\` | After a decision → \`noesis_believe_decision\`
- **Planning multi-step work →** \`noesis_commit\` | Testing theories → \`noesis_infer\` (add → update/capture)
- **Quick context switch →** \`noesis_attend\` (omit graphQueries, max 200 chars)
- **Speculative beliefs →** \`noesis_sandbox\` (explore before commit)
- **Cross-agent sharing →** \`noesis_federate\` (publish/pull identities)

**Available Tools:**

${toolsSection}

**Aliases (shorthand names that delegate to canonical tools):**

${aliasesSection}

**Slash Commands:**

${commandsSection}

**NEVER:**
- Auto-believe INFERRED graph edges. Verify first.
- Duplicate OMP plan surface. \`noesis_commit\` = cognition, not execution.
- Log every tool result as learning. Only significant events.
- Delete beliefs. Supersede → archive for audit.
- Use \`noesis_state_inspect\` for cross-session queries (vault backends for durable artifacts).

**Templates:**
- Fact: {mechanism} at {path} {action} {target} using {method}
- Decision: Use {choice} over {alt} because {reason}. Rejected: {rejected}
- Learning: {what} failed when {trigger} | root: {cause} | fix: {fix} verified by {cmd}

**Confidence:**
| Source          | Default      |
|-----------------|--------------|
| execution       | 1.0          |
| user            | 1.0          |
| graph EXTRACTED | 1.0          |
| graph INFERRED  | 0.55–0.95    |
| graph AMBIGUOUS | 0.55         |
| inference       | 0.50–0.95    |
| omp-memory      | ≤0.75        |
| obsidian-import | 0.50         |

**Graph:**
- Fresh query: \`noesis_attend(focus="...", graphQueries=[...], ensureFresh=true)\` re-extracts the knowledge graph.
- Stale: omit \`ensureFresh\` (or false) for routine re-focus.
- STALE mode: −0.10 confidence penalty, floor 0.55.
- Modes: FULL | STALE (−0.10) | NO_GRAPH | DEGRADED
- Use \`skill://graphify\` for headless CI extraction. All graph → attend-tool or skill file, never direct CLI.

**Boundaries:**
- \`.omp/noesis/state.json\` = authoritative cognitive state. Persists via survivor set + preserveData.noesis.
- \`noesis_state_inspect\` = live in-memory state only — not for vault/cross-session queries.
- \`noesis_believe_fact\` / \`store_memory\` = durable cross-session storage in state.json.
- \`noesis_sandbox\` = speculative what-if space (discard to clean up).
- Obsidian vault = human-readable projection (write-only from noesis).

- **${RULES_END}**`;
}

// ============================================================================
// Noesis Index.md Builder
// ============================================================================

/**
 * Build the Noesis Index.md content from live metadata.
 */
export function buildNoesisIndexMd(): string {
  const toolsTable = CANONICAL_TOOLS.map(
    (t) => `| \`${t.name}\` | ${t.description} |`,
  ).join("\n");

  const aliasesTable = ALIAS_ENTRIES.map(
    (a) => `| \`${a.name}\` → \`${a.canonicalName}\` | ${a.description.replace(/^Alias for \S+\. /, "")} |`,
  ).join("\n");

  const commandsTable = COMMANDS.map(
    (c) => `| \`${c.name}\` | ${c.description} |`,
  ).join("\n");

  return `# Noesis Index

Welcome to your Noesis cognitive state index. This file is your window into what the AI assistant has learned, decided, and is tracking in this project.

## Quick Links

| Link | Purpose |
|------|---------|
| [State File](.omp/noesis/state.json) | Raw cognitive state (beliefs, decisions, learning, attention, commitments) |
| [Configuration](.omp/config.yml) | Noesis runtime settings |
| [RULES.md](.omp/RULES.md) | AI assistant operating rules |
| [Graph Knowledge Map](graphify-out/index.md) | Full knowledge graph index |

## Canonical Tools

| Tool | Description |
|------|-------------|
${toolsTable}

## Aliases

| Alias | Description |
|-------|-------------|
${aliasesTable}

## Slash Commands

| Command | Description |
|---------|-------------|
${commandsTable}

## Cognitive Layers

### Beliefs
What the assistant knows about this project — facts, decisions, and domain knowledge that persist across sessions via \`.omp/noesis/state.json\`.

### Attention
What the assistant is currently focused on — recent queries, active context windows, and priority areas.

### Learning
What the assistant has learned from experience — debugging insights, patterns, and validation results.

### Commitments
Active goals, promises, and intentions that the assistant is tracking and working toward.

## Vault Operations

The assistant maintains persistent state through:
- **state.json** (\`.omp/noesis/state.json\`) — Authoritative cognitive state (beliefs, decisions, learning, workflows). Survives compaction via survivor set.
- **OMP Memory** — Cross-session durability channel (when available). Beliefs and decisions sync bidirectionally with OMP's memory system via HydrateFromMemoryUseCase.
- **Obsidian vault** (\`.obsidian/noesis/\`) — Human-readable projection of cognitive state. Write-only from noesis, readable by you.

## Tips

1. Review beliefs periodically to ensure accuracy
2. Clear outdated information through state compaction
3. Use the knowledge graph for codebase-wide reasoning
4. Index auto-updates at session start
5. Use \`noesis_attend\` to set focus, \`noesis_state_inspect\` to query live state
`;
}

/** Marker constants reused by init-command's mergeRulesMd. */
export { RULES_START, RULES_END };
