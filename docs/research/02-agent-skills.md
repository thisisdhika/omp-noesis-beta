# Agent Skills — Full Research

> Source: Academic papers, industry research, and framework documentation (2025-2026)
> Compiled: 2026-06-12

---

## 1. Agent Skills for Large Language Models: Architecture, Acquisition, Security, and the Path Forward

**Paper**: arxiv.org/html/2602.12430v3

The paper argues for a shift from monolithic LLMs to modular agent skills — portable, on-demand bundles of instructions, code, and resources that agents load without retraining.

### Core concepts

- **SKILL.md as a formal skill specification**: The SKILL.md file serves as the canonical definition of a skill, including its name, description, applicability conditions, and content.
- **Progressive context loading**: Skills are loaded progressively — first the metadata (name + description), then the full content, then auxiliary files — to minimize context cost.
- **Integration with Model Context Protocol (MCP)**: Skills can be distributed and discovered through MCP, enabling dynamic capability extension.

### Skill acquisition

Methods like SAGE (Skill Augmented GRPO for self-Evolution) use reinforcement learning across task chains with sequential rollout and a skill-integrated reward to produce reusable, high-quality skills. SEAgent explores autonomous skill discovery and compositional skill synthesis.

### Deployment at scale

Architectures such as the CU A stack and GUI-grounding work, with benchmarks like OSWorld and SWE-bench to track task performance and environment interaction.

### Security and governance

A notable finding that ~26% of community-contributed skills have vulnerabilities, motivating the Skill Trust and Lifecycle Governance Framework — a four-tier, gate-based permission model linking skill provenance to deployment capabilities.

### Quality patterns and gaps

Current benchmarks emphasize task completion; there is a need for direct skill-quality metrics (reusability, composability, maintainability) to evaluate ecosystems of skills rather than individual agent runs.

### Open challenges

Cross-platform skill portability, principled skill learning that yields auditable artifacts, robust permission models, and governance that balances openness with safety.

---

## 2. SoK: Agentic Skills — Beyond Tool Use in LLM Agents

**Paper**: arxiv.org/pdf/2602.20867v1

The paper introduces the concept of agentic skills for LLM agents, framing them as reusable procedural capabilities with explicit applicability conditions, beyond simple tool use.

### Lifecycle

Discovery, practice, distillation, storage, composition, evaluation, update.

### Design patterns (system-level, seven patterns)

1. Metadata-driven progressive disclosure
2. Executable code skills
3. Self-evolving libraries
4. Marketplace distribution
5. And more

### Skill representation

An orthogonal X-scope taxonomy describing what skills are (natural language, code, policy, hybrid) and the environments they operate in (web, OS, software engineering, robotics).

### Quality and reliability emphasis

Curated, validated skills outperform ad-hoc or self-generated ones. SkillsBench evidence shows curated skills raise agent success rates by ~16.2 percentage points on average; self-generated skills can degrade performance (~−1.3 points) in open-ended settings.

### Self-evolving libraries

Combine skill execution with automated quality assessment and continuous refinement, forming a closed loop that grows the skill library but faces a quality-control risk (possible "skill debt") without verification.

### Meta-skills (Pattern-6)

Enable autonomous acquisition of new skills, enabling self-improvement but requiring safeguards and verification to avoid error propagation.

### Practical implications

Reliability and verifiability of skills are crucial; a curated, multi-context-verified skill can be more reliable than a larger model without such skills, effectively acting as an efficiency multiplier for agent performance.

### Security and governance

Discusses supply-chain risks, prompt-injection via skill payloads, and trust-tiered execution, illustrated by the ClawHavoc case where a large number of malicious skills infiltrated a marketplace.

---

## 3. SkillsBench: Benchmarking How Well Agent Skills Work Across Diverse Tasks

**Paper**: arxiv.org/abs/2602.12670v1

SkillsBench introduces a formal benchmark to evaluate Agent Skills — the reusable, procedural knowledge modules that augment LLM-based agents.

### Setup

SkillsBench assesses the efficacy of Skills across 86 tasks in 11 domains, using curated Skills and deterministic verifiers. Each task is tested under three conditions: no Skills, curated Skills, and self-generated Skills, across 7 agent-model configurations and 7,308 trajectories.

### Main findings

- **Curated Skills significantly improve performance** on average (+16.2 percentage points) but with domain- and configuration-specific variability.
- **Self-generated Skills provide little to negative benefit** on average, underscoring the need for human-curated, domain-expert knowledge.
- **Focused Skills with 2–3 modules outperform comprehensive documentation**, highlighting efficiency in skill design.
- **Skills can partially substitute for model scale**, enabling smaller models to approach the performance of larger ones on procedural tasks.

### Benchmark design

Built on the Harbor framework with containerized tasks, deterministic verification, and an oracle solution. Evaluation includes strict isolation and a three-phase process (benchmark construction, quality filtering, evaluation). Post-automated checks, manual review ensures data validity, task realism, oracle quality, Skill quality, and anti-cheating safeguards.

### Implications

Demonstrates that Skills efficacy is context-dependent and supports the case for paired evaluation (with and without Skills) as standard practice.

