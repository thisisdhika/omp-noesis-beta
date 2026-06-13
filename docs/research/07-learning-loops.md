# Learning Loops — Full Research

> Source: Academic papers, framework documentation, and industry patterns (2025-2026)
> Compiled: 2026-06-12

---

## 1. SAGE: Skill Augmented GRPO for Self-Evolution

**Paper**: arxiv.org/abs/2512.17102v2

SAGE is an RL framework designed to enable self-improving agents with a reusable skill library.

### Problem

LLM-based agents struggle to continuously improve across new environments; current skill libraries rely on prompting.

### Solution

Combine reinforcement learning with a growing skill library to enable self-evolution. SAGE extends Group Relative Policy Optimization (GRPO) with two innovations:

- **Sequential Rollout**: Trains the agent across a chain of similar tasks, preserving and accumulating skills from earlier tasks for use in later ones. The agent carries forward what it learned from previous tasks, creating a cumulative learning effect.
- **Skill-integrated Reward**: Augments traditional outcome-based rewards with a reward component that encourages high-quality skill generation and effective skill utilization. The agent is rewarded not just for completing tasks but for creating and using good skills.

### Training setup

Builds on supervised-finetuned models (SFT) and applies RL to develop executable skills that persist across tasks.

### Results

On the AppWorld dataset, SAGE outperforms prompting-based baselines, achieving about 8.9% higher Scenario Goal Completion (SGC), using 26% fewer interaction steps, and generating 59% fewer tokens. Skill utilization analysis shows more than 2x improvement in success rates when leveraging learned skills.

### Key insight

The learning loop is: execute task → generate skill → use skill on next task → refine skill based on outcome. The skill library grows and improves with each task.

---

## 2. CoEvoSkills: Self-Evolving Agent Skills via Co-Evolutionary Verification

**Paper**: arxiv.org/abs/2604.01687

CoEvoSkills presents a self-evolving framework for agent skills that yields multi-file, structured skill packages rather than single-function tools or prompts.

### Problem

Existing self-improving systems either produce isolated tools or prompt heuristics and rely on ground-truth signals.

### Generate–verify–refine loop

1. **Skill Generator** creates candidate multi-file skills and executes them.
2. **Surrogate Verifier** independently generates test assertions and provides structured failure diagnostics.
3. If surrogate tests pass, a ground-truth oracle re-evaluates in a fresh environment; if all good, the skill is deployed to the target LLM agent. If not, the cycle continues with enhanced tests and refined skills.

### Formalization

Models the setting as a POMDP. The key innovation is the surrogate verifier — an independent agent that tests the skill without knowing the ground truth, providing a more realistic assessment of skill quality.

### Position

Builds on the concept of "skills" as reusable, modular capabilities with applicability and termination conditions, advancing beyond prior work (SAGE, SkillRL, etc.) by producing multi-file executable skill packages and using surrogate verification to avoid reliance on ground-truth signals.

---

## 3. Skills-Coach: A Self-Evolving Skill Optimizer via Training-Free GRPO

**Paper**: arxiv.org/html/2604.27488

Skills-Coach is an automated framework for Skill Self-Evolution in LLM-based agents.

### Core idea

Systematically push a skill's capability boundary through iterative refinement, using GRPO-style optimization without requiring model retraining.

### Training-free

Unlike SAGE, Skills-Coach does not require model retraining. It uses the LLM's existing capabilities to refine skills through iterative prompting and evaluation.

---

## 4. MUSE-Autoskill: Self-Evolving Agents via Skill Creation, Memory, Management, and Evaluation

**Paper**: arxiv.org/abs/2605.27366

MUSE-Autoskill is a framework for LLM-based agents that treats skills as long-lived, evolving assets rather than one-off outputs.

### Five-stage lifecycle

Creation, memory, management, evaluation, and refinement.

### Key innovations

