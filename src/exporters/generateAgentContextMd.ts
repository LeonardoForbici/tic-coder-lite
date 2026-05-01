import type { GraphNode, LightweightGraph } from '../scanner/buildGraph';
import type { RiskFinding } from '../scanner/detectRisks';
import type { ProjectSummary } from '../types';

export function generateAgentContextMd(summary: ProjectSummary): string {
  const stack = summary.inventory.stack
    .filter((signal) => signal.detected)
    .map((signal) => `- ${signal.name}: ${signal.evidence.join(', ') || 'detectado por convenção'}`)
    .join('\n');

  const criticalModules = findCriticalModules(summary)
    .map((item) => `- ${item.module}: ${item.reason}`)
    .join('\n');

  const highRiskFiles = findHighRiskFiles(summary)
    .map((item) => `- ${item.file}: ${item.reason}`)
    .join('\n');

  const dependencies = findImportantDependencies(summary.graph)
    .map((item) => `- ${item.label}: ${item.degree} conexão(ões)`)
    .join('\n');

  const risks = summary.risks.risks
    .slice(0, 12)
    .map((risk) => `- ${risk.level.toUpperCase()} ${risk.title} (${risk.file}${risk.line ? `:${risk.line}` : ''})`)
    .join('\n');

  const readingOrder = buildReadingOrder(summary)
    .map((file, index) => `${index + 1}. ${file}`)
    .join('\n');

  return `# Contexto para IA do TIC Coder Lite

Gerado em: ${new Date().toISOString()}
Projeto: ${summary.workspaceName}
Raiz: ${summary.rootPath}

## Objetivo

Este arquivo é um contexto operacional para Codex, Claude Code, Copilot, Cursor e agentes locais de IA antes de alterar código. Ele é gerado localmente a partir de scan determinístico, stack, grafo e dados de risco.

## Modos do TIC Coder Lite

1. Modo Lite: scanner determinístico, grafo, riscos e contexto. Sem IA, sem banco, sem Docker e sem servidor.
2. IA Padrão: exporta contexto para ferramentas de IA existentes. Codex usa AGENTS.md, Claude Code usa CLAUDE.md, Copilot usa .github/copilot-instructions.md, Cursor usa .cursorrules, Gemini usa GEMINI.md.
3. IA Local: melhoria opcional com Ollama. Modelo inicial recomendado: qwen2.5-coder:1.5b. Pode ser desativada e não exige modelos grandes de 60GB.

## Stack Detectada

${stack || '- Nenhum sinal de stack detectado'}

## Resumo do Projeto

- Arquivos analisados: ${summary.totalFiles}
- Linhas analisadas: ${summary.totalLines}
- Nós do grafo: ${summary.graph.stats.nodeCount}
- Arestas do grafo: ${summary.graph.stats.edgeCount}
- Riscos detectados: ${summary.risks.summary.total}

## Módulos Críticos

${criticalModules || '- Nenhum módulo crítico identificado'}

## Arquivos de Alto Risco

${highRiskFiles || '- Nenhum arquivo de alto risco identificado'}

## Dependências Importantes

${dependencies || '- Nenhuma dependência importante identificada'}

## Principais Riscos

${risks || '- Nenhum risco determinístico detectado'}

## Ordem Recomendada de Leitura

${readingOrder || '1. README.md\n2. package.json\n3. .tic-code/inventory.md\n4. .tic-code/architecture.md\n5. .tic-code/risks.md'}

## Instruções para Agentes de IA

- Leia este arquivo, .tic-code/inventory.md, .tic-code/architecture.md e .tic-code/risks.md antes de editar.
- Trate fatos confirmados como verdade local do projeto, a menos que os fontes tenham mudado após este scan.
- Abra os arquivos citados antes de modificar comportamento.
- Prefira edições estreitas ao redor do módulo e das dependências envolvidas no pedido.
- Rode novamente a análise do TIC Coder Lite após mudanças relevantes de código.
- Mantenha arquivos gerados dentro de .tic-code, salvo quando o usuário pedir exportação para outro lugar.
- Lembrete: fatos do Modo Lite funcionam sem IA; IA Padrão só exporta contexto; IA Local é opcional.

## Não Fazer Sem Validação Humana

- Não remova APIs públicas, endpoints, scripts de banco, migrations ou checagens de segurança apenas por inferência.
- Não renomeie módulos, pacotes, rotas ou variáveis de ambiente sem validar chamadores.
- Não assuma que uma fronteira de módulo inferida é uma regra arquitetural intencional.
- Não trate risco do grafo como prova de bug; use como sinal de prioridade para inspeção.
- Não adicione serviços externos, bancos, runtimes de IA, RAG ou servidores aos fluxos do TIC Coder Lite.

## Créditos

- Reversa by Sandeco, MIT License.
- TIC Coder Lite by TIC / Leonardo Forbici.
- InsightGraph concepts used as internal reference, not bundled as dependency.
`;
}