---

## 4. SkillNet: Create, Evaluate, and Connect AI Skills

**Paper**: arxiv.org/pdf/2603.04448

SkillNet introduces an open infrastructure to create, evaluate, and organize AI skills at scale.

### Skill Ontology

Three layers:
- **Taxonomic layer**: Hierarchical categorization of skills by domain and function
- **Relational layer**: Dependencies, compositions, and conflicts between skills
- **Skill-package layer**: The actual skill content and metadata

### Multi-dimensional evaluation framework

Assesses skills across five dimensions:
- **Safety**: Does the skill cause harm?
- **Completeness**: Does the skill cover all necessary cases?
- **Executability**: Can the skill be executed successfully?
- **Maintainability**: Is the skill easy to update and maintain?
- **Cost-awareness**: What is the resource cost of the skill?

Three-level scoring (Good/Average/Poor) with automated LLM evaluation (GPT-5o-mini) and empirical sandbox verification for executable skills.

### Results

Skills are filtered to reduce redundancy, brittleness, and risk. Maintainability emphasizes modularity and backward compatibility. SkillNet demonstrates significant agent performance gains (average rewards +40%, fewer execution steps -30%) across ALFWorld, WebShop, and ScienceWorld.

---

## 5. GraSP: Graph-Structured Skill Compositions for LLM Agents

**Paper**: arxiv.org/abs/2604.17870

GraSP introduces an executable skill-graph architecture for LLM agents that addresses how to select, order, and execute skills rather than simply increasing skill libraries.

### Problem

More available skills often harms performance due to poor selection and ordering amid hidden dependencies.

### Solution

Transform flat skill sets into typed directed acyclic graphs (DAGs) with precondition–effect edges. This structures how skills depend on each other.

### Four stages

1. **Memory-conditioned retrieval**: Selects relevant skills and assigns calibrated confidence. Fuses semantic matching with episodic context.
2. **DAG compilation**: Organizes retrieved skills into a verified GraSP with explicit dependencies and data flows.
3. **Verified execution with local repair**: Traverses the DAG topologically, checks pre/postconditions at each node, and locally patches failures via typed repair operators. Reduces replanning from O(N) to O(d^h).
4. **Confidence-based routing**: Uses reliability signals to fall back to reactive control when needed.

### Key findings

- Focused sets of 2–3 skills outperform larger, exhaustive collections
- More skills can hurt performance without proper orchestration
- GraSP provides a compilation layer between retrieval and execution, solving the "how do these skills depend on each other?" problem
- Across ALFWorld, ScienceWorld, WebShop, and InterCode with eight LLM backbones, GraSP outperforms ReAct, Reflexion, ExpeL, and flat-skill baselines, improving reward up to +19 points and reducing environment steps by up to 41%
- Benefits scale with task complexity and are robust to skill over-retrieval and quality degradation

---

## 6. Graph-of-Skills (GoS): Dependency-Aware Structural Retrieval

**Paper**: arxiv.org/pdf/2604.05333

GoS is an inference-time, graph-based retrieval layer for local skill libraries. It builds a directed, multi-relational graph where nodes are executable skills and edges encode prerequisites and workflow relations.

### Architecture

GoS constructs a skill dependency graph at build time, then performs graph-based retrieval at inference time. The graph encodes which skills depend on which, enabling the system to retrieve not just the most relevant skill but the entire dependency chain needed to execute it.

---

## 7. SAGE: Skill Augmented GRPO for Self-Evolution

**Paper**: arxiv.org/abs/2512.17102v2

SAGE is an RL framework designed to enable self-improving agents with a reusable skill library.

### Problem

LLM-based agents struggle to continuously improve across new environments; current skill libraries rely on prompting.

### Solution

Combine reinforcement learning with a growing skill library to enable self-evolution. SAGE extends Group Relative Policy Optimization (GRPO) with two innovations:

- **Sequential Rollout**: Trains the agent across a chain of similar tasks, preserving and accumulating skills from earlier tasks for use in later ones.
- **Skill-integrated Reward**: Augments traditional outcome-based rewards with a reward component that encourages high-quality skill generation and effective skill utilization.

### Results

On the AppWorld dataset, SAGE outperforms prompting-based baselines, achieving about 8.9% higher Scenario Goal Completion (SGC), using 26% fewer interaction steps, and generating 59% fewer tokens. Skill utilization analysis shows more than 2x improvement in success rates when leveraging learned skills.

---

## 8. CoEvoSkills: Self-Evolving Agent Skills via Co-Evolutionary Verification

**Paper**: arxiv.org/abs/2604.01687

CoEvoSkills presents a self-evolving framework for agent skills that yields multi-file, structured skill packages rather than single-function tools or prompts.

### Problem

Existing self-improving systems either produce isolated tools or prompt heuristics and rely on ground-truth signals.

### Generate–verify–refine loop

1. **Skill Generator** creates candidate multi-file skills and executes them.
2. **Surrogate Verifier** independently generates test assertions and provides structured failure diagnostics.
3. If surrogate tests pass, a ground-truth oracle re-evaluates in a fresh environment; if all good, the skill is deployed to the target LLM agent. If not, the cycle continues with enhanced tests and refined skills.

