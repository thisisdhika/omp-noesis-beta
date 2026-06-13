# Ultra-Skills Quality — Full Research

> Source: Perplexity Research, SkillsBench, SkillNet, Matt Pocock skills, and industry patterns (2025-2026)
> Compiled: 2026-06-12

---

## 1. Perplexity: Designing, Refining, and Maintaining Agent Skills

**Source**: research.perplexity.ai/articles/designing-refining-and-maintaining-agent-skills-at-perplexity

Perplexity's frontier agent products rest on a foundation of know-how and domain expertise packaged in modular Agent Skills. They maintain a carefully curated library of Skills across their technical environments. These Skills include many of the general-purpose utilities powering Perplexity Computer; vertical-specific capabilities in areas such as finance, law, and health; and a very long tail of modules for addressing user needs. Some Skills are infrequently invoked but critical *when* invoked. To ensure a consistently excellent user experience, Perplexity's Agents team prioritizes Skill quality just as much as code quality.

### The intuitions and best practices required to develop a high-quality Skill differ significantly from those required to build traditional software

The Agents team reviews many pull requests from excellent engineers who develop Skills in the course of their work. The result is almost always numerous comments and suggestions for revision. This is because many useful patterns for writing code become antipatterns in Skill creation.

### The Zen of Skills

If you take some of the aphorisms from PEP20 — The Zen of Python, it quickly becomes clear that writing good Python code is unlike writing good Skills. Of the 20 lines of wisdom, at least half are fully wrong or actively misleading when writing Skills:

| Zen of Python | Zen of Skills |
|---|---|
| Simple is better than complex | A Skill is a folder, not a file. Complexity is the feature. |
| Explicit is better than implicit | Activation is implicit pattern matching. Progressive disclosure. |
| Sparse is better than dense | Context is expensive. Maximum signal per token. |
| Special cases aren't special enough to break the rules | Gotchas ARE the special cases (they're the highest-value content). |
| If the implementation is easy to explain, it may be a good idea | If it's easy to explain, the model already knows it. Delete it. |

### What is a Skill?

When you write a Skill, you aren't writing plain old software (even though Skills are now part of the main logical engines for agent systems). Rather, you're building context for models and their environments. A Skill has different constraints and different design principles. If you write a Skill like you do code, you will fail.

A Skill is at least four things:

#### A Skill is a Directory

A Skill is not just a single `SKILL.md` file. In many cases, a Skill includes several files. Under the directory named after your Skill, you might have:
- `SKILL.md`: frontmatter and instructions
- `scripts/`: code the agent runs, not reinvents
- `references/`: heavy docs, loaded conditionally
- `assets/`: templates, schemas, and data
- `config.json`: first-run user setup

This hub-and-spoke pattern allows you to keep Skills very focused and tight, and one can use the folder structure in a very creative way. Sometimes, particularly intricate Skills benefit from multiple levels of hierarchy to help the model navigate better. Suppose a Skill requires knowledge across 300 topics, groupable into 20 subject matter areas. Reliably choosing the right topic among 300 is an unsolved challenge even for today's best frontier models. It's a much easier choice problem for a model to hone in on one of 20 areas, than among the 15 topics within that area.

As one example of how multilevel hierarchy provides value, Perplexity's team employed three levels of topical nesting within the Skills powering Computer's U.S. income tax capabilities this past tax season. This hierarchy was absolutely indispensable given the complexity of tax law: in their early tests, presenting the model with a single folder containing all 1,945 sections of the U.S. Internal Revenue Code resulted in worse performance than not loading the Skill at all. Organizing the information into logical subdivisions was indispensable for ensuring high-precision read operations.

Yet this hierarchy did not come free. Increasing levels of hierarchy require increasing levels of curation across the information architecture to manage the resulting indirection. They devised quick reference guides, custom search utilities, and other tools to support the model in locating information with a minimum of indirection. In this case, doing the hard work of curation ultimately produced a positive end result: a Skill that allowed models to perform tax-related tasks much more capably than using general tools alone.

#### A Skill is a Format

