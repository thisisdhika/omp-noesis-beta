# Context Management — Full Research

> Source: Academic papers, industry research, and framework documentation (2025-2026)
> Compiled: 2026-06-12

---

## 1. Anthropic: Effective Context Engineering for AI Agents

**Source**: anthropic.com/engineering/effective-context-engineering-for-ai-agents

Anthropic defines context engineering as selecting the smallest high-signal context for the agent at each step.

### Core principle

Context is the bottleneck of agentic engineering. Not model size, not token count, not tool breadth. The agent's performance is directly proportional to the quality of its context.

### Strategies

- **Compaction**: Summarize old context to free up space for new context. Use structured compaction that preserves decisions and goals while dropping verbatim interactions.
- **Note-taking**: Have the agent write notes to itself about what it has learned, what decisions it has made, and what it needs to do next. These notes persist across compaction boundaries.
- **Subagents**: Delegate context-heavy tasks to subagents that have their own isolated context windows. The parent agent only sees the subagent's output, not its full context.

### Key insight

The agent doesn't manage context — the context architecture manages the agent. The quality of the agent's decisions is bounded by the quality of its context.

---

## 2. LangChain: Context Engineering for Agents

**Source**: langchain.com/blog/context-engineering-for-agents

LangChain defines context engineering as the art and science of filling an agent's context window with the right information at each step of its trajectory.

### Four core strategies

1. **Write**: Persist information to external storage (files, databases, memory systems) so it can be retrieved later.
2. **Select**: Choose which information to include in the context window based on relevance, recency, and importance.
3. **Compress**: Summarize or truncate information to fit within the context window while preserving the most important details.
4. **Isolate**: Use sandboxed contexts for different tasks, preventing irrelevant information from contaminating the agent's reasoning.

### State management

- **Thread-scoped (short-term) memory**: Checkpointing and persistence for agent state within a single conversation.
- **Long-term memory**: Cross-session persistence for knowledge, decisions, and learned behaviors.
- **Fine-grained access**: Selective exposure of state to the LLM at each agent step.

### Practical patterns

- SummarizationMiddleware for condensing conversation history
- LLMToolSelectorMiddleware for dynamic tool selection
- State objects and sandboxes for context isolation
- Multi-agent orchestration (supervisor and swarm libraries)

---

## 3. LangChain: Context Engineering in Agents (Docs)

**Source**: docs.langchain.com/oss/python/langchain/context-engineering

### Context types

- **Model Context (transient)**: Instructions, history, tools, response format for a single model call.
- **Tool Context (persistent)**: What tools can access or produce (reads/writes to state, runtime context).
- **Life-cycle Context (persistent)**: What happens between model and tool calls (summarization, guardrails, logging).

### Middleware

LangChain's middleware enables practical context engineering by hooking into the agent lifecycle to:
- Update context (persist changes to state/store, update history)
- Jump in the lifecycle (skip/retry steps, adjust context)
- Examples include wrap_model_call and wrap_tool_call for transient updates

### Tool management

Balance tools to avoid overload; dynamic tool selection can adapt to authentication, permissions, flags, or conversation stage.

---

## 4. Claude Cookbook: Context Engineering Tools

**Source**: platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools

The Claude Cookbook contends with three core context-engineering techniques — compaction, tool-result clearing, and memory — to keep long-running agents efficient.

### Memory (structured note-taking)

Persist notes in external storage so agents recall progress across tasks/sessions without bloating active context. Implement a file-backed memory, with a memory tool, to resume sessions (Session 2 continues where Session 1 left off).

### Compaction

Summarize a long conversation when the context window nears its limit, preserving goals, decisions, and major discoveries while dropping verbatim past interactions. Uses an API-native compaction flow that auto-triggers at a token threshold and returns a typed compaction block.

### Tool-result clearing

A counterpart mechanism to free up context by removing results from the active window, aiding longer-running tasks without losing essential state.

### Interplay

These methods differ in focus but can be combined with subagents and other context-management strategies. They are first-party APIs (server-side compaction, context editing with tool-result clearing, and the memory tool) and are applicable to long-running agents across sessions.

### Practical design tips

Choose the method that addresses your current bottleneck (window size, cross-session persistence, or stale/re-fetchable data), then configure and test their interactions for your workload.

---

## 5. Context Engineering Handbook

**Source**: github.com/ypollak2/context-engineering-handbook

A comprehensive taxonomy of patterns for building production-ready AI agents and context-aware systems.

### Core patterns

- System prompt architecture
- Progressive disclosure
- Few-shot curation
- Dynamic persona assembly
- Schema-guided generation
- Template composition
- Constraint injection

### Context and retrieval patterns

- **Just-in-Time Retrieval**: Fetch context on demand.
- **RAG Context Assembly**: Structure retrieved chunks into coherent context.
- **Semantic Tool Selection**: Dynamically choose tools based on task.
- **Hybrid Search Fusion**: Fuse retrieval signals.
- **Context-Aware Re-ranking**: Rank with full conversation context.
- **Temporal Context Selection**: Prioritize recent, time-aware context.
- **Conversation Compaction**: Summarize history.

### Memory patterns

- **Filesystem-as-Memory**: Durable, inspectable knowledge storage.
- **Semantic Memory Indexing**: Vector-based retrieval.
- **Cross-Session Sync**: Maintain continuity across interactions.