- **Skill-level memory**: Per-skill experience accumulated across tasks to improve future use and adaptation. Each skill remembers what worked and what didn't.
- **Integrated skill_create tool**: Couples skill generation directly with execution, closing the creation–usage loop.
- **Multi-level memory**: Short-term, long-term, and per-skill memory to support long-horizon tasks and cross-task learning.
- **Evaluation subsystem**: Unit-test–driven validation and runtime feedback that automatically triggers refinement when tests fail.
- **Structured context management**: Adaptive compression and cross-session persistence to avoid context-window blowup.

### What it enables

- On-demand skill creation and persistent, transferable skills that can be reused across tasks and even across different agent systems.
- Automated improvement: skills are tested, evaluated, and refined continuously rather than being static.
- Cross-agent skill transfer demonstrated by injecting skills into different agents without modifying the backbone model.

---

## 5. SkillPyramid: Hierarchical Skill Consolidation

**Paper**: arxiv.org/html/2606.03692v1

SkillPyramid is a hierarchical skill consolidation framework for self-evolving AI agents.

### Multi-level layers

Lower levels contain fine-grained, reusable atomic capabilities. Upper levels capture recurring problem-solving patterns.

### Components

- **Relation Analyzer**: Identifies reusable relations between skills
- **Relation Builder**: Constructs skill relationships
- **Downward Atomic Extraction**: Captures minimal reusable skills
- **Upward Abstract Induction**: Summarizes higher-level strategies
- **Task-driven self-evolution**: Validates and incorporates new skills into the pyramid by linking them to related existing skills

### Benefits

Encourages reuse, transfer, and gradual evolution of skills rather than building skills in isolation. Demonstrates improved performance and efficiency across ALFWorld, WebShop, and ScienceWorld on multiple backbone models.

---

## 6. OpenSkill: Open-World Self-Evolution

**Paper**: arxiv.org/html/2606.06741

OpenSkill is a framework for open-world self-evolution of LLM agents that learns both skills and verification signals from scratch.

### Three stages

1. **Open-world knowledge acquisition**: Gathers grounded knowledge and verification anchors from documentation, repositories, and the web.
2. **Leakage-free skill evolution**: Drafts and refines skills via self-built virtual tasks grounded in the acquired anchors rather than target answers.
3. **Zero-shot target evaluation**: Deploys the refined skills to the target agent for final evaluation.

### Key claims

- Achieves the best automated pass rates across multiple benchmarks and agent settings, without target-task supervision during learning
- Skills transfer across models without model-specific adaptation
- A self-built verifier that aligns with ground-truth intents, covering a large portion of test intents (≈88.9%) without supervised signals
- Demonstrated ability to bootstrap improvement post-deployment, relying on open-world resources rather than curated tasks or external feedback

---

## 7. AutoSkill: Experience-Driven Lifelong Learning

**Paper**: arxiv.org/abs/2603.01145v2

AutoSkill is a training-free lifelong learning framework that externalizes recurring user interactions into explicit, reusable skills for LLM-based assistants.

### Skill self-evolution

Discovers candidate skills from dialogue and agent traces, then refines them through a SkillEvo system that uses a universal, human-readable skill format.

### Lifelong learning

AutoSkill operates continuously, extracting skills from every interaction and refining them over time. This creates a growing library of skills that improves the agent's performance on recurring tasks.

---

## 8. CODESKILL: Self-Evolving Skills for Coding Agents

**Paper**: arxiv.org/html/2605.25430v1

CODESKILL is an LLM-based framework designed to generate and manage reusable coding-agent skills. It builds and maintains a skill bank that augments downstream software-engineering tasks by extracting, evolving, and pruning skills.

### Skill bank

CODESKILL maintains a structured skill bank that stores skills with metadata, usage statistics, and quality scores. Skills are extracted from successful coding sessions and pruned when they become outdated or ineffective.

---

## 9. MemSkill: Learning and Evolving Memory Skills

**Source**: github.com/ViktorAxelsen/MemSkill

MemSkill is a framework for learning and evolving memory skills for long-horizon agents. It replaces static memory operations with a data-driven loop where skills are learned, refined, and reused from task feedback, enabling adaptive memory management.

### Memory as a learnable skill

MemSkill treats memory operations (what to remember, what to forget, how to organize) as skills that can be learned and improved. This creates a meta-learning loop where the agent learns how to learn.

