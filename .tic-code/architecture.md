# TIC Coder Lite Architecture

Generated at: 2026-04-30T23:12:27.901Z
Project: tic-coder-lite
Root: C:\git\tic-coder-lite

## Graph Summary

- Nodes: 50
- Edges: 94
- Internal edges: 57
- External/package edges: 37

## Detected Stack

- Node.js: package.json

## Modules Found

- unknown: 42 nodes
- external: 8 nodes

## Main Dependencies

- package.json -> @types/node: 1 dependency edge(s)
- package.json -> @types/vscode: 1 dependency edge(s)
- package.json -> typescript: 1 dependency edge(s)
- src/commands/analyzeProject.ts -> node:path: 1 dependency edge(s)
- src/commands/analyzeProject.ts -> vscode: 1 dependency edge(s)
- src/commands/analyzeProject.ts -> src/exporters/writeTicCodeFolder.ts: 1 dependency edge(s)
- src/commands/analyzeProject.ts -> src/scanner/buildGraph.ts: 1 dependency edge(s)
- src/commands/analyzeProject.ts -> src/scanner/detectRisks.ts: 1 dependency edge(s)
- src/commands/analyzeProject.ts -> src/scanner/detectStack.ts: 1 dependency edge(s)
- src/commands/analyzeProject.ts -> src/scanner/scanWorkspace.ts: 1 dependency edge(s)
- src/commands/analyzeProject.ts -> src/types.ts: 1 dependency edge(s)
- src/commands/enhanceWithLocalAi.ts -> vscode: 1 dependency edge(s)
- src/commands/enhanceWithLocalAi.ts -> src/commands/analyzeProject.ts: 1 dependency edge(s)
- src/commands/enhanceWithLocalAi.ts -> src/local-ai/checkOllamaStatus.ts: 1 dependency edge(s)
- src/commands/enhanceWithLocalAi.ts -> src/local-ai/enhanceAgentContext.ts: 1 dependency edge(s)
- src/commands/enhanceWithLocalAi.ts -> src/local-ai/enhanceModuleSummary.ts: 1 dependency edge(s)
- src/commands/enhanceWithLocalAi.ts -> src/local-ai/ollamaClient.ts: 1 dependency edge(s)
- src/commands/exportAgentsMd.ts -> vscode: 1 dependency edge(s)
- src/commands/exportAgentsMd.ts -> src/reversa-adapter/exportForEngines.ts: 1 dependency edge(s)
- src/commands/generateAgentContext.ts -> vscode: 1 dependency edge(s)
- src/commands/generateAgentContext.ts -> src/commands/analyzeProject.ts: 1 dependency edge(s)
- src/commands/generateAgentContext.ts -> src/exporters/generateAgentContextMd.ts: 1 dependency edge(s)
- src/commands/generateAgentContext.ts -> src/exporters/writeTicCodeFolder.ts: 1 dependency edge(s)
- src/commands/generateAgentContext.ts -> src/types.ts: 1 dependency edge(s)
- src/commands/openOverview.ts -> vscode: 1 dependency edge(s)
- src/commands/openOverview.ts -> src/webview/overviewPanel.ts: 1 dependency edge(s)
- src/exporters/writeTicCodeFolder.ts -> vscode: 1 dependency edge(s)
- src/exporters/writeTicCodeFolder.ts -> src/exporters/generateAgentContextMd.ts: 1 dependency edge(s)
- src/exporters/writeTicCodeFolder.ts -> src/exporters/generateConfidenceReportMd.ts: 1 dependency edge(s)
- src/exporters/writeTicCodeFolder.ts -> src/exporters/generateQuestionsMd.ts: 1 dependency edge(s)
- src/exporters/writeTicCodeFolder.ts -> src/scanner/buildGraph.ts: 1 dependency edge(s)
- src/exporters/writeTicCodeFolder.ts -> src/scanner/detectRisks.ts: 1 dependency edge(s)
- src/exporters/writeTicCodeFolder.ts -> src/scanner/detectStack.ts: 1 dependency edge(s)
- src/extension.ts -> vscode: 1 dependency edge(s)
- src/extension.ts -> src/commands/analyzeProject.ts: 1 dependency edge(s)
- src/extension.ts -> src/commands/enhanceWithLocalAi.ts: 1 dependency edge(s)
- src/extension.ts -> src/commands/exportAgentsMd.ts: 1 dependency edge(s)
- src/extension.ts -> src/commands/generateAgentContext.ts: 1 dependency edge(s)
- src/extension.ts -> src/commands/openOverview.ts: 1 dependency edge(s)
- src/extension.ts -> src/reversa-adapter/exportForEngines.ts: 1 dependency edge(s)

## Central Files

- src/commands/analyzeProject.ts: 13 connection(s)
- src/reversa-adapter/exportForEngines.ts: 12 connection(s)
- src/exporters/writeTicCodeFolder.ts: 11 connection(s)
- src/extension.ts: 8 connection(s)
- src/scanner/detectStack.ts: 7 connection(s)
- src/commands/enhanceWithLocalAi.ts: 7 connection(s)
- src/commands/generateAgentContext.ts: 6 connection(s)
- src/webview/overviewPanel.ts: 6 connection(s)
- src/reversa-adapter/detectEngines.ts: 6 connection(s)
- src/scanner/buildGraph.ts: 5 connection(s)
- src/reversa-adapter/generateAgentsMd.ts: 5 connection(s)
- src/scanner/scanFiles.ts: 5 connection(s)
- src/scanner/detectRisks.ts: 4 connection(s)
- src/scanner/scanWorkspace.ts: 4 connection(s)
- src/scanner/parseImports.ts: 4 connection(s)

## Possible Couplings

- No cross-module coupling detected

## Reading Notes For AI Agents

- graph.json is a lightweight file graph inspired by in-memory graph concepts, not a database.
- IMPORTS means a source file imports another workspace file.
- USES_PACKAGE means a source file imports a package that could not be resolved to a local file.
- DEPENDS_ON means package metadata declares a dependency.
- Files marked with medium or high risk have more graph connections and deserve extra care before edits.