### Agent orchestration patterns

- **Sub-Agent Delegation**: Coordinating multiple agents with minimal, task-specific context.
- **Multi-Agent Context Orchestration**: Coordinating multiple agents.
- **Sandbox Contexts**: Safe, permissioned context visibility.
- **Role-Based Context Partitioning**: Context visibility by role.

### Framework mappings

- **LangChain**: Progressive Disclosure, Conversation Compaction, RAG Assembly, Tool Selection, Sub-Agent Delegation
- **LlamaIndex**: RAG Assembly, Episodic Memory, Context Rot Detection
- **Semantic Kernel**: System Prompt Architecture, Tool Selection, KV-Cache Optimization
- **Vercel AI SDK**: Progressive Disclosure, Conversation Compaction, Error Preservation

---

## 6. Context Management for Deep Agents

**Source**: langchain.com/blog/context-management-for-deepagents

LangChain's Deep Agents SDK enables planning, subagents, and filesystem-backed persistence for long-running tasks.

### Context compression

Three compression techniques, triggered as context grows:

1. **Offload large tool results** to the filesystem.
2. **Offload large tool inputs** when context exceeds a threshold.
3. **Summarization** when further offloading isn't sufficient.

### Compression triggers

Tied to fractional thresholds of the model's context window, using model-specific token limits. Practical behavior includes truncating older tool calls and replacing them with filesystem pointers once the context nears 85% of the window.

### Two-part summarization

1. **In-context summary**: A structured summary of the conversation, artifacts, and next steps, replacing the active history.
2. **Filesystem preservation**: All original messages are saved to disk for exact recoverability.

### Evaluation

Evaluate summarization's impact on maintaining objective trajectory and the ability to recover summarized details (needle-in-the-haystack scenarios). Tests for continuation after compression and recoverability post-summarization.

---

## 7. Agent Memory Techniques

**Source**: github.com/Wern-wq/Agent_Memory_Techniques

Catalogs 30 memory techniques for LLM-based agents, organized into six families:

1. Short-term context management
2. Long-term storage
3. Cognitive architectures
4. Retrieval-augmented generation
5. Memory consolidation
6. Cross-session persistence

---

## 8. AI Agent Handbook

**Source**: github.com/vasilyevdm/ai-agent-handbook

A comprehensive, code-backed handbook of AI agent engineering compiled from 30+ frameworks. Focuses on context and memory management, prompt assembly, tool selection, and multi-agent orchestration.

---

## 9. Context Engineering for Production Agents

**Source**: activewizards.com/blog/context-engineering-for-production-agents/

Positions context engineering as the key reliability lever for production agents — more critical than prompt phrasing when failures stem from what the model can see.

### Four-tier memory architecture

1. **Working memory**: Current context window
2. **Short-term memory**: Recent conversation history
3. **Long-term memory**: Cross-session knowledge
4. **Episodic memory**: Specific experiences and their outcomes

---

## 10. Architecting Agentic Workflows: Best State Management Patterns

**Source**: syuthd.com/2026/05/architecting-agentic-workflows-best.html

Argues that in 2026 the core design shift for multi-agent systems is from stateless prompt-based approaches to distributed, persistent, and observable state management.

### Three-layer state model

1. **Short-term state**: In-memory, per-session, ephemeral
2. **Medium-term state**: File-backed, per-task, durable within a workflow
3. **Long-term state**: Database-backed, cross-session, persistent

---

## 11. Zylos Research: Context Window Management and Session Lifecycle

**Source**: zylos.ai/research/2026-03-31-context-window-management-session-lifecycle-long-running-agents/

The landscape for long-running AI agents relies on a tiered approach to context management: compaction, structured external memory, and sub-agent delegation. Combining all three yields the most robust production behavior.

---

## Implications for omp-noesis

These context management patterns inform the noesis design:

1. **Context engineering is the discipline** (Anthropic, LangChain): Noesis is a context engineering tool. It doesn't add more context — it adds BETTER context. The cognitive preamble is the highest-signal context the agent can have.

2. **Write, select, compress, isolate** (LangChain): Noesis implements all four:
   - **Write**: Persist beliefs, decisions, learning to `.omp/noesis/state.json`
   - **Select**: Attentional gating via the `tool_result` hook filters what enters the belief layer
   - **Compress**: The 2000-token preamble budget forces compression
   - **Isolate**: The cognitive state is isolated from the conversation transcript

3. **Compaction is the boundary** (Claude Cookbook, LangChain): The `session.compacting` hook is where noesis injects its structured state. This is the single most important integration point.

4. **Tool-result clearing** (Claude Cookbook): Noesis should not capture every tool result. The `tool_result` hook should filter for significant events only (failures, test passes, build successes).

5. **Filesystem-backed persistence** (LangChain Deep Agents): `.omp/noesis/state.json` is the filesystem-backed persistence. It survives compaction, session switches, and even process restarts.

6. **Progressive disclosure** (Context Engineering Handbook): Noesis should load cognitive state progressively — first the attention layer (what the agent is focused on), then the belief layer (what it knows), then the inference layer (what it's reasoning about), then the learning layer (what it has learned).

7. **Sub-agent delegation** (LangChain, Claude Cookbook): Noesis should work with OMP's existing sub-agent system. The cognitive state should be shared across sub-agents via the filesystem, not the context window.