A Skill is a format. The core root `SKILL.md` file must have both a name and a description. Furthermore, the Skill needs to exactly map to the directory name in which the Skill is located. The name must be all lower-case characters, have no spaces, and can use hyphens. The description is the routing trigger. This is a common failure point: the description is not internal documentation for what the Skill does. It amounts to instructions for the model for when to load the Skill. So, you will frequently see "Load when," not "This Skill does." This is important because of the way that most implementations inject the description into the model context.

Within the frontmatter, there is also "`depends:`", which allows you to create hierarchical Skill dependencies, and "`metadata:`", which is used for reviews and evaluations. Different agent systems can even define their own frontmatter fields, to be used in a manner specific to those systems. As an alternative, Skill-specific metadata can be packaged in an auxiliary JSON or YAML configuration file. This is desirable when building agent systems that need to facilitate different types of runtime behavior per Skill without polluting the model's context with minutiae. Finally, similar behavior is obtainable through stripping Skill frontmatter on read. Computer employs this methodology, which allows configuration to be preserved in the root `SKILL.md` file. Careful attention to detail is required in the parsing logic, and one might wish to implement conditional stripping if there are certain fields that are useful to have within the model context.

#### A Skill is Invocable

A Skill is invocable. The agent loads a Skill at runtime. Importantly, Skills aren't always bundled into the context. By default, most agent systems unfold Skills progressively upon specific need.

There are at least three tiers of context costs:

| Tier | What loads | Budget | When you pay |
|---|---|---|---|
| Index | `name: description` for every non-hidden Skill | ~100 tokens per Skill | Every session, every user, always paid |
| Load | Full `SKILL.md` body | ~5,000 tokens | Runtime |
| Files | `scripts/`, `references/`, `assets/`, subskills, `FORMATTING.md`, `SPECIAL_CASES.md` | Unbounded | Only when the agent reads them |

Computer builds a Skill index that has the name and the description for every available Skill. The budget for this is around 100 tokens per Skill (shorter is even better). It's so tight because you're paying this cost in every session, for every user. This is injected into the system prompt at the very beginning of the conversation. The model has access to a bunch of named Skills and descriptions so that it can decide whether to call "`load_skill()`". The bar to getting into this index is extremely high. Your Skill needs to be very useful, and the description needs to be extremely dense and terse because everyone is paying the cost all the time.

After the agent system loads the Skill, there's the full `SKILL.md` body. Ideally, the body text does not exceed 5,000 tokens. Even then, you want every sentence to matter because once you load a Skill, the rest of the conversation has to pay that until you hit the compaction boundary. Many threads load anywhere between three and five different Skills, multiplying this cost. Skills with a lot of fluff will almost certainly degrade other Skills as well as overall agentic capabilities. In short, if your Skill loads and it doesn't do the right thing, that's wasted context.

The final level of progression is scripts or special cases, like subskills or formatting. This is where you want to put unbounded conditional branched logic. The agent will only use it when it needs to, meaning there's a much lower bar for what you want to put in here.

#### A Skill is Progressive

Skills are progressive. In Computer, there are three different tiers of context costs, and they incur all three at various stages.

### Every Skill is a tax

Here's a useful test you can apply to every sentence in your Skill: "Would the agent get this wrong without this instruction?" If the sentence does not need to be there, it cannot afford to be there because everyone is paying this cost every single time. When you are deciding whether to add a Skill or not, remember this tax wherein every session and every user costs tokens.

> « Je n'ai fait celle-ci plus longue que parce que je n'ai pas eu le loisir de la faire plus courte. » — Blaise Pascal, Lettres Provinciales, 1657

Just like Pascal, you need to invest time in every Skill. It is hard to write a short Skill. If your Skill is easy to write, it is probably too long or shouldn't exist. A good Skill is as short as it can be.

If you find yourself trying to one-shot Skill generation and putting up PRs in five minutes, the results will almost certainly be subpar. In fact, early research has shown that if you're using LLMs to write Skills, the LLM will probably not benefit from it: "Self-generated Skills provide no benefit on average, showing that models cannot reliably author the procedural knowledge they benefit from consuming."

