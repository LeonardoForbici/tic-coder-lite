import type { ProjectSummary } from '../types';

export function generateConfidenceReportMd(summary: ProjectSummary): string {
  const confirmed = [
    `Nome do projeto: ${summary.workspaceName}`,
    `Caminho raiz: ${summary.rootPath}`,
    `Arquivos analisados: ${summary.totalFiles}`,
    `Linhas analisadas: ${summary.totalLines}`,
    `Nós do grafo: ${summary.graph.stats.nodeCount}`,
    `Arestas do grafo: ${summary.graph.stats.edgeCount}`,
    `Riscos encontrados: ${summary.risks.summary.total}`,
    ...summary.inventory.stack.filter((signal) => signal.detected).map((signal) => `${signal.name}: ${signal.evidence.join(', ') || 'sinal direto'}`)
  ];

  const inferred = [
    ...summary.inventory.modules.filter((module) => module.files.length > 0).map((module) => `${module.kind}: ${module.files.length} arquivo(s) por convenção de nome/caminho`),
    ...summary.graph.stats.centralFiles.slice(0, 10).map((file) => `${file.path}: central por grau no grafo ${file.degree}`),
    ...summary.graph.nodes.filter((node) => node.riskLevel).slice(0, 10).map((node) => `${node.path}: risco ${node.riskLevel} no grafo por quantidade de conexões`)
  ];

  const gaps = [
    'O comportamento em runtime não foi executado nem rastreado.',
    'Regras de negócio não foram validadas semanticamente por uma pessoa.',
    'O grafo de imports não prova todas as dependências em runtime ou chamadas por reflexão.',
    'Papéis e permissões de segurança exigem validação humana.',
    'Significado do schema de banco e segurança de migrations exigem validação humana.',
    'Cobertura de testes e uso em produção não foram medidos.'
  ];

  return `# Relatório de Confiança do TIC Coder Lite

Gerado em: ${new Date().toISOString()}
Projeto: ${summary.workspaceName}

## Escala de Confiança

CONFIRMADO: detectado diretamente no código
INFERIDO: inferido por nome/convenção
LACUNA: precisa validação humana

## Confirmado

${confirmed.map((item) => `- ${item}`).join('\n') || '- Nenhum fato confirmado disponível'}
- O TIC Coder Lite tem três modos: Modo Lite, IA Padrão e IA Local.
- O Modo Lite não exige IA, banco, Docker, servidor ou Ollama.

## Inferido

${inferred.map((item) => `- ${item}`).join('\n') || '- Nenhum fato inferido disponível'}

## Lacunas

${gaps.map((item) => `- ${item}`).join('\n')}

## Observações

- Fatos confirmados são extraídos de arquivos, manifests, imports, arestas do grafo e regras determinísticas de risco.
- Fatos inferidos ajudam na navegação, mas devem ser verificados no código antes de edições arquiteturais.
- Lacunas são prompts de validação para pessoas ou para uma revisão específica mais profunda do projeto.
`;
}
