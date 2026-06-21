---
kind: decision
id: bd-bd9c08a4-fc2f-4df6-8ad2-ab90b9e8e7eb
pushedAt: "2026-06-21T17:55:31.309Z"
projectPath: /Users/thisisdhika/Projects/kaa.ltd/LAB/omp-noesis
metadata:
  rationale: "Never wired in createRuntime(), always undefined in production, only exercised through mocks. Keeping it on the interface is misleading. Add back when OMP provides a memory backend API contract."
  source: execution
  alternatives: ~
  tags: "retainToOmp, YAGNI, runtime"
---
Remove dead retainToOmp from NoesisRuntime interface, believe-tool.ts guard, and associated tests.