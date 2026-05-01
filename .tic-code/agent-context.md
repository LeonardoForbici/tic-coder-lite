# TIC Coder Lite Agent Context

Generated at: 2026-04-30T23:12:27.919Z
Project: tic-coder-lite
Root: C:\git\tic-coder-lite

## Purpose

This file is an operational context for Codex, Claude Code, Copilot, Cursor, and local AI agents before changing code. It is generated locally from deterministic scan, stack, graph, and risk data.

## TIC Coder Lite Modes

1. Lite Mode: deterministic scanner, graph, risks, and context. No AI, no database, no Docker, no server.
2. Standard AI Mode: exports context for existing AI tools. Codex uses AGENTS.md, Claude Code uses CLAUDE.md, Copilot uses .github/copilot-instructions.md, Cursor uses .cursorrules, Gemini uses GEMINI.md.
3. Local AI Mode: optional Ollama enhancement. Recommended starter model: qwen2.5-coder:1.5b. It can be disabled and does not require large 60GB models.

## Detected Stack

- Node.js: package.json

## Project Snapshot

- Files scanned: 42
- Lines scanned: 4399
- Graph nodes: 50
- Graph edges: 94
- Risks detected: 0

## Critical Modules

- unknown: 42 graph node(s)

## High Risk Files

- src/commands/analyzeProject.ts: high graph centrality
- src/exporters/writeTicCodeFolder.ts: high graph centrality
- src/reversa-adapter/exportForEngines.ts: high graph centrality

## Important Dependencies

- node:path: 12 connection(s)
- vscode: 12 connection(s)
- node:fs: 8 connection(s)
- @types/node: 1 connection(s)
- @types/vscode: 1 connection(s)
- node:child_process: 1 connection(s)
- node:util: 1 connection(s)
- typescript: 1 connection(s)

## Main Risks

- No deterministic risks detected

## Recommended Reading Order

1. NOTICE.md
2. README.md
3. package.json
4. tsconfig.json
5. .tic-code/inventory.md
6. .tic-code/architecture.md
7. .tic-code/risks.md
8. src/commands/analyzeProject.ts
9. src/reversa-adapter/exportForEngines.ts
10. src/exporters/writeTicCodeFolder.ts
11. src/extension.ts
12. src/scanner/detectStack.ts
13. src/commands/enhanceWithLocalAi.ts
14. src/commands/generateAgentContext.ts
15. src/webview/overviewPanel.ts
16. src/reversa-adapter/detectEngines.ts
17. src/scanner/buildGraph.ts
18. src/reversa-adapter/generateAgentsMd.ts

## Instructions For AI Agents

- Read this file, .tic-code/inventory.md, .tic-code/architecture.md, and .tic-code/risks.md before editing.
- Treat confirmed facts as local project truth unless source files changed after this scan.
- Open cited source files before modifying behavior.
- Prefer narrow edits around the module and dependencies involved in the request.
- Re-run TIC Coder Lite analysis after meaningful code changes.
- Keep generated files inside .tic-code unless the user asks to export context elsewhere.
- Remember: Lite Mode facts work without IA; Standard AI Mode only exports context; Local AI Mode is optional.

## Do Not Do Without Human Validation

- Do not remove public APIs, endpoints, database scripts, migrations, or security checks based only on inference.
- Do not rename modules, packages, routes, or environment variables without validating callers.
- Do not assume an inferred module boundary is an intentional architecture rule.
- Do not treat graph risk as proof of a bug; use it as a priority signal for inspection.
- Do not add external services, databases, AI runtimes, RAG, or servers to TIC Coder Lite workflows.

## Credits

- Reversa by Sandeco, MIT License.
- TIC Coder Lite by TIC / Leonardo Forbici.
- InsightGraph concepts used as internal reference, not bundled as dependency.
