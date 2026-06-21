---
kind: decision
id: bd-a01ae9ce-fccf-4c2d-a34b-d5e043b57359
pushedAt: "2026-06-21T17:56:48.701Z"
projectPath: /Users/thisisdhika/Projects/kaa.ltd/LAB/omp-noesis
metadata:
  rationale: "The user explicitly asked to finalize as stable v1.0, so the release target should be a real semver major bump rather than preserving the current internal 0.x baseline. This also resolves the README/package/doc drift under a single release number."
  source: user
  alternatives: "Keep 0.1.0 and only align docs, Adopt 0.3.0 as the canonical version, Bump to 1.0.0 as the stable release target"
  tags: "versioning, release, v1.0, contract"
---
Treat omp-noesis target release as stable v1.0.0 and align all user-facing/versioned artifacts to 1.0.0 during finalization.