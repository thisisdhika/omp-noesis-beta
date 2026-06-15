# Belief Writing Patterns

## High-Signal Fact Template

```
{mechanism} at {path} {action} {target} using {method}
```

Example: "JWT middleware at src/auth/jwt.ts validates Bearer tokens against HS256 secret."

## High-Signal Decision Template

```
Use {choice} over {alternative} because {rationale}.
Rejected: {rejected_options}
```

Example: "Use PostgreSQL over MongoDB because ACID compliance is required for financial transactions. Rejected: MongoDB (no ACID), SQLite (no concurrency)."

## Confidence Assignment Guide

| Situation | Source | Confidence |
|---|---|---|
| You ran the code and it worked | execution | 1.0 |
| User explicitly stated it | user | 1.0 |
| Graphify found an import statement | graph (EXTRACTED) | 1.0 |
| Graphify inferred a call relationship | graph (INFERRED) | 0.55-0.95 |
| You deduced from code patterns | inference | 0.5-0.95 |
| You are unsure but it's likely | inference | 0.5 |

## Tag Taxonomy

- `auth` — Authentication, authorization, identity
- `database` — Data storage, queries, migrations
- `api` — Endpoints, routing, controllers
- `performance` — Caching, optimization, scaling
- `testing` — Tests, assertions, coverage
- `deployment` — CI/CD, infrastructure, Docker
- `security` — Encryption, secrets, validation
- `frontend` — UI components, state management
- `backend` — Server logic, middleware, services
