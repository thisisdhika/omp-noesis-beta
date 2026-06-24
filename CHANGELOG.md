# Changelog

All notable changes to omp-noesis are documented here.

## 1.0.1 (2026-06-24) — Full Type-Safety Release

### Type Safety

- Added `scope`, `revision`, `epistemicStatus`, `reviewRequired` to all `BeliefFact`/`BeliefDecision` constructors — Zod fills defaults at runtime, TS requires at compile time
- Fixed 20+ test files: missing required fields, `noUncheckedIndexedAccess` non-null assertions, mock interface casts
- Fixed `commands/index.ts` handler return types (`Promise<void>`)
- Fixed `init-command.ts` `YamlNode` indexing with type guards

### API Compatibility

- **DeepSeek API**: renamed `noesis:sandbox` → `noesis_sandbox` and `noesis:federate` → `noesis_federate` (colons violate DeepSeek's `^[A-Za-z0-9_-]{1,64}$` regex); CLI commands kept colon form
- **`federate-tool.ts`**: rewritten to single-object `pi.registerTool({...})` with Zod schema and `async execute()`
- **`federate-command.ts`**: replaced `result.status`/`result.error`/`result.data` with `result.isError`/`result.content[0].text`

### Bug Fixes

- Fixed 30s handler timeout: hooks made fire-and-forget (`.catch(() => {})`), `detectCapability()` auto-heal spawn removed (pure stat-only)
- Fixed TUI logging pollution: `logger.ts` `setLogger()` now makes `info`/`debug` no-ops, only `warn`/`error` emit; accepts `{ logger?: Partial<Logger> }` for graceful degradation
- Fixed `hydrate-from-memory.ts`: `parseContext` context access restored (OMP types don't expose `context` but runtime may return it — pragma cast with fallback)
- Fixed `populatedState()` fixture regression: restored missing `status: "active"` on decision
- Fixed 2 corrupted `preamble-builder.test.ts` blocks from worker edit

### Documentation

- Documented `parseContext` metadata loss as intentional (ponytail: OMP search API), upgrade path noted
- Updated all doc headers to v1.0.1

### Infrastructure

- Current repository verification: 1116/1116 tests passing, 0 TypeScript errors.
- Full `strict: true` + `noUncheckedIndexedAccess` compliance