### How to build a Skill

#### Step 0: Write the Evals

Write some of the evals first. You can source evaluation cases from:
- Real user queries: sample from production or your brain trust
- Known failures: The agent failed because the Skill didn't exist
- Neighbor confusion: Close to your domain boundary but routes to another Skill

At the very least, you should be making sure that you're testing that the Skill loads when needed. Ideally, you sample some of these, maybe from a production environment. You might also consider known error cases: maybe the whole reason that you set out to write the Skill is because of a specific failure you noticed or maybe you're refactoring and there's some confusion in two close domains that are covered by one Skill.

Start with similar negative and positive examples. Negative examples are extremely powerful and can matter more than positive examples.

#### Step 1: The Description

This is the hardest line in the Skill. It's a routing trigger, not documentation. To get the name and the description right, you don't care about the content of the Skill. You only care about whether the Skill is loaded and injected at the right points and is free of off-target side effects, which is the number one failure mode. Every time you add an additional Skill, you risk making every *other* Skill slightly worse, so you need to make sure that you're minimizing regression.

Again, a bad description describes what the Skill does or why it is useful. A good description says when the agent should load the Skill. For example, say you have something for monitoring pull requests. Don't write what the Skill does. Write what engineers say when they're frustrated and they want you to make sure that their PR works, like "babysit" or "watch CI" or "make sure this lands."

Quick checklist:
- Starts with "Load when..."
- Target 50 words or fewer
- Describes the user's intent, ideally from real queries
- Does not summarize the workflow

#### Step 2: Write the Body

Next, write the content of the Skill itself. Notice this is not Step 0 or Step 1.

Communicating workflows to an LLM is completely different to communicating workflows to a colleague, or even to your runtime system. When learning a new software tool, an engineer might need to read the documentation, get a walkthrough from someone with experience, and learn how to use the tool. Meanwhile, for almost any software tool that has been around at least a year, you just need to mention its name and the LLM has all the information it needs.

When you are writing the body, skip the obvious things. Many engineers have plenty of experience writing readme.md files that list out every command someone needs to run. It's easy to fall back into that when you're writing a Skill because it feels like you're writing documentation, but if you do that, your Skill will be garbage. So, don't write out a series of commands.

For example, you don't need to write, "`git log # find the commit; git checkout main; git checkout -b <clean-branch>; git cherry-pick <commit>;`"

Instead, write, "Cherry-pick the commit onto a clean branch. Resolve conflicts preserving intent. If it can't land cleanly, explain why."

The model will do a much better job with the latter than with the overly prescriptive series of commands, especially when things go wrong. Don't railroad, or be overly prescriptive, which is fragile, and instead be flexible where multiple approaches can work. Again, good documentation for humans is most often bad documentation for models.

Next, focus on the gotchas or negative examples. These are extremely high-signal content because they often guide the model in terms of what not to do. If you add a line every time the agent trips up, you'll learn by running it and the gotchas will grow organically.

Lastly, if there's any portion that's conditional or extremely heavy in content, take it out of the `SKILL.md`, which is the hub, and put it into one of the spokes. Put it into an accessory file that can be progressively loaded.

#### Step 3: Use the Hierarchy

Make use of the Skill hierarchy when you've got a script, references, or you're using some specific tool:

| Directory | Purpose | Example |
|---|---|---|
| `scripts/` | Deterministic logic the agent would reinvent every run | Give it code to compose, not reconstruct |
| `references/` | Heavy docs loaded only when a condition is met | "Read `api-errors.md` if API returns non-200" |
| `assets/` | Output templates the agent copies and fills | `report-template.md`, output schemas |
| `config.json` | First-run user setup | Ask for the Slack channel, save, and reuse next time |

For anything that's conditional or branching from the main Skill, break it out into a folder. Remember, also, that multilevel hierarchy can be used for particularly intricate Skills. For these, you'll want to give careful thought to whether the functionality should be implemented monolithically or as a collection of Skills (perhaps with `depends:` based loading relationships).

#### Step 4: Iterate