---

## 10. AutoAgent: Cognitive Evolution Module

**Paper**: arxiv.org/pdf/2603.09716

AutoAgent's Cognitive Evolution Module performs meta-cognitive analysis on curated experiences to identify gaps between intent and outcomes.

### Self-Improvement Engine

The module issues precise, text-based updates to the Cognition Layer and Memory Orchestrator strategies, refining both knowledge and memory organization without external retraining.

### Closed-loop Self-evolution

A practice-driven loop that analyzes action trajectories to align descriptive knowledge with operational reality, continuously updating cognition and memory structures in non-stationary environments.

---

## 11. DCPM: Memory as Cognition

**Paper**: arxiv.org/html/2606.09483v1

DCPM treats memory as cognition rather than mere storage. The agent's memory system is responsible for understanding, not just remembering.

### Self-evolution through memory

DCPM enables self-evolving agents by treating memory as a learning mechanism. The agent's memory system learns from each interaction, refining its understanding of the world and improving its ability to retrieve relevant information. This creates a positive feedback loop where better memory leads to better reasoning, which leads to better memory.

---

## 12. Perplexity: The Gotchas Flywheel

**Source**: research.perplexity.ai/articles/designing-refining-and-maintaining-agent-skills-at-perplexity

The gotchas flywheel is a learning loop applied to skills:

- Agent fails at something → Add a gotcha
- Agent loads the Skill off target → Tighten description and add negative evals
- Agent doesn't load the Skill when it should → Add keywords and positive evals
- System prompt changes → Check for contention or duplication

This is a continuous improvement loop where the agent's failures become the raw material for skill improvement.

---

## 13. Claude Cookbook: Structured Note-Taking

**Source**: platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools

The Claude Cookbook recommends structured note-taking as a learning mechanism:

- Persist notes in external storage so agents recall progress across tasks/sessions without bloating active context
- Implement a file-backed memory, with a memory tool, to resume sessions
- The agent writes notes to itself about what it has learned, what decisions it has made, and what it needs to do next

---

## The Learning Loop Pattern

Based on all the research, here is the canonical learning loop pattern for AI agents:

### 1. Execute

The agent performs a task using its current skills and knowledge.

### 2. Observe

The agent observes the outcome — success or failure, what worked, what didn't.

### 3. Capture

The agent captures the observation in structured form — failure pattern, success pattern, gotcha, lesson learned.

### 4. Analyze

The agent analyzes the observation — what was the root cause? What could be done differently?

### 5. Update

The agent updates its knowledge — adds a belief, refines a skill, updates a decision.

### 6. Apply

The agent applies the updated knowledge in the next task, creating a positive feedback loop.

### 7. Verify

The agent verifies that the update actually improved performance — did the next task succeed?

---

## Implications for omp-noesis

These learning loops inform the noesis design:

1. **tool_result hook as observation point**: Noesis captures every significant tool execution (failures, test passes, build successes) via the `tool_result` hook. This is the observation step.

2. **Learning layer as capture**: The `learning.failures` and `learning.successes` arrays in NoesisState capture observations in structured form. This is the capture step.

3. **Belief layer as analysis**: The agent fills in `rootCause` and `fix` via `noesis_believe`. This is the analysis step.

4. **Belief update as knowledge update**: When the agent calls `noesis_believe` with a fix, it updates the belief layer. This is the update step.

5. **Cognitive preamble as application**: The cognitive preamble includes active beliefs and learning, ensuring the agent applies its learned knowledge. This is the apply step.

6. **Gotchas flywheel for skills**: Noesis should implement the Perplexity gotchas flywheel for skills. When a skill fails, add a gotcha to the skill's reference files. Over time, skills improve through execution.

7. **Skill-level memory** (MUSE-Autoskill): Each noesis skill should have its own memory — what worked, what failed, what gotchas exist. This is stored in the learning layer.

8. **Closed-loop verification**: Noesis should verify that learning actually improved performance. If a failure pattern keeps recurring despite a recorded fix, the fix needs revision.
