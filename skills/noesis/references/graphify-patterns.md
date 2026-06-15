# Graphify Query Patterns

## Query Templates

### Find Entry Points
```
"What are the god nodes in this codebase?"
"What are the most central files?"
```

### Find Patterns
```
"What functions handle {domain}?"
"What middleware is used for {purpose}?"
"Where is {feature} implemented?"
```

### Dependency Analysis
```
"What depends on {module}?"
"What does {module} depend on?"
"graphify path {source} {target}"
```

### Deep Dive
```
"graphify explain {node_name}"
"What community does {node} belong to?"
"What are the surprising connections for {node}?"
```

## Interpreting Results

### God Nodes
- High-centrality files — start here when exploring
- Usually core utilities, main entry points, or critical services

### Communities
- Architectural domains — scope your beliefs to them
- Cross-community edges are "surprising connections" — flag for review

### Confidence Labels
- **EXTRACTED**: Direct code evidence (imports, calls) — high trust
- **INFERRED**: Deduced from patterns — verify before believing
- **AMBIGUOUS**: Uncertain — never auto-believe

## Stale Graph Handling

If the graph is stale:
1. Confidence drops by one tier for INFERRED edges
2. EXTRACTED edges remain at 1.0
3. Consider running `graphify update .` before critical decisions