Next, do a bunch of iterations on a branch. Start on the main branch with no Skill, do some iterations, build your hero query set, and run a slew of evals. Anyone reviewing your Skill code will thank you for submitting a single changeset complete with an evaluation set. Reviewing consecutive incremental changes (except a new gotcha) is very hard, so try to minimize it.

You'll likely do many small word changes. Small word changes in descriptions can have an outsized impact on routing (including spillover effects on other Skills), so do all that work before Step 5.

#### Step 5: Ship

Ship it.

### How to Maintain a Skill

#### The Gotchas Flywheel

From this point on, your list of gotchas tends to grow or change a lot. Skills are append-mostly. The gotchas section accrues the most value over time:
- Agent fails at something → Add a gotcha
- Agent loads the Skill off target → Tighten description and add negative evals
- Agent doesn't load the Skill when it should → Add keywords and positive evals
- System prompt changes → Check for contention or duplication

It's easy to notice a single failure case in internal testing or in production and add a gotcha. It's a negative example so it's not really changing explicit guidance, but it lets the model know, "Hey, there's this known failure."

As you move from the 80-20 to getting to a 99.9% or 99.99% success rate, it's easy to grow this gotcha list. As you see these negative examples, you should be appending mostly to the gotcha section. You shouldn't be adding longer instructions or changing the description.

#### Eval Suites

At Perplexity, they run many eval suites to check for different things:
- **Skill loading and Skill file reads**: Checks the precision, recall, and forbidden checks of the Skill loading itself. Will the agent route your Skill when it's supposed to?
- **Progressive loading evals**: The agent might load the Skill, but does it read the accessory file or files?
- **End-to-end task completion**: Full agent loop with LLM judge grading based on a rubric.
- **Cross-model evals**: Run against at least three different orchestration model families (GPT, Claude Opus, Claude Sonnet). Sonnet and GPT behave quite differently when it comes to Skills.

### Final thoughts and takeaways

The more Skills you build, the better you will get at building them. If you're not automating or trying to make more reproducible tasks that you're doing on a day-to-day basis using Skills, start immediately.

The act of building Skills makes you better at building more Skills, but also, they're extremely good at automating business processes. If you can describe something you do every week before your standup, at the end of every sprint, or anything that you do as an engineer on a daily, weekly, or even quarterly basis, you should be writing a Skill to buy back your time.

Can you automate postmortems? Can you review pull requests? Any task that you can do, you can at least have the first pass be an Agent Skill. It will save you significant time.

Key takeaways:
1. Write evals before the Skill. Include negative examples and forbidden loads for adjacent but distinct skills.
2. The description is the hard part. "Load when..." (every word costs attention).
3. Gotchas are extremely high-value content. Start thin, grow as the agent fails.

Remember that it is easy to break other pre-existing Skills by adding a new Skill, even though you didn't touch it (beware of action at a distance).

---

## 2. SkillsBench: Quality Metrics

**Source**: arxiv.org/abs/2602.12670v1

### Quantitative metrics

- Average pass-rate improvement with curated Skills: +16.2 percentage points
- Self-generated Skills: negligible/negative improvement
- Domain-level variability: +51.9pp in Healthcare vs. +4.5pp in Software Engineering
- 16 of 84 tasks show negative deltas

### Design guidance

- 2–3 modular Skills outperform broader documentation
- Skills can partially substitute for model scale
- Curated, domain-expert knowledge is essential

### Evaluation protocol

Three-condition testing (no Skills, curated Skills, self-generated Skills) across multiple agent-model configurations with deterministic verification.

---

## 3. SkillNet: Quality Dimensions

**Source**: arxiv.org/pdf/2603.04448

### Five quality dimensions

1. **Safety**: Does the skill cause harm?
2. **Completeness**: Does the skill cover all necessary cases?
3. **Executability**: Can the skill be executed successfully?
4. **Maintainability**: Is the skill easy to update and maintain?
5. **Cost-awareness**: What is the resource cost of the skill?

### Three-level scoring

Good/Average/Poor with automated LLM evaluation (GPT-5o-mini) and empirical sandbox verification.

