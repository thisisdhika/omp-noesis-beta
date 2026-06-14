# Changelog

## 2026-06-14

- refactored the contract test suite to 73+ focused tests across contract, property, scenario, and integration coverage
- fixed the RPC smoke harness for OMP 15.12.4 by checking extension load through `available_commands_update` and listening for `tool_execution_start`
- added real OMP integration coverage for preamble injection, session orientation, active-coding workflow, graph-finding cleanup, and repeated-failure ranking
- hardened tool schema handling so RPC-driven `believe` and `infer` tool calls validate correctly
- added vault contract coverage for local, noop, detector, and obsidian merger behavior
- converted `GraphifyClient` graph operations to async execution and updated callers/tests
- replaced the naive token estimator with a mixed-content heuristic and added budget coverage for CJK/ASCII cases
- removed stale tracker gaps that are now closed
- ran mutation testing and added targeted follow-up tests for belief revision, learning ranking/eviction, and graphify behavior
