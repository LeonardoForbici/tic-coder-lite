# TIC Coder Lite Confidence Report

Generated at: 2026-04-30T23:12:27.920Z
Project: tic-coder-lite

## Confidence Scale

🟢 CONFIRMED — detectado diretamente no código
🟡 INFERRED — inferido por nome/convenção
🔴 GAP — precisa validação humana

## 🟢 CONFIRMED

- Project name: tic-coder-lite
- Root path: C:\git\tic-coder-lite
- Files scanned: 42
- Lines scanned: 4399
- Graph nodes: 50
- Graph edges: 94
- Risk findings: 0
- Node.js: package.json
- TIC Coder Lite has three modes: Lite Mode, Standard AI Mode, and Local AI Mode.
- Lite Mode does not require AI, database, Docker, server, or Ollama.

## 🟡 INFERRED

- unknown: 37 file(s) by naming/path convention
- src/commands/analyzeProject.ts: central by graph degree 13
- src/reversa-adapter/exportForEngines.ts: central by graph degree 12
- src/exporters/writeTicCodeFolder.ts: central by graph degree 11
- src/extension.ts: central by graph degree 8
- src/scanner/detectStack.ts: central by graph degree 7
- src/commands/enhanceWithLocalAi.ts: central by graph degree 7
- src/commands/generateAgentContext.ts: central by graph degree 6
- src/webview/overviewPanel.ts: central by graph degree 6
- src/reversa-adapter/detectEngines.ts: central by graph degree 6
- src/scanner/buildGraph.ts: central by graph degree 5
- node:fs: medium graph risk by connection count
- node:path: high graph risk by connection count
- vscode: high graph risk by connection count
- src/commands/analyzeProject.ts: high graph risk by connection count
- src/commands/enhanceWithLocalAi.ts: medium graph risk by connection count
- src/commands/generateAgentContext.ts: medium graph risk by connection count
- src/exporters/writeTicCodeFolder.ts: high graph risk by connection count
- src/extension.ts: medium graph risk by connection count
- src/reversa-adapter/detectEngines.ts: medium graph risk by connection count
- src/reversa-adapter/exportForEngines.ts: high graph risk by connection count

## 🔴 GAP

- Runtime behavior was not executed or traced.
- Business rules were not semantically validated by a human.
- Import graph does not prove all runtime dependencies or reflection-based calls.
- Security roles and permissions require human validation.
- Database schema meaning and migration safety require human validation.
- Test coverage and production usage were not measured.

## Notes

- Confirmed facts are extracted from files, manifests, imports, graph edges, and deterministic risk rules.
- Inferred facts are useful for navigation, but should be checked against source before architectural edits.
- Gaps are validation prompts for humans or a deeper project-specific review.
