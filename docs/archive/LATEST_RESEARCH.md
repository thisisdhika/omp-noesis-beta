> **⚠ STALE NOTICE — Archived research notes**
> This document (2026-06-21) contains general research on token budgeting and
> context engineering that informed design decisions. It does not describe the
> current v1.0.1 tool/command/prompt surface. See `docs/` for current documentation.
>

# Latest Research

> Status: Research notes for omp-noesis planning
> Date: 2026-06-21

## Summary

The current direction across agentic engineering research is consistent:

- Context engineering is **not** just “make the agent know more.”
- The real constraint is a **finite token budget**.
- Good systems treat tokens like money: spend only on high-signal context, cache what repeats, compact what grows, and retrieve the rest just in time.
- Long-running agents need a context architecture, not a bigger prompt.

## 1) Core finding: context engineering is token budgeting

Recent guidance from Anthropic, OpenAI, Claude docs, and Thoughtworks all points to the same model:

- **Context is finite.** More tokens can increase noise and reduce performance.
- **High-signal beats high-volume.** The best context is the smallest set that still gets the job done.
- **Dynamic context wins.** Load data when needed instead of stuffing everything up front.
- **Compaction is essential.** Long sessions must periodically compress history into a smaller, faithful representation.

### References

- Anthropic — *Effective context engineering for AI agents*  
  https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Anthropic — *Effective harnesses for long-running agents*  
  https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents?s=09
- Thoughtworks — *Context engineering*  
  https://www.thoughtworks.com/radar/techniques/context-engineering
- Thoughtworks — *Context engineering: How to give AI exactly what it needs*  
  https://www.thoughtworks.com/insights/blog/generative-ai/context-engineering-give-ai-what-needs

## 2) Token economy: why “more context” is not free

The token-cost view is now explicit in vendor docs:

- **Prompt caching** exists because repeated prefixes are expensive.
- **Compaction** exists because long conversations need to be shrunk without losing the important state.
- **Tool-result clearing** exists because bulky re-fetchable output is a waste when it can be reloaded later.

This leads to a practical rule:

> Tokens should be spent on decisions, not on repetition.

### Token-budget implications

- Keep stable instructions short and reusable.
- Avoid re-sending large static artifacts every turn.
- Move volatile or bulky data into retrieval/storage instead of active context.
- Compact aggressively when context starts to rot.
- Prefer lightweight indexes over large always-on dashboards.

### References

- OpenAI — *Compaction*  
  https://developers.openai.com/api/docs/guides/compaction
- Claude Docs — *Context windows*  
  https://platform.claude.com/docs/en/build-with-claude/context-windows
- Claude Docs — *Prompt caching*  
  https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Claude Cookbook — *Context engineering: memory, compaction, and tool clearing*  
  https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools
- OpenAI — *Prompt engineering*  
  https://developers.openai.com/api/docs/guides/prompt-engineering

## 3) What the strongest patterns look like

### A. Just-in-time context loading

Best practice is to load information when needed, not pre-load everything.

Typical pattern:
- keep a small always-on instruction set
- store longer-lived knowledge externally
- retrieve only the relevant slice for the current task

### B. Progressive disclosure

Agents should start with minimal context and fetch more only when the task demands it.

### C. Compaction over accumulation

Long sessions need an explicit shrink step:
- preserve important state
- discard chat noise
- keep the next turn efficient

### D. Caching repeated prefixes

If a prompt or instruction block repeats often, cache it rather than paying full token cost every time.

## 4) Research on agent workflows

From Matt Pocock’s work and related AI coding workflows:

- keep tasks small enough to fit the model’s attention budget
- use structured plans and staged execution
- turn vague goals into crisp context artifacts
- use shared docs/ADRs/context files to reduce re-explanation
- prefer deletion and simplification over adding more machinery

This supports a broader conclusion: **good agent systems are context systems**.

### References

- Matt Pocock skills repository  
  https://github.com/mattpocock/skills
- Matt Pocock — AI coding workflow material  
  https://www.aihero.dev/posts

## 5) Obsidian / Dataview findings

Dataview is a live query layer over Markdown metadata:

- it indexes YAML frontmatter and inline fields
- it can render query results dynamically inside notes
- the note file itself can stay static while the rendered view updates as the vault changes

That means a dashboard note can be a valid human surface, but it should be treated as a **projection**, not the source of truth.

### References

- Dataview homepage  
  https://blacksmithgu.github.io/obsidian-dataview/
- Dataview query structure  
  https://blacksmithgu.github.io/obsidian-dataview/queries/structure/
- Dataview GitHub repo  
  https://github.com/blacksmithgu/obsidian-dataview

## 6) Repo-specific research findings for omp-noesis

From the current codebase analysis:

- The runtime surface is strong: tools, hooks, domains, Graphify integration, Obsidian projection, and init/bootstrap are all present.
- The project is **close** to complete, but not yet defensibly “100% implemented.”
- Key gaps found:
- README version drift (`0.3.0` vs historical `0.1.0` in package/runtime/docs)
  - `retainToOmp` exists on `NoesisRuntime` but is not wired in `createRuntime()`
  - `context-hook.ts` caches capability for the session
  - documented `_INDEX.md` generation does not have source implementation or tests
  - several documented behaviors still lack direct test coverage

## 7) Implication for the next Noesis design

If the goal is a lean, durable extension, the design should favor:

- thin, live projections over large static artifacts
- token-aware context loading
- cached repeated instructions
- external storage for bulky or volatile state
- compaction and retrieval instead of accumulation

In short:

> context engineering is an economy problem first, an awareness problem second.

## 8) Working conclusion

For Noesis, the right target is not “maximally aware everywhere.”
The right target is:

- high signal
- low waste
- short active context
- cheap repetition
- explicit compaction
- just-in-time retrieval

That is the shape of a token-respecting agent system.
