# omp-noesis: Testing Strategy

> **Version:** 0.1.0  
> **Date:** 2026-06-15  
> **Status:** Finalized

## 1. Philosophy

> **300% coverage means three independent testing layers, each at 100% coverage of its respective scope.**

Traditional code coverage measures lines executed. Product coverage measures behaviors verified. Noesis requires both.

## 2. Three Layers

| Layer | Scope | Target | Count |
|---|---|---|---|
| **Unit** | Domain logic, pure functions, strategies | 100% of branches | ~150 tests |
| **Integration** | Tool + hook wiring, persistence, Graphify client | 100% of paths | ~80 tests |
| **Behavioral** | Agent simulation, compaction survival, learning | 100% of behaviors | ~60 tests |
| **Total** | — | **300%** | **~290 tests** |

## 3. Unit Tests (`tests/unit/`)

### Patterns
- Arrange-Act-Assert with mocked state
- Property-based testing for ranking formulas
- Mutation testing for revision strategies

### Example Matrix

| Module | Category | Cases |
|---|---|---|
| `revision-strategy.ts` | Supersession chains | 20 |
| `revision-strategy.ts` | Deduplication (K*6) | 10 |
| `revision-strategy.ts` | Contradiction scope | 15 |
| `confidence-strategy.ts` | Graphify mapping | 14 |
| `confidence-strategy.ts` | Stale penalty | 8 |
| `ranking-strategy.ts` | Recency decay | 10 |
| `ranking-strategy.ts` | Task relevance | 8 |
| `ranking-strategy.ts` | Failure multiplier | 6 |
| `eviction-strategy.ts` | Over-cap trimming | 12 |
| `eviction-strategy.ts` | Stale removal | 8 |
| `commitment-domain.ts` | Dependency resolution | 15 |
| `commitment-domain.ts` | Status transitions | 10 |
| `preamble-builder.ts` | Section ordering | 8 |
| `preamble-builder.ts` | Trim strategy | 12 |
| `focus-resolver.ts` | Fallback chain | 6 |
| `graphify-parser.ts` | Output parsing | 20 |
| `graphify-engine.ts` | Confidence translation | 10 |

### Sample Test

```typescript
import { describe, expect, test } from "bun:test";
import { AGMRevisionStrategy } from "../../src/domains/belief/revision-strategy";

describe("AGMRevisionStrategy", () => {
  test("K*2 Success: new fact is always included", () => {
    const state = createEmptyState();
    const strategy = new AGMRevisionStrategy();
    const newFact = createFact({ content: "We use Bun" });

    const result = strategy.reviseFact(state, newFact);

    expect(result.status).toBe("active");
    expect(state.belief.facts).toContainEqual(expect.objectContaining({ content: "We use Bun" }));
  });

  test("K*5 Consistency: contradicted belief is superseded", () => {
    const state = createEmptyState();
    const oldFact = createFact({ content: "We use Node.js", status: "active" });
    state.belief.facts.push(oldFact);

    const strategy = new AGMRevisionStrategy();
    const newFact = createFact({ content: "We use Bun", contradictsIds: [oldFact.id] });

    strategy.reviseFact(state, newFact, [oldFact.id]);

    const updatedOld = state.belief.facts.find(f => f.id === oldFact.id);
    expect(updatedOld?.status).toBe("superseded");
    expect(updatedOld?.supersededBy).toBe(newFact.id);
    expect(newFact.status).toBe("active");
  });

  test("K*6 Equivalence: identical content is a no-op", () => {
    const state = createEmptyState();
    const existing = createFact({ content: "We use Bun", status: "active" });
    state.belief.facts.push(existing);

    const strategy = new AGMRevisionStrategy();
    const duplicate = createFact({ content: "We use Bun" });

    const result = strategy.reviseFact(state, duplicate);

    expect(result).toBeNull();
    expect(state.belief.facts).toHaveLength(1);
  });

  test("Recovery postulate is explicitly rejected", () => {
    const state = createEmptyState();
    const fact1 = createFact({ content: "We use Node.js", status: "active" });
    state.belief.facts.push(fact1);

    const strategy = new AGMRevisionStrategy();
    const fact2 = createFact({ content: "We use Bun", contradictsIds: [fact1.id] });
    strategy.reviseFact(state, fact2, [fact1.id]);

    const fact3 = createFact({ content: "We use Node.js", contradictsIds: [fact2.id] });
    strategy.reviseFact(state, fact3, [fact2.id]);

    const original = state.belief.facts.find(f => f.id === fact1.id);
    expect(original?.status).toBe("superseded");
    expect(original?.supersededBy).toBe(fact2.id);
  });
});
```

