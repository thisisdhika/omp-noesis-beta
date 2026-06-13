# OMP Platform — Full Research

> Source: OMP documentation (omp://), GitHub releases, and platform analysis (2025-2026)
> Compiled: 2026-06-12

---

## 1. Extension API

**Source**: omp://extensions.md

Extensions are the primary way to add capabilities to `oh-my-pi`. A single extension module can register tools the LLM can call, slash commands users can invoke, and event handlers that run throughout the session lifecycle — all from one TypeScript file.

### Minimum viable extension

```ts
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("My extension loaded!", "info");
  });
}
```

### Full example

```ts
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

export default function myExtension(pi: ExtensionAPI) {
  const z = pi.zod;

  // Runs once when the session loads
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify(`Session ready in ${ctx.cwd}`, "info");
  });

  // Slash command: /greet
  pi.registerCommand("greet", {
    description: "Send a greeting into the conversation",
    handler: async (args, ctx) => {
      const name = args.trim() || "world";
      pi.sendMessage(
        {
          customType: "greeting",
          content: `Hello, ${name}!`,
          display: true,
          attribution: "user",
        },
        { triggerTurn: false }
      );
      ctx.ui.notify(`Greeted ${name}`, "info");
    },
  });

  // LLM-callable tool
  pi.registerTool({
    name: "word_count",
    label: "Word Count",
    description: "Count the words in a string",
    parameters: z.object({
      text: z.string().describe("Text to count"),
    }),
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const count = params.text.split(/\s+/).filter(Boolean).length;
      return {
        content: [{ type: "text", text: String(count) }],
        details: { count },
      };
    },
  });
}
```

### Discovery paths

1. Native `.omp` locations discovered through the capability system:
   - `<cwd>/.omp/extensions/`
   - `~/.omp/agent/extensions/`
   - legacy extension paths listed in `.omp/settings.json#extensions` or `~/.omp/agent/settings.json#extensions`
2. Marketplace-installed plugins from the OMP and Claude plugin registries.
3. Explicit configured paths passed by the CLI (`omp --extension ./my-ext.ts`, also `-e`; `--hook` is treated as an alias) and by the `extensions:` setting in config.

### Package.json manifest

```json
{
  "name": "my-omp-extension",
  "omp": {
    "extensions": ["./src/main.ts"]
  }
}
```

### Registering commands

```ts
pi.registerCommand("my-cmd", {
  description: "What the command does",
  handler: async (args, ctx) => {
    // args: everything the user typed after /my-cmd
    // ctx: ExtensionCommandContext — includes ctx.ui, ctx.cwd, session controls
    ctx.ui.notify("Running!", "info");
    await ctx.waitForIdle();
    await ctx.newSession();
  },
});
```

### Registering tools

```ts
const z = pi.zod;

pi.registerTool({
  name: "search_notes",
  label: "Search Notes",
  description: "Full-text search through project notes",
  parameters: z.object({
    query: z.string().describe("Search query"),
    limit: z.number().default(10).describe("Max results").optional(),
  }),
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    if (signal?.aborted) {
      return { content: [{ type: "text", text: "Cancelled" }] };
    }
    onUpdate?.({ content: [{ type: "text", text: "Searching..." }] });
    // ... do work ...
    return {
      content: [{ type: "text", text: `Found N results for "${params.query}"` }],
      details: { query: params.query, count: 0 },
    };
  },
});
```

### Subscribing to events

```ts
pi.on("tool_call", async (event, ctx) => {
  // event.toolName, event.input, event.toolCallId
  if (event.toolName !== "bash") return;

  const command = String((event.input as { command?: unknown }).command ?? "");
  if (command.includes("rm -rf /")) {
    return { block: true, reason: "Blocked by safety policy" };
  }
});

pi.on("turn_end", async (_event, ctx) => {
  ctx.ui.setStatus("tokens", `~${ctx.getContextUsage()?.tokens ?? "?"} tokens`);
});
```

### Important constraints

- **Do not call runtime actions during load.** Methods like `pi.sendMessage()` throw `ExtensionRuntimeNotInitializedError` if called synchronously during module evaluation (before a session is active). Register handlers/tools/commands during load; perform runtime actions only from event handlers, tools, or commands.
- **`tool_call` errors are fail-closed.** If a `tool_call` handler throws, the tool is blocked.
- **Command names must not clash with built-ins.** Conflicts are skipped with a diagnostic log.

---

## 2. Hooks

**Source**: omp://hooks.md

The hook subsystem provides event-driven runtime interceptors that can block/modify behavior during execution.

### Event surfaces

#### Session events

- `session_start`
- `session_before_switch` → can return `{ cancel?: boolean }`
- `session_switch`
- `session_before_branch` → can return `{ cancel?: boolean; skipConversationRestore?: boolean }`
- `session_branch`
- `session_before_compact` → can return `{ cancel?: boolean; compaction?: CompactionResult }`
- `session.compacting` → can return `{ context?: string[]; prompt?: string; preserveData?: Record<string, unknown> }`
- `session_compact`
- `session_before_tree` → can return `{ cancel?: boolean; summary?: { summary: string; details?: unknown } }`
- `session_tree`
- `session_shutdown`

#### Agent/context events

- `context` → can return `{ messages?: Message[] }`
- `before_agent_start` → can return `{ message?: { customType; content; display; details } }`
- `agent_start`
- `agent_end`
- `turn_start`
- `turn_end`
- `auto_compaction_start`
- `auto_compaction_end`
- `auto_retry_start`
- `auto_retry_end`
- `ttsr_triggered`
- `todo_reminder`

#### Tool events (pre/post model)

- `tool_call` (pre-execution) → can return `{ block?: boolean; reason?: string }`
- `tool_result` (post-execution) → can return `{ content?; details?; isError? }`

### What hooks can mutate

- LLM context for a single call via `context` (`messages` replacement chain)
- tool output content/details on successful tool calls (`tool_result` path)
- pre-agent injected message via `before_agent_start`
- cancellation/custom compaction/tree behavior via `session_before_*` and `session.compacting`

### What hooks cannot mutate

- raw tool input parameters in-place (only block/allow on `tool_call`)
- execution continuation after thrown tool errors (error path rethrows)
- final success/error status in wrapper behavior (returned `isError` is typed but not applied by `HookToolWrapper`)

---

## 3. Compaction

**Source**: omp://compaction.md

Compaction and branch summaries are the two mechanisms that keep long sessions usable without losing prior work context.

### Compaction strategies

1. **context-full** (default): LLM-based summarization of old context
2. **handoff**: Create a new session with a handoff document
3. **shake**: Shake-based compression
4. **snapcompact**: Bitmap archival of discarded history for vision models
5. **off**: Disable compaction

### Compaction pipeline

#### Triggers

1. **Manual context compaction**: `/compact [instructions]`
2. **Automatic overflow recovery**: after a same-model assistant error that matches context overflow
3. **Automatic incomplete-output recovery**: after a same-model assistant message ends with `stopReason === "length"`
4. **Automatic threshold maintenance**: after a successful turn when context exceeds the resolved threshold
5. **Idle maintenance**: `runIdleCompaction()` can invoke the same auto-maintenance path

### Hook touchpoints

#### `session_before_compact`

Pre-compaction hook. Can:
- cancel compaction (`{ cancel: true }`)
- provide full custom compaction payload (`{ compaction: CompactionResult }`)

#### `session.compacting`

Prompt/context customization hook for default compaction. Can return:
- `prompt` (override base summary prompt)
- `context` (extra context lines injected into `<additional-context>`)
- `preserveData` (stored on compaction entry)

#### `session_compact`

Post-compaction notification with saved `compactionEntry` and `fromExtension` flag.

### Snapcompact strategy

`compaction.strategy: "snapcompact"` replaces the LLM summarization call with a local, deterministic archival pass:

- The discarded history is serialized, whitespace-collapsed, and printed onto model-aware PNG frames using bundled public-domain pixel fonts.
- The shape — and frame size — resolve from the **model id** when the model line was measured.
- Frames persist under `CompactionEntry.preserveData.snapcompact` and are re-attached to the `compactionSummary` message as image blocks on every context rebuild.
- Later compactions carry earlier frames forward. The frame budget is provider-aware.
- No model, API key, or network is involved, so snapcompact is also safe for overflow recovery.

### Handoff generation

`packages/agent/src/compaction/compaction.ts` also exports `generateHandoff(...)`. Handoff generation uses the same `completeSimple(...)` oneshot style as summarization, but it preserves the live agent cache prefix by sending the active system prompt, tool array, and real LLM message history.

Handoff does not write a `CompactionEntry`. `AgentSession.handoff()` owns the session transition: it starts a new session, injects the generated document as a visible `custom_message` with `customType: "handoff"`, and rebuilds agent messages from that new session.

### Settings and defaults

- `compaction.enabled` = `true`
- `compaction.strategy` = `"context-full"`
- `compaction.reserveTokens` = `16384`
- `compaction.keepRecentTokens` = `20000`
- `compaction.autoContinue` = `true`
- `compaction.remoteEnabled` = `true`
- `compaction.remoteEndpoint` = `undefined`
- `compaction.thresholdPercent` = `-1` and `compaction.thresholdTokens` = `-1`
- `compaction.idleEnabled` = `false`
- `compaction.idleThresholdTokens` = `200000`
- `compaction.idleTimeoutSeconds` = `300`
- `branchSummary.enabled` = `false`
- `branchSummary.reserveTokens` = `16384`

---

## 4. Skills

**Source**: omp://skills.md

Skills are file-backed capability packs discovered at startup and exposed to the model as:
- lightweight metadata in the system prompt (name + description)
- on-demand content via the `read` tool against `skill://...`
- optional interactive `/skill:<name>` commands

### Required layout

```
<skills-root>/<skill-name>/SKILL.md
```

### SKILL.md frontmatter

- `name?: string`
- `description?: string`
- `globs?: string[]`
- `alwaysApply?: boolean`
- `hide?: boolean`

### Discovery pipeline

`discoverSkills()` does two passes:
1. **Capability providers** via `loadCapability("skills")`
2. **Custom directories** via `scanSkillsFromDir(..., { requireDescription: true })`

### Provider precedence

1. `native` (priority 100) — `.omp` user/project skills
2. `omp-plugins` (priority 90) — `skills/` bundled next to extension packages
3. `claude` (priority 80)
4. priority 70 group (in registration order): `claude-plugins`, `agents`, `codex`
5. `opencode` (priority 55)
6. `github` (priority 30) — `.github/skills/<name>/SKILL.md`

### Runtime usage

- System prompt includes discovered skills list (excluding `hide: true`)
- `/skill:<name>` reads the skill file, strips frontmatter, injects body as custom message
- `skill://<name>` resolves to that skill's `SKILL.md`
- `skill://<name>/<relative-path>` resolves inside that skill directory

---

## 5. Orchestration

**Source**: GitHub releases, issue #1544, @oh-my-pi/swarm-extension

### `orchestrate` keyword (v15.6.0)

- Mirrors `ultrathink`
- Activates multi-phase parallel-subagent orchestration
- Word-bounded and case-insensitive
- Removed standalone `ask`, `task`, `yield` tools
- Delegation now uses persistent delegate agents + IRC coordination

### @oh-my-pi/swarm-extension

- YAML-defined DAG swarms
- Pipeline/sequential/parallel execution modes
- Dependency resolution via `waits_for` and `reports_to`
- Topological wave execution
- Fan-In, Sequential Chain, Diamond, Hybrid dependencies
- Supports various task types: shell commands, file I/O, web/search tools, browser automation

### PR #1559: Workflow tool

- First-party `workflow` tool in `packages/coding-agent`
- Sandboxed JS scripts via `node:vm` + AST validation
- Lightweight subagents via `createAgentSession` with `Settings.isolated()` / `SessionManager.inMemory()`
- Structured output via a zod-backed custom tool
- TUI rendering via `Text` from `@oh-my-pi/pi-tui` with live streaming updates
- Tool placement: `discoverable` (not essential), gated by `workflow.enabled` (default true)

### Issue #1544: Dynamic workflow discussion

The issue requested Claude-Code-style dynamic workflows. Key design questions raised:
1. **Audience**: Is this for the model or the user?
2. **Determinism vs. flexibility**: Hard-coded step graph or LLM-driven plan?
3. **Format**: Markdown + frontmatter, YAML, or TypeScript?
4. **State & I/O contract**: Inputs/outputs between steps, schema validation, error handling
5. **Composition**: Should a workflow be able to call another workflow?

---

## 6. Memory

**Source**: omp://memory.md, omp://mnemosyne-memory-backend.md

### Mnemopi

Mnemopi is the cross-session long-term memory system for OMP. It provides:
- `recall` — search long-term memory
- `reflect` — synthesize answers across many memories
- `retain` — store durable facts
- `memory_edit` — update/forget/invalidate memories

### Pre-compaction context injection

Mnemopi injects pre-compaction context into `<additional-context>` tags during compaction. This ensures that long-term memories survive compaction boundaries.

---

## 7. Handoff Pipeline

**Source**: omp://handoff-generation-pipeline.md

### End-to-end lifecycle

1. `/handoff` is declared in builtin slash command metadata
2. `CommandController.handleHandoffCommand` performs a preflight guard
3. `AgentSession.handoff()` generates the handoff document
4. New session is created with `parentSession` pointing at the previous session
5. Handoff document is injected as `custom_message` with `customType: "handoff"`
6. Agent messages are rebuilt from the new session

### Custom message pattern

```ts
this.sessionManager.appendCustomMessageEntry(
  "handoff",
  handoffContent,
  true,
  undefined,
  "agent",
);
```

This pattern is how noesis can persist structured state that survives session transitions.

---

## 8. Task Tool

**Source**: omp://tools/task.md

The task tool spawns subagents to work in the background. Key features:
- Non-blocking spawning
- Parallelism via multiple tasks in one call
- Agent types: task, explore, oracle, designer, plan, quick_task, reviewer, librarian
- IRC coordination between agents
- Job management (list, poll, cancel)

---

## 9. Existing OMP Extensions

**Source**: omp-commandcode-provider/package.json

The existing `omp-commandcode-provider` extension demonstrates the extension pattern:
- `package.json` with `omp.extensions` field
- `index.ts` as entry point
- `src/` directory with implementation
- `tests/` directory with test files
- Zero runtime dependencies on `@oh-my-pi/*` packages (sandbox constraint)
- Dev dependencies: `typescript`, `tsx`, `@types/node`, `prettier`

---

## Implications for omp-noesis

OMP provides the exact primitives noesis needs:

1. **Extension API**: Noesis registers as an extension with `omp.extensions` in `package.json`. It uses `pi.registerTool` for the four cognitive tools and `pi.on` for the four hooks.

2. **Hook integration**: The four hooks (`context`, `session.compacting`, `tool_result`, `before_agent_start`) are the entire integration surface. Noesis does not modify OMP core.

3. **Compaction survival**: The `session.compacting` hook with `preserveData` is the load-bearing integration point. Noesis injects its structured state into both `<noesis-state>` context and `preserveData.noesis`.

4. **Skills integration**: Noesis can ship as a skill (`skills/noesis/SKILL.md`) alongside the extension. The skill provides the agent with instructions on how to use the cognitive tools.

5. **Orchestration compatibility**: Noesis works WITH OMP's orchestration primitives, not instead of them. The cognitive state informs orchestration decisions but does not replace them.

6. **Handoff pattern**: The `customType: "handoff"` pattern is how noesis can persist structured state across session transitions. Noesis uses `customType: "noesis-state"` for the same purpose.

7. **Sandbox constraint**: Noesis must have zero runtime dependencies on `@oh-my-pi/*` packages. All OMP types come from the peer dependency.
