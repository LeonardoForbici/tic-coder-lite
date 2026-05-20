import type { ChangeSafetyReport, DiffImpactResult, GitDiffSummary } from './changeFirewallTypes';

export function renderGhostPrSummaryMd(report: ChangeSafetyReport, diff: GitDiffSummary, impact: DiffImpactResult): string {
  return `# Ghost PR Summary

## Titulo sugerido

Change Firewall: revisar mudanca com risco ${report.riskLevel}

## Resumo

- Verdict: ${report.verdict}
- Risk: ${report.riskLevel}
- Score: ${report.score}
- Arquivos alterados: ${diff.changedFiles.length}

## Arquivos alterados

${diff.changedFiles.map((file) => `- ${file}`).join('\n') || '- N/A'}

## Impacto

- Modulos: ${impact.impactedModules.join(', ') || 'N/A'}
- Contratos: ${impact.impactedContracts.join(' | ') || 'N/A'}
- Regras: ${impact.impactedBusinessRules.join(' | ') || 'N/A'}
- Banco/PLSQL: ${impact.impactedDatabaseObjects.join(', ') || 'N/A'}

## Testes recomendados

${report.requiredTests.map((test) => `- [ ] ${test}`).join('\n') || '- [ ] Validar fluxo afetado'}

## Risco

${report.reasons.map((reason) => `- ${reason}`).join('\n') || '- N/A'}

## Rollback

Ver plano: ${report.rollbackPlanPath}

## Checklist

- [ ] Li contratos operacionais e regras impactadas.
- [ ] Validei Legacy Antibodies acionados.
- [ ] Executei ou documentei testes obrigatorios.
- [ ] Revisei plano de rollback.
- [ ] Respondi perguntas abertas antes do merge.
`;
}
