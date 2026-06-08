# TIC Analyzer

Motor local de análise para projetos grandes — zero tokens de IA na análise.

## Modelo mental

```
código (74k arquivos) → engine local → resumo compacto → IA (mínimo)
```

## Stack

- **Electron** — janela nativa, distribui como .exe
- **React + Vite** — UI do renderer
- **TypeScript** — tudo tipado
- **MCP SDK** — servidor para Claude Code

## Estrutura

```
electron/
  main.ts             ← processo principal (janela, IPC, MCP lifecycle)
  preload.ts          ← bridge segura renderer ↔ main
src/
  analyzer/           ← engine de análise (puro Node.js, zero tokens)
    semantic/
      functions.ts    ← walker tree-sitter compartilhado (funções + refs)
    scanFiles.ts
    detectStack.ts
    buildDependencyGraph.ts
    detectRisks.ts
    detectFrameworkRisks.ts    ← SQLi em ORM, misconfig web, APIs inseguras (por framework)
    detectClones.ts            ← clones de código (token-based, tipo-1/2)
    computeFunctionMetrics.ts  ← CC por função + dead-code (funções sem uso)
    detectEndpoints.ts
    detectModules.ts
    generateQuickContext.ts   ← quick-context.md (~12k tokens)
    generateModuleContext.ts  ← context.md por módulo (~75k tokens)
    generateMasterIndex.ts    ← index.md (mapa de navegação)
    tokenBudget.ts
    pipeline.ts               ← orquestra tudo
  mcp/
    server.ts           ← MCP Server HTTP/SSE (localhost:7432)
  ui/
    App.tsx             ← interface React
    main.tsx
```

## Desenvolvimento

```bash
npm install
npm run dev
```

## Build

```bash
npm run dist:win    # → release/TIC Analyzer Setup.exe
npm run dist:mac    # → release/TIC Analyzer.dmg
npm run dist:linux  # → release/TIC Analyzer.AppImage
```

## MCP Server (Claude Code)

Configure em `.claude/settings.json` do projeto analisado:

```json
{ "mcpServers": { "tic-analyzer": { "url": "http://localhost:7432/mcp" } } }
```

Ferramentas: `list_modules`, `get_module`, `get_quick_context`, `search_module`,
`get_security_findings`, `get_clones`, `get_dead_code`