### Formalization

Models the setting as a POMDP; detailed in the paper with Algorithm 1 and system diagrams.

### Position

Builds on the concept of "skills" as reusable, modular capabilities with applicability and termination conditions, advancing beyond prior work (SAGE, SkillRL, etc.) by producing multi-file executable skill packages and using surrogate verification to avoid reliance on ground-truth signals.

---

## 9. Skills-Coach: A Self-Evolving Skill Optimizer via Training-Free GRPO

**Paper**: arxiv.org/html/2604.27488

Skills-Coach is an automated framework for Skill Self-Evolution in LLM-based agents, aimed at closing gaps in the current skill ecosystem and enabling robust, adaptable agents.

### Core idea

Systematically push a skill's capability boundary through iterative refinement, using GRPO-style optimization without requiring model retraining.

---

## 10. MUSE-Autoskill: Self-Evolving Agents via Skill Creation, Memory, Management, and Evaluation

**Paper**: arxiv.org/abs/2605.27366

MUSE-Autoskill is a framework for LLM-based agents that treats skills as long-lived, evolving assets rather than one-off outputs.

### Five-stage lifecycle

Creation, memory, management, evaluation, and refinement.

### Key innovations

- **Skill-level memory**: Per-skill experience accumulated across tasks to improve future use and adaptation.
- **Integrated skill_create tool**: Couples skill generation directly with execution, closing the creation–usage loop.
- **Multi-level memory**: Short-term, long-term, and per-skill memory to support long-horizon tasks and cross-task learning.
- **Evaluation subsystem**: Unit-test–driven validation and runtime feedback that automatically triggers refinement when tests fail.
- **Structured context management**: Adaptive compression and cross-session persistence to avoid context-window blowup.

### What it enables

- On-demand skill creation and persistent, transferable skills that can be reused across tasks and even across different agent systems.
- Automated improvement: skills are tested, evaluated, and refined continuously rather than being static.
- Cross-agent skill transfer demonstrated by injecting skills into different agents without modifying the backbone model, supporting portability across LLMs and architectures.

---

## 11. SkillPyramid: A Hierarchical Skill Consolidation Framework

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

## 12. OpenSkill: Open-World Self-Evolution for LLM Agents

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

## 13. AutoSkill: Experience-Driven Lifelong Learning via Skill Self-Evolution

**Paper**: arxiv.org/abs/2603.01145v2

AutoSkill is a training-free lifelong learning framework that externalizes recurring user interactions into explicit, reusable skills for LLM-based assistants.

### Skill self-evolution

Discovers candidate skills from dialogue and agent traces, then refines them through a SkillEvo system that uses a universal, human-readable skill format.

---

## 14. CODESKILL: Learning Self-Evolving Skills for Coding Agents

**Paper**: arxiv.org/html/2605.25430v1

CODESKILL is an LLM-based framework designed to generate and manage reusable coding-agent skills. It builds and maintains a skill bank that augments downstream software-engineering tasks by extracting, evolving, and pruning skills.

---

## 15. MemSkill: Learning and Evolving Memory Skills

**Source**: github.com/ViktorAxelsen/MemSkill

MemSkill is a framework for learning and evolving memory skills for long-horizon agents. It replaces static memory operations with a data-driven loop where skills are learned, refined, and reused from task feedback, enabling adaptive memory management.

---

## Implications for omp-noesis

These skill frameworks inform the noesis design in several ways:

1. **Skills as evolving assets** (MUSE-Autoskill, SkillPyramid): Noesis skills should not be static SKILL.md files. They should accumulate experience, learn from execution, and evolve over time. The learning loop captures execution feedback that can refine skills.

2. **Skill quality is the bottleneck** (SkillsBench, Perplexity): Curated, high-quality skills outperform self-generated ones by +16.2pp. Noesis should focus on skill quality, not skill quantity. The "ultra" in ultra-skills means quality, not volume.

3. **Graph-structured skill composition** (GraSP, GoS): Skills have dependencies and preconditions. Noesis should leverage Graphify's knowledge graph to understand skill dependencies and compose them correctly. The DAG compilation pattern from GraSP maps directly to the workflow layer.

4. **2–3 focused skills beat comprehensive documentation** (SkillsBench): Noesis should keep skills small and focused. The progressive disclosure pattern (index → load → runtime) is the right model.

5. **Self-generated skills are risky** (SkillsBench): Noesis should not auto-generate skills from scratch. Instead, it should refine existing curated skills through the learning loop. The CoEvoSkills generate–verify–refine loop is the right pattern.

6. **Skill-level memory** (MUSE-Autoskill): Each skill should have its own memory — what worked, what failed, what gotchas exist. This is the Perplexity "gotchas flywheel" pattern, formalized.

7. **Skill composition via workflow** (GraSP): The noesis workflow layer should compile skills into a DAG with precondition–effect edges, not just a flat list of steps. This is the "ultra-skills workflow" — graph-compiled, dependency-aware, locally repairable.
