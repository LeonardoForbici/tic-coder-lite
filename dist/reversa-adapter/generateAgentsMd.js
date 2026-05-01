"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAgentsMd = generateAgentsMd;
exports.baseEngineContext = baseEngineContext;
function generateAgentsMd(summary) {
    return baseEngineContext('Codex', 'AGENTS.md', summary, 'Leia este arquivo antes de planejar ou editar.');
}
function baseEngineContext(engineName, targetFile, summary, engineInstruction) {
    const stack = summary.inventory.stack
        .filter((signal) => signal.detected)
        .map((signal) => `- ${signal.name}: ${signal.evidence.join(', ') || 'detectado'}`)
        .join('\n');
    const centralFiles = summary.graph.stats.centralFiles
        .slice(0, 10)
        .map((file, index) => `${index + 1}. ${file.path}`)
        .join('\n');
    const risks = summary.risks.risks
        .slice(0, 10)
        .map((risk) => `- ${risk.level.toUpperCase()} ${risk.title}: ${risk.file}${risk.line ? `:${risk.line}` : ''}`)
        .join('\n');
    return `# Contexto TIC Coder Lite para ${engineName}

Esta seção de ${targetFile} foi gerada pelo TIC Coder Lite.

${engineInstruction}

## Modos do TIC Coder Lite

- Modo Lite: scanner determinístico, grafo, riscos e contexto. Funciona sem IA, banco, Docker ou servidor.
- IA Padrão: exporta este contexto para ferramentas de IA. Codex usa AGENTS.md, Claude Code usa CLAUDE.md, Copilot usa .github/copilot-instructions.md, Cursor usa .cursorrules, Gemini usa GEMINI.md.
- IA Local: melhoria opcional com Ollama. Comece com um modelo pequeno como qwen2.5-coder:1.5b; nenhum modelo de 60GB é obrigatório e o modo pode ser desativado.

## Arquivos de Contexto Obrigatórios

Antes de alterar código, leia:

- .tic-code/agent-context.md
- .tic-code/risks.md
- .tic-code/architecture.md
- .tic-code/confidence-report.md
- .tic-code/questions.md

## Resumo do Projeto

- Projeto: ${summary.workspaceName}
- Raiz: ${summary.rootPath}
- Arquivos analisados: ${summary.totalFiles}
- Linhas analisadas: ${summary.totalLines}
- Nós do grafo: ${summary.graph.stats.nodeCount}
- Arestas do grafo: ${summary.graph.stats.edgeCount}
- Riscos detectados: ${summary.risks.summary.total}

## Stack Detectada

${stack || '- Nenhum sinal de stack detectado'}

## Ordem Recomendada de Leitura

${centralFiles || '1. .tic-code/agent-context.md\n2. .tic-code/architecture.md\n3. .tic-code/risks.md'}

## Principais Riscos

${risks || '- Nenhum risco determinístico detectado'}

## Regras de Segurança

- Prefira fatos de .tic-code em vez de suposições.
- Abra os arquivos citados antes de alterar comportamento.
- Não remova endpoints, migrations, regras de autenticação, contratos públicos ou contexto gerado sem validação humana.
- Não introduza IA externa, RAG, bancos, servidores ou fluxos de instalação do Reversa no TIC Coder Lite.

## Créditos

A detecção de engines e o comportamento de escrita segura são adaptados conceitualmente do Reversa by Sandeco, licença MIT. O TIC Coder Lite permanece uma extensão separada e grava seu contexto principal em .tic-code.
`;
}
//# sourceMappingURL=generateAgentsMd.js.map