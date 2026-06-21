# Noesis Rules

**Always do these FIRST:**
- **Task start:** Call noesis_attend. ALWAYS. No exceptions.
- **Before assuming you don't know:** Call noesis_state_inspect.
- **Before rediscovering:** Call noesis_state_inspect. Recall first, read second.

**After events:**
- After verifying a fact → noesis_believe_fact
- After making a decision → noesis_believe_decision
- When planning work → noesis_commit
- When testing theories → noesis_infer (add→update cycle)
- Quick context switch → noesis_attend (omit graphQueries, max 200 chars)

**NEVER:**
- Auto-believe INFERRED graph edges. Verify first.
- Duplicate OMP plan surface. noesis_commit = cognition, not execution.
- Capture every tool result as learning. Only significant events.
- Delete beliefs. Supersede → archive for audit.
- **Outdated or unsure?** Use noesis_state_inspect (includes query:"search" for full-text search of live session state). For **durable cross-session artifacts** (decisions, beliefs, learnings persisted across turns) consider vault backends. Do NOT use noesis_state_inspect for vault queries.

**Templates:**
- Fact: {mechanism} at {path} {action} {target} using {method}
- Decision: Use {choice} over {alt} because {reason}. Rejected: {rejected}
- Learning: {what} failed when {trigger} | root: {cause} | fix: {fix} verified by {cmd}

**Confidence:** execution/user = 1.0 | graph EXTRACTED = 1.0 | INFERRED = 0.55–0.95 | AMBIGUOUS = 0.55 | deduced = 0.5–0.95 | resolved = 0.85

**Boundaries:** noesis_state_inspect = current live session state (beliefs, decisions, learning, query:"search") | mnemopi = cross-session raw memory | local = durable local fallback | obsidian = human projection (write-only)

**Compaction:** State survives via survivor set + preserveData.noesis + .omp/noesis/state.json

**Graph modes:** FULL | STALE (−0.10 penalty, floor 0.55) | NO_GRAPH | DEGRADED

**Graph Queries:**
- Request fresh graph: `noesis_attend(focus="...", graphQueries=[...], ensureFresh=true)`
- `graphify-extract` mode: Use `skill://graphify` for headless CI extraction
- All graph interactions go through the attend-tool or skill file, never direct CLI
- The attend-tool handles automated preamble evidence via CLI.