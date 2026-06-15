# Learning Capture Patterns

## Failure Capture Template

```
Description: {what_failed} when {trigger}
Root Cause: {actual_cause} (not {symptom})
Fix: {exact_fix} verified by {verification_command}
Skill Scope: {domain_tag}
Impact: {severity_0_to_1}
```

## Significance Filter

The `tool_result` hook auto-captures these as learning candidates:

| Tool | Exit Code | Significant? | Why |
|---|---|---|---|
| bash | ≠ 0 | YES | Command failure |
| bash | 0 | MAYBE | Only if output contains warnings/errors |
| test | ≠ 0 | YES | Test failure |
| test | 0 | YES | Test pass (confirmation) |
| build | ≠ 0 | YES | Build failure |
| build | 0 | MAYBE | Only if warnings present |
| lsp | ≠ 0 | YES | Type error |
| read | any | NO | Routine file read |
| write | any | NO | Routine file write |

## Diagnosis Checklist

Before resolving a learning entry, verify:
- [ ] Root cause is specific (mentions file, function, or config key)
- [ ] Fix is reproducible (another agent could follow it)
- [ ] Fix is verified (you ran the verification command and it passed)
- [ ] Skill scope is tagged (so it surfaces for relevant tasks)
- [ ] Impact is rated (0.1 = minor annoyance, 1.0 = blocker)
