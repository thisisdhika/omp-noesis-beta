# Session Handoff — 2026-06-15

## Session Summary

Continued the deep-audit-and-fix pass on omp-noesis v0.1.0, then researched and fixed the setup/installation documentation, and prepared the project for npm publishing as `omp-noesis`.

## What Changed This Session

### Documentation Fixes (12 errors in SETUP.md)
- **Graphify version**: `>= 8.2.0` → `>= 0.3.0` (the `v8` is a git branch name, not a version; PyPI latest is v0.8.39)
- **Graphify package**: `pip install graphify` → `pip install graphifyy` (double-y is the PyPI package name)
- **Install command**: Removed fake `bun add @omp-noesis/extension` (not on npm) → replaced with `omp install omp-noesis`
- **Fabricated output**: Removed `omp --check-extensions` (flag doesn't exist) + fake expected output → replaced with `omp doctor` + `ls` verification
- **Redundant step**: Removed separate `graphify .` step (init already runs `graphify . --no-viz`)
- **Vault artifact kinds**: 3 → 5 (added `pattern`, `session`)
- **Terminology**: "noesis skill" → "noesis extension"
- **Tool names**: 3 listed → all 7: `noesis_attend`, `_focus`, `_believe`, `_commit`, `_infer`, `_recall`, `_vault_search`
- **Mnemopi**: Added install instructions (`omp install @oh-my-pi/mnemopi`)
- **Extension loading**: Added note about auto-load from `~/.omp/plugins/`
- **Python prerequisite**: Fixed broken markdown list formatting

### Related Doc Fixes
- **README.md**: graphify version, install command, fake output
- **TROUBLESHOOTING.md**: `graphify update .` → `graphify . --update` (flag form, verified via local CLI)
- **docs/GRAPHIFY_CONTRACT.md**: same `--update` flag correction (lines 26, 66)

### npm Publishing Prep
- **Package name**: `@omp-noesis/extension` → `omp-noesis`
- **Distribution**: TypeScript source (no compilation — Bun runs TS natively, OMP loads from `omp.extensions`)
- **Manifest**: Added `pi.extensions` for Pi ecosystem backward compatibility
- **Keywords**: Added `omp-plugin`, `pi-package` for OMP/Pi search discoverability
- **Publish guard**: `prepublishOnly: "bun run typecheck"` ensures no broken TS ships
- **Removed**: `tsconfig.build.json`, `dist/` (not needed for TS source distribution)

### Key OMP Plugin Research
- OMP loads extensions from `omp.extensions` in package.json — **NOT** from npm's `main` field
- `omp install omp-noesis` installs into `~/.omp/plugins/` and auto-discovers
- `omp --extension <path>` loads a local filesystem path for dev
- Plugins ship TypeScript source; Bun executes it directly
- Marketplace/npm sources through `omp plugin install` flow

## Current State

```
Commit:  301608c (55 files, +1874 -1242)
Branch:  (detached HEAD at 301608c)

TypeScript:  tsc --noEmit        → 0 diagnostics
Tests:       bun test            → 546 pass, 0 fail
Files:       43 test files
```

### Package.json (publish-ready)
```json
{
  "name": "omp-noesis",
  "version": "0.1.0",
  "main": "src/index.ts",
  "files": ["src/"],
  "omp": { "extensions": ["src/index.ts"] },
  "pi": { "extensions": ["src/index.ts"] },
  "keywords": ["omp-plugin", "pi-package", ...],
  "prepublishOnly": "bun run typecheck"
}
```

## To Publish

```bash
npm login
npm publish --access public
```

Users install with: `omp install omp-noesis`

## Known Remaining Gaps (unchanged from previous session)

- `preserveData.noesis` not consulted in StateManager.initialize() error recovery
- HindsightVaultStore is a stub
- 4 of 10 behavioral scenarios from TESTING_STRATEGY.md remain unimplemented
- ObsidianVaultStore.search() uses `grep` shell-out (fragile cross-platform)