---

## 4. Matt Pocock: Skills for Real Engineers

**Source**: github.com/mattpocock/skills

### Philosophy

"Developing real applications is hard. Approaches like GSD, BMAD, and Spec-Kit try to help by owning the process. But while doing so, they take away your control and make bugs in the process hard to resolve."

"These skills are designed to be small, easy to adapt, and composable. They work with any model. They're based on decades of engineering experience."

### Key patterns

1. **Grilling sessions** (`/grill-with-docs`): Get the agent to ask you detailed questions about what you're building. Align before you start.
2. **Shared language** (`CONTEXT.md`): A document that helps agents decode the jargon used in the project. Reduces verbosity, improves navigation, reduces thinking tokens.
3. **TDD** (`/tdd`): Red-green-refactor loop. Write failing test first, then fix it.
4. **Architecture improvement** (`/improve-codebase-architecture`): Find deepening opportunities informed by domain language and ADRs.
5. **Zoom out** (`/zoom-out`): Tell the agent to zoom out and give broader context.

### Skill categories

**Engineering**: diagnose, grill-with-docs, triage, improve-codebase-architecture, setup-matt-pocock-skills, tdd, to-issues, to-prd, zoom-out, prototype

**Productivity**: caveman, grill-me, handoff, teach, write-a-skill

**Misc**: git-guardrails-claude-code, migrate-to-shoehorn, scaffold-exercises, setup-pre-commit

---

## 5. What Makes a Skill "Ultra Quality"

Based on all the research, here are the attributes that make a skill "ultra quality":

### 1. Maximum signal per token

Every sentence must earn its place. The Perplexity test: "Would the agent get this wrong without this instruction?" If no, delete it.

### 2. Gotchas are the highest-value content

Negative examples — what NOT to do — are more valuable than positive instructions. They prevent the most common failure modes.

### 3. Progressive disclosure

Three tiers: index (100 tokens), load (5000 tokens), runtime (unbounded). Each tier has a different quality bar.

### 4. Description is a routing trigger, not documentation

"Load when..." not "This Skill does..." The description decides whether the Skill is loaded. Every word costs attention.

### 5. Evals before the Skill

Write evaluation cases before writing the Skill. Include negative examples and forbidden loads for adjacent Skills.

### 6. Hub-and-spoke structure

`SKILL.md` is the hub. `scripts/`, `references/`, `assets/` are the spokes. Heavy content goes in spokes, loaded conditionally.

### 7. Gotchas flywheel

Skills are append-mostly. The gotchas section grows over time as the agent fails. This is the learning loop applied to skills.

### 8. Cross-model consistency

A good Skill works across different models (GPT, Claude, etc.). If it only works on one model, it's not a good Skill.

### 9. Curated, not generated

Self-generated Skills provide no benefit on average. Human-curated, domain-expert Skills are essential. The quality bar is: a domain expert spent real time making this Skill as short as possible.

### 10. Action at a distance awareness

Adding a new Skill can break existing Skills. Every Skill addition requires checking for contention or duplication with existing Skills.

---

## Implications for omp-noesis

The "ultra" in ultra-skills means:

1. **Quality over quantity**: Noesis should have few, high-quality skills, not many mediocre ones. The SkillsBench evidence shows 2–3 focused skills beat comprehensive documentation.

2. **Cognitive state enhances skills**: Noesis skills are enhanced by cognitive state. A skill that can access the agent's beliefs, decisions, and learning is more effective than one that can't. The cognitive preamble makes every skill "ultra" by giving it context.

3. **Learning loop applies to skills**: The gotchas flywheel is a learning loop. Noesis should capture skill failures and add them to the learning layer. Over time, the agent's skills improve through execution.

4. **Progressive disclosure matches noesis**: The three-tier skill loading (index → load → runtime) maps to noesis's progressive cognitive state (attention → belief → inference → learning).

5. **Skills as cognitive projections**: A noesis skill is not just a SKILL.md file — it's a cognitive projection that includes the agent's beliefs about the skill's domain, its past failures, and its learned patterns. This is what makes it "ultra."