## 4. Integration Tests (`tests/integration/`)

### Patterns
- Mock OMP's `ExtensionAPI` with typed stubs
- Mock Graphify CLI with fixture outputs
- Use temporary directories for state file testing
- Test atomic write protocol

### Example Matrix

| Integration | Category | Cases |
|---|---|---|
| `noesis_attend` | Graphify query execution | 8 |
| `noesis_attend` | Capability detection | 6 |
| `noesis_believe` | Fact persistence + revision | 10 |
| `noesis_believe` | Decision persistence | 6 |
| `noesis_believe` | Learning resolution | 8 |
| `noesis_infer` | Hypothesis lifecycle | 8 |
| `noesis_commit` | Workflow CRUD | 10 |
| `noesis_recall` | Query filtering | 8 |
| `context-hook` | Preamble injection | 10 |
| `context-hook` | Double-preamble prevention | 4 |
| `compaction-hook` | Survivor selection | 8 |
| `compaction-hook` | preserveData serialization | 6 |
| `tool-result-hook` | Failure capture | 8 |
| `tool-result-hook` | Success filtering | 6 |
| `turn-end-hook` | Eviction + vault flush | 8 |
| `filesystem-store` | Atomic write protocol | 6 |
| `filesystem-store` | Migration path | 4 |
| `vault-detector` | Backend resolution | 8 |
| `obsidian-vault-store` | Note creation + search | 6 |

### Sample Test

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createMockPi } from "../helpers/mock-pi";
import { createRuntime } from "../../src/runtime";
import { registerTools } from "../../src/tools";

describe("noesis_believe integration", () => {
  let tmpDir: string;
  let pi: ReturnType<typeof createMockPi>;
  let runtime: ReturnType<typeof createRuntime>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "noesis-test-"));
    pi = createMockPi();
    runtime = createRuntime(tmpDir, pi);
    registerTools(pi, runtime);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("fact belief persists to state.json and survives compaction", async () => {
    await pi.tools.noesis_believe.execute("tc-1", {
      type: "fact",
      content: "We use Bun runtime",
      confidence: 1.0,
      source: "execution",
      tags: ["infrastructure"]
    });

    const statePath = join(tmpDir, ".omp", "noesis", "state.json");
    const state = JSON.parse(await Bun.file(statePath).text());
    expect(state.belief.facts).toHaveLength(1);
    expect(state.belief.facts[0].content).toBe("We use Bun runtime");

    const compactionResult = await pi.hooks["session.compacting"].handler({});
    expect(compactionResult.context).toContain("We use Bun runtime");
    expect(compactionResult.preserveData?.noesis).toBeDefined();
  });
});
```

## 5. Behavioral Tests (`tests/behavioral/`)

### Patterns
- Simulate full agent sessions with turn sequences
- Test compaction survival as black-box property
- Test learning loop effectiveness
- Test skill loading and APPEND_SYSTEM effectiveness

### Example Matrix

| Behavior | Scenario | Validation |
|---|---|---|
| Compaction Survival | Agent works 20 turns, compaction fires, new session resumes | Beliefs, decisions, workflow intact |
| Learning Prevention | Agent fails test → captures learning → next session avoids mistake | Second session does not repeat failure |
| Graphify Grounding | Agent queries Graphify → commits belief → survives compaction | Belief content matches graph output |
| Belief Revision | Agent commits fact A → later commits contradictory fact B | Fact A is superseded, not deleted |
| Smart Zone | Agent accumulates 50 beliefs → preamble stays ≤2000 tokens | Token count verified |
| Graceful Degradation | Graphify not installed → agent still functions | DEGRADED mode, no errors |
| Skill Effectiveness | Agent with noesis skill vs. agent without | Task completion rate, token efficiency |
| Vault Projection | Agent resolves learning → turn ends → artifact in vault | Markdown file exists |
| Cross-Session Recall | Session 1 commits belief → Session 2 recalls it | `noesis_recall` returns correct belief |
| Double-Preamble Guard | Both context and before_agent_start hooks fire | Only one preamble injected |

### Sample Test

```typescript
import { describe, expect, test } from "bun:test";
import { AgentSimulator } from "../helpers/agent-simulator";

