import type { ChangeSafetyReport, DiffImpactResult, GitDiffSummary } from './changeFirewallTypes';

export function renderAiReviewPromptMd(report: ChangeSafetyReport, diff: GitDiffSummary, impact: DiffImpactResult): string {
  return `# AI Review Prompt - AI Change Firewall

Voce esta revisando uma mudanca em sistema legado. Nao assuma fatos sem evidencia. Trate inferencias como inferencias e marque lacunas explicitamente.

## Veredito local

- Verdict: ${report.verdict}
- Risk: ${report.riskLevel}
- Score: ${report.score}

## Resumo do diff

- Arquivos alterados: ${diff.changedFiles.join(', ') || 'N/A'}
- Arquivos adicionados: ${diff.addedFiles.join(', ') || 'N/A'}
- Arquivos removidos: ${diff.deletedFiles.join(', ') || 'N/A'}
- Simbolos tocados: ${diff.symbolsTouched.join(' | ') || 'N/A'}

## Impacto

- Modulos: ${impact.impactedModules.join(', ') || 'N/A'}
- Contratos: ${impact.impactedContracts.join(' | ') || 'N/A'}
- Regras: ${impact.impactedBusinessRules.join(' | ') || 'N/A'}
- Banco/PLSQL: ${impact.impactedDatabaseObjects.join(', ') || 'N/A'}
- Permissoes: ${impact.impactedPermissions.join(' | ') || 'N/A'}

## Antibodies acionados

${report.triggeredAntibodies.map((item) => `- ${item.severity} ${item.name}: ${item.reason}`).join('\n') || '- Nenhum'}

## Riscos

${report.reasons.map((reason) => `- ${reason}`).join('\n') || '- N/A'}

## Testes obrigatorios

${report.requiredTests.map((test) => `- ${test}`).join('\n') || '- N/A'}

## Perguntas antes de aceitar

${report.questions.map((question) => `- ${question}`).join('\n') || '- N/A'}

Instrucao de revisao: aponte riscos concretos, contratos quebrados, testes ausentes e qualquer violacao de regra evidenciada. Nao envie nem busque codigo fora do workspace.
`;
}
