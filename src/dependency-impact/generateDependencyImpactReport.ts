/**
 * Gera o relatório Markdown de Dependency Change Impact.
 */

import type {
  AffectedDependency,
  AffectedFile,
  CompatibilityFinding,
  DependencyBaseline,
  DependencyChangeRequest,
  DependencyImpactLevel,
  DependencyApprovalRecommendation,
  DepEvidenceRef
} from './dependencyImpactTypes';

export interface DependencyReportInput {
  request: DependencyChangeRequest;
  baselines: DependencyBaseline[];
  findings: CompatibilityFinding[];
  affectedFiles: AffectedFile[];
  affectedDependencies: AffectedDependency[];
  migrationSteps: string[];
  requiredTests: string[];
  breakingRisks: string[];
  impactLevel: DependencyImpactLevel;
  score: number;
  approvalRecommendation: DependencyApprovalRecommendation;
  gaps: string[];
}

export function generateDependencyImpactReportMd(input: DependencyReportInput): string {
  const {
    request, baselines, findings, affectedFiles, affectedDependencies,
    migrationSteps, requiredTests, breakingRisks, impactLevel, score,
    approvalRecommendation, gaps
  } = input;

  const lines: string[] = [
    '# Dependency Change Impact Report',
    '',
    `> Gerado em: ${new Date().toISOString()}`,
    '',
    '---',
    '',
    '## Mudança Solicitada',
    '',
    `- **Ecossistema**: ${request.ecosystem}`,
    `- **Tipo**: ${request.changeType}`,
    `- **De**: \`${request.fromName} ${request.fromVersion}\``,
    `- **Para**: \`${request.toName} ${request.toVersion}\``,
    `- **Descrição**: ${request.description || 'N/A'}`,
    '',
    '---',
    '',
    '## Veredito',
    '',
    `- **Impacto**: ${impactLevelBadge(impactLevel)}`,
    `- **Score**: ${score}/100`,
    `- **Recomendação**: ${recommendationBadge(approvalRecommendation)}`,
    ''
  ];

  if (breakingRisks.length > 0) {
    lines.push('### Riscos Críticos');
    lines.push('');
    for (const r of breakingRisks) {
      lines.push(`- ⚠️ ${r}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Baseline Detectado');
  lines.push('');

  if (baselines.length === 0) {
    lines.push('> 🔴 LACUNA: Nenhuma baseline detectada. Rode Analisar Workspace primeiro.');
    lines.push('');
  } else {
    for (const b of baselines) {
      lines.push(`### ${b.projectId}`);
      lines.push(`- **Linguagem**: ${b.language}`);
      lines.push(`- **Runtime**: \`${b.runtimeVersion}\` (${confidenceIcon(b.runtimeVersionConfidence)})`);
      if (Object.keys(b.frameworkVersions).length > 0) {
        lines.push('- **Frameworks**:');
        for (const [k, v] of Object.entries(b.frameworkVersions)) {
          lines.push(`  - ${k}: \`${v}\``);
        }
      }
      if (b.buildTools.length > 0) lines.push(`- **Build tools**: ${b.buildTools.join(', ')}`);
      if (b.infraRuntime.dockerBaseImages.length > 0) {
        lines.push('- **Docker**:');
        for (const img of b.infraRuntime.dockerBaseImages) lines.push(`  - \`${img}\``);
      }
      if (b.infraRuntime.ciJavaVersion) lines.push(`- **CI Java**: \`${b.infraRuntime.ciJavaVersion}\``);
      if (b.infraRuntime.ciNodeVersion) lines.push(`- **CI Node**: \`${b.infraRuntime.ciNodeVersion}\``);
      if (b.infraRuntime.ciPythonVersion) lines.push(`- **CI Python**: \`${b.infraRuntime.ciPythonVersion}\``);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('## Findings de Compatibilidade');
  lines.push('');

  if (findings.length === 0) {
    lines.push('> Nenhum finding detectado com as informações disponíveis.');
  } else {
    const bySeverity = groupFindingsBySeverity(findings);
    for (const severity of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as DependencyImpactLevel[]) {
      const group = bySeverity[severity] ?? [];
      if (group.length === 0) continue;
      lines.push(`### ${impactLevelBadge(severity)}`);
      lines.push('');
      for (const f of group) {
        lines.push(`#### ${f.title}`);
        lines.push(`> ${confidenceIcon(f.confidence)} ${f.confidence} · Categoria: ${f.category}`);
        lines.push('');
        lines.push(f.description);
        lines.push('');
        lines.push(`**Ação recomendada**: ${f.recommendedAction}`);
        if (f.evidenceRefs.length > 0) {
          lines.push('');
          lines.push('**Evidências**:');
          for (const r of f.evidenceRefs.slice(0, 3)) {
            lines.push(`- \`${r.filePath}\`${r.line ? `:${r.line}` : ''} — ${r.matchedText ?? ''}`);
          }
        }
        lines.push('');
      }
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('## Arquivos Afetados');
  lines.push('');

  if (affectedFiles.length === 0) {
    lines.push('> Nenhum arquivo afetado detectado.');
  } else {
    lines.push(`> ${affectedFiles.length} arquivo(s) identificado(s)`);
    lines.push('');
    lines.push('| Arquivo | Motivo | Confiança | Ação |');
    lines.push('|---------|--------|-----------|------|');
    for (const f of affectedFiles.slice(0, 30)) {
      lines.push(`| \`${f.file}\` | ${f.reason.slice(0, 60)} | ${confidenceIcon(f.confidence)} | ${f.recommendedAction.slice(0, 60)} |`);
    }
  }
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('## Dependências Críticas');
  lines.push('');

  if (affectedDependencies.length === 0) {
    lines.push('> Nenhuma dependência crítica identificada com as informações disponíveis.');
  } else {
    for (const dep of affectedDependencies) {
      lines.push(`- **${dep.name}** (\`${dep.currentVersion}\`) — ${impactLevelBadge(dep.severity)} ${confidenceIcon(dep.confidence)}`);
      lines.push(`  - Problema: ${dep.issue}`);
      lines.push(`  - Ação: ${dep.action}`);
    }
  }
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('## Testes Obrigatórios');
  lines.push('');

  if (requiredTests.length === 0) {
    lines.push('> 🔴 LACUNA: Nenhum teste identificado.');
  } else {
    for (const t of requiredTests) {
      lines.push(`- [ ] ${t}`);
    }
  }
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('## Plano de Migração');
  lines.push('');
  lines.push(migrationSteps.join('\n'));
  lines.push('');

  if (gaps.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Lacunas');
    lines.push('');
    for (const g of gaps) {
      lines.push(`- ${g}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Evidências');
  lines.push('');
  const allRefs = collectAllRefs(findings, affectedFiles, affectedDependencies);
  if (allRefs.length === 0) {
    lines.push('> Nenhuma evidência coletada.');
  } else {
    for (const ref of allRefs.slice(0, 20)) {
      lines.push(`- ${confidenceIcon(ref.confidence)} \`${ref.filePath}\`${ref.line ? `:${ref.line}` : ''} — ${ref.matchedText ?? ''} — ${ref.reason}`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

export function generateMigrationPlanMd(input: DependencyReportInput): string {
  return [
    `# Plano de Migração: ${input.request.fromName} ${input.request.fromVersion} → ${input.request.toVersion}`,
    '',
    `> Gerado em: ${new Date().toISOString()}`,
    `> Impacto detectado: ${impactLevelBadge(input.impactLevel)}`,
    '',
    ...input.migrationSteps,
    '',
    '## Testes Obrigatórios',
    '',
    ...(input.requiredTests.length > 0 ? input.requiredTests.map((t) => `- [ ] ${t}`) : ['> Nenhum teste identificado.']),
    ''
  ].join('\n');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function impactLevelBadge(level: DependencyImpactLevel): string {
  const map: Record<DependencyImpactLevel, string> = {
    LOW: '🟢 LOW',
    MEDIUM: '🟡 MEDIUM',
    HIGH: '🟠 HIGH',
    CRITICAL: '🔴 CRITICAL'
  };
  return map[level] ?? level;
}

function recommendationBadge(rec: DependencyApprovalRecommendation): string {
  const map: Record<DependencyApprovalRecommendation, string> = {
    APPROVE: '✅ APPROVE',
    REVIEW: '⚠️ REVIEW',
    BLOCK: '🚫 BLOCK'
  };
  return map[rec] ?? rec;
}

function confidenceIcon(c: string): string {
  if (c === 'CONFIRMED') return '🟢';
  if (c === 'INFERRED') return '🟡';
  return '🔴';
}

function groupFindingsBySeverity(findings: CompatibilityFinding[]): Partial<Record<DependencyImpactLevel, CompatibilityFinding[]>> {
  const result: Partial<Record<DependencyImpactLevel, CompatibilityFinding[]>> = {};
  for (const f of findings) {
    if (!result[f.severity]) result[f.severity] = [];
    result[f.severity]!.push(f);
  }
  return result;
}

function collectAllRefs(
  findings: CompatibilityFinding[],
  files: AffectedFile[],
  deps: AffectedDependency[]
): DepEvidenceRef[] {
  return [
    ...findings.flatMap((f) => f.evidenceRefs),
    ...files.flatMap((f) => f.evidenceRefs),
    ...deps.flatMap((d) => d.evidenceRefs)
  ];
}