describe("Product: Learning Loop prevents repeated failures", () => {
  test("agent does not repeat the same build failure after learning capture", async () => {
    const sim = new AgentSimulator({
      projectRoot: "/tmp/test-project",
      loadNoesis: true,
      loadSkills: ["noesis", "noesis-learning"]
    });

    // Session 1: Agent encounters build failure
    await sim.turn("Add a new API endpoint");
    await sim.toolCall("bash", { command: "bun build" });
    await sim.toolResult("bash", { exitCode: 1, stderr: "Cannot find module 'zod'" });

    await sim.agentAction("noesis_believe", {
      type: "learning",
      learningId: sim.lastLearningId,
      rootCause: "Missing 'zod' dependency in package.json",
      fix: "Add zod to dependencies and run bun install"
    });

    await sim.compact();
    await sim.newSession();

    // Session 2: Agent starts similar task
    await sim.turn("Add another API endpoint with validation");

    const actions = sim.getActions();
    const hasRecall = actions.some(a => a.tool === "noesis_recall" && a.params.query === "relevant_learning");
    const hasInstall = actions.some(a => a.tool === "bash" && a.params.command.includes("bun add zod"));
    const buildIndex = actions.findIndex(a => a.tool === "bash" && a.params.command.includes("bun build"));
    const installIndex = actions.findIndex(a => a.tool === "bash" && a.params.command.includes("bun add zod"));

    expect(hasRecall).toBe(true);
    expect(hasInstall).toBe(true);
    expect(installIndex).toBeLessThan(buildIndex);
  });
});
```

## 6. Test Infrastructure

```typescript
// tests/helpers/agent-simulator.ts
export class AgentSimulator {
  private turns: Turn[] = [];
  private state: NoesisState;
  private pi: MockExtensionAPI;
  private runtime: NoesisRuntime;

  constructor(options: SimulatorOptions) {
    this.pi = createMockPi();
    this.runtime = createRuntime(options.projectRoot, this.pi);
    if (options.loadNoesis) {
      registerTools(this.pi, this.runtime);
      registerHooks(this.pi, this.runtime);
    }
    if (options.loadSkills) {
      loadSkills(this.pi, options.loadSkills);
    }
  }

  async turn(userMessage: string): Promise<void> { /* ... */ }
  async toolCall(toolName: string, params: unknown): Promise<void> { /* ... */ }
  async toolResult(toolName: string, result: unknown): Promise<void> { /* ... */ }
  async agentAction(toolName: string, params: unknown): Promise<void> { /* ... */ }
  async compact(): Promise<void> { /* ... */ }
  async newSession(): Promise<void> { /* ... */ }
  getActions(): AgentAction[] { return this.turns.at(-1)?.actions ?? []; }
}
```

## 7. Running Tests

```bash
# All layers
bun test

# Individual layers
bun test tests/unit
bun test tests/integration
bun test tests/behavioral

# With coverage
bun test --coverage

# Watch mode
bun test --watch

# Specific test
bun test tests/behavioral/compaction-survival.test.ts
```

## 8. Coverage Targets

| Layer | Code Coverage | Behavior Coverage |
|---|---|---|
| Unit | ≥ 95% | 100% of domain branches |
| Integration | ≥ 90% | 100% of integration paths |
| Behavioral | N/A (tests product, not code) | 100% of product behaviors |
| Overall | ≥ 90% | 300% (3 layers × 100%) |