function findCriticalModules(summary: ProjectSummary): Array<{ module: string; reason: string }> {
  const riskByModule = new Map<string, number>();
  const nodeByPath = new Map(summary.graph.nodes.map((node) => [node.path, node]));

  for (const risk of summary.risks.risks) {
    const module = nodeByPath.get(risk.file)?.module ?? 'unknown';
    const weight = risk.level === 'critical' ? 4 : risk.level === 'high' ? 3 : risk.level === 'medium' ? 2 : 1;
    riskByModule.set(module, (riskByModule.get(module) ?? 0) + weight);
  }

  const graphCentrality = Object.entries(summary.graph.stats.modules)
    .map(([module, count]) => ({ module, count }))
    .filter((item) => item.module !== 'external');

  const fromRisks = [...riskByModule.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([module, score]) => ({ module, reason: `${score} ponto(s) ponderados de risco` }));

  const fromGraph = graphCentrality
    .slice(0, 5)
    .map((item) => ({ module: item.module, reason: `${item.count} nó(s) no grafo` }));

  return dedupeByModule([...fromRisks, ...fromGraph]).slice(0, 8);
}

function findHighRiskFiles(summary: ProjectSummary): Array<{ file: string; reason: string }> {
  const fromRisks = summary.risks.risks
    .filter((risk) => risk.level === 'critical' || risk.level === 'high')
    .map((risk: RiskFinding) => ({ file: risk.file, reason: `risco ${risk.level}: ${risk.title}` }));

  const fromGraph = summary.graph.nodes
    .filter((node) => node.riskLevel === 'high' && node.module !== 'external')
    .map((node) => ({ file: node.path, reason: 'alta centralidade no grafo' }));

  return dedupeByFile([...fromRisks, ...fromGraph]).slice(0, 12);
}

function findImportantDependencies(graph: LightweightGraph): Array<GraphNode & { degree: number }> {
  const degree = new Map<string, number>();
  for (const edge of graph.edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }

  return graph.nodes
    .filter((node) => node.module === 'external')
    .map((node) => ({ ...node, degree: degree.get(node.id) ?? 0 }))
    .sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label))
    .slice(0, 12);
}

function buildReadingOrder(summary: ProjectSummary): string[] {
  return dedupeStrings([
    ...summary.keyFiles,
    '.tic-code/inventory.md',
    '.tic-code/architecture.md',
    '.tic-code/risks.md',
    ...summary.graph.stats.centralFiles.map((file) => file.path),
    ...summary.risks.risks.slice(0, 8).map((risk) => risk.file)
  ]).slice(0, 18);
}

function dedupeByModule(items: Array<{ module: string; reason: string }>): Array<{ module: string; reason: string }> {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.module)) {
      return false;
    }
    seen.add(item.module);
    return true;
  });
}

function dedupeByFile(items: Array<{ file: string; reason: string }>): Array<{ file: string; reason: string }> {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.file)) {
      return false;
    }
    seen.add(item.file);
    return true;
  });
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
