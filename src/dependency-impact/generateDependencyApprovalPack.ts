/**
 * Gera o Dependency Approval Pack — documento empresarial para aprovação de mudança de runtime/dependência.
 */

import type {
  DependencyApprovalPack,
  DependencyImpactResult
} from './dependencyImpactTypes';

export function buildDependencyApprovalPack(result: DependencyImpactResult): DependencyApprovalPack {
  const { request, impactLevel, approvalRecommendation, affectedFiles, affectedDependencies, migrationSteps, requiredTests, breakingRisks, gaps } = result;

  const executiveSummary = buildExecutiveSummary(result);

  const approvalCriteria = [
    'Todos os testes obrigatórios executados e passando.',
    'Riscos críticos documentados e mitigados ou aceitos formalmente.',
    'Lacunas respondidas antes da aprovação.',
    'Plano de rollback claro e testado.',
    'Validação em ambiente de staging concluída.',
    'Build e deploy pipeline atualizados para nova versão.'
  ];

  const blockingCriteria = [
    'Dependências críticas incompatíveis sem solução definida.',
    'Build pipeline ainda usando versão antiga sem plano de atualização.',
    'Lacuna crítica não respondida.',
    'Testes falhando sem justificativa.',
    'Sem evidência de teste em staging.',
    'Rollback não definido para mudança de alto risco.'
  ];

  const rollbackPlan = buildRollbackPlan(result);

  return {
    id: result.id,
    createdAt: result.createdAt,
    request,
    impactLevel,
    approvalRecommendation,
    executiveSummary,
    risks: breakingRisks,
    criticalFiles: affectedFiles.filter((f) => f.confidence === 'CONFIRMED').map((f) => f.file).slice(0, 15),
    criticalDependencies: affectedDependencies,
    migrationPlan: migrationSteps,
    requiredTests,
    rollbackPlan,
    approvalCriteria,
    blockingCriteria,
    gaps,
    generatedFiles: result.generatedFiles
  };
}

function buildExecutiveSummary(result: DependencyImpactResult): string {
  const { request, impactLevel, approvalRecommendation, compatibilityFindings: findings, affectedFiles, affectedDependencies, breakingRisks } = result;
  const lines: string[] = [
    `Análise de impacto para mudança de **${request.fromName} ${request.fromVersion}** para **${request.toName} ${request.toVersion}** (${request.ecosystem}).`,
    '',
    `Impacto detectado: **${impactLevel}** (score: ${result.score}/100).`,
    `Recomendação: **${approvalRecommendation}**.`,
    ''
  ];

  if (breakingRisks.length > 0) {
    lines.push(`${breakingRisks.length} risco(s) crítico(s)/alto(s) identificado(s).`);
  }
  lines.push(`${findings.length} finding(s) de compatibilidade.`);
  lines.push(`${affectedFiles.length} arquivo(s) afetado(s).`);
  lines.push(`${affectedDependencies.length} dependência(s) crítica(s).`);

  return lines.join('\n');
}

function buildRollbackPlan(result: DependencyImpactResult): string[] {
  const { request } = result;
  return [
    `Reverter versão de ${request.toName} para ${request.fromVersion}`,
    'Reverter Dockerfile para imagem base anterior',
    'Reverter pipeline CI/CD para versão anterior',
    'Reverter lockfile para versão anterior (git checkout)',
    'Executar testes de smoke após rollback',
    'Validar logs de aplicação após rollback'
  ];
}

export function generateDependencyApprovalPackMd(pack: DependencyApprovalPack): string {
  const lines: string[] = [
    '# Dependency Change Approval Pack',
    '',
    `> Gerado em: ${pack.createdAt}`,
    '',
    '---',
    '',
    '## Resumo Executivo',
    '',
    pack.executiveSummary,
    '',
    '---',
    '',
    '## Mudança Solicitada',
    '',
    `- **Ecossistema**: ${pack.request.ecosystem}`,
    `- **De**: \`${pack.request.fromName} ${pack.request.fromVersion}\``,
    `- **Para**: \`${pack.request.toName} ${pack.request.toVersion}\``,
    `- **Tipo**: ${pack.request.changeType}`,
    '',
    '---',
    '',
    '## Impacto e Recomendação',
    '',
    `- **Impacto**: ${pack.impactLevel}`,
    `- **Decisão recomendada**: **${pack.approvalRecommendation}**`,
    ''
  ];

  if (pack.risks.length > 0) {
    lines.push('## Riscos');
    lines.push('');
    for (const r of pack.risks) {
      lines.push(`- ⚠️ ${r}`);
    }
    lines.push('');
  }

  if (pack.criticalFiles.length > 0) {
    lines.push('## Arquivos Críticos');
    lines.push('');
    for (const f of pack.criticalFiles) {
      lines.push(`- \`${f}\``);
    }
    lines.push('');
  }

  if (pack.criticalDependencies.length > 0) {
    lines.push('## Dependências Críticas');
    lines.push('');
    for (const dep of pack.criticalDependencies) {
      lines.push(`- **${dep.name}** (${dep.currentVersion}): ${dep.issue} → ${dep.action}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Plano de Migração');
  lines.push('');
  lines.push(pack.migrationPlan.join('\n'));
  lines.push('');

  lines.push('## Testes Obrigatórios');
  lines.push('');
  for (const t of pack.requiredTests) {
    lines.push(`- [ ] ${t}`);
  }
  lines.push('');

  lines.push('## Plano de Rollback');
  lines.push('');
  if (typeof pack.rollbackPlan === 'string') {
    lines.push(pack.rollbackPlan);
  } else {
    for (const r of pack.rollbackPlan as string[]) {
      lines.push(`- [ ] ${r}`);
    }
  }
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('## Critérios para Aprovação');
  lines.push('');
  for (const c of pack.approvalCriteria) {
    lines.push(`- [ ] ${c}`);
  }
  lines.push('');

  lines.push('## Critérios para Bloqueio');
  lines.push('');
  for (const c of pack.blockingCriteria) {
    lines.push(`- ❌ ${c}`);
  }
  lines.push('');

  if (pack.gaps.length > 0) {
    lines.push('## Lacunas');
    lines.push('');
    for (const g of pack.gaps) {
      lines.push(`- ${g}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(`*Gerado pelo TIC Coder Lite — Dependency Change Impact*`);
  lines.push('');

  return lines.join('\n');
}
