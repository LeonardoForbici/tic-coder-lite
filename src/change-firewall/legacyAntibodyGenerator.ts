import * as vscode from 'vscode';
import type { AntibodyCategory, ChangeRiskLevel, LegacyAntibody, LegacyImmuneContext } from './changeFirewallTypes';
import { changeFirewallUri, confidenceIcon, ensureChangeFirewallFolders, evidenceRef, relativeArtifact, uniq, writeJsonFile, writeTextFile } from './changeFirewallStore';
import { loadLegacyImmuneContext } from './legacyImmuneSystem';

export async function generateLegacyAntibodiesCommand(): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) {
    vscode.window.showWarningMessage('Abra uma pasta de workspace antes de gerar Legacy Antibodies.');
    return;
  }
  const antibodies = await generateLegacyAntibodies(root);
  vscode.window.showInformationMessage(`Legacy Antibodies gerados: ${antibodies.length}.`);
}

export async function generateLegacyAntibodies(root: vscode.WorkspaceFolder, context?: LegacyImmuneContext): Promise<LegacyAntibody[]> {
  await ensureChangeFirewallFolders(root);
  const immune = context ?? await loadLegacyImmuneContext(root);
  const createdAt = new Date().toISOString();
  const antibodies: LegacyAntibody[] = [
    ...fromPermissions(immune, createdAt),
    ...fromDatabase(immune, createdAt),
    ...fromRisks(immune, createdAt),
    ...fromScreenImpact(immune, createdAt),
    ...fromDesignSystem(immune, createdAt)
  ];

  const deduped = dedupeAntibodies(antibodies);
  const jsonUri = changeFirewallUri(root, 'antibodies', 'legacy-antibodies.json');
  const mdUri = changeFirewallUri(root, 'antibodies', 'legacy-antibodies.md');
  await writeJsonFile(jsonUri, deduped);
  await writeTextFile(mdUri, renderLegacyAntibodiesMd(deduped));
  void relativeArtifact(root, jsonUri);
  return deduped;
}

function fromPermissions(immune: LegacyImmuneContext, createdAt: string): LegacyAntibody[] {
  if (!immune.permissions.length && !hasAny(immune.criticalFiles, /auth|security|permission|role|user/i)) return [];
  const files = permissionFiles(immune);
  const refs = immune.permissions.slice(0, 8).map((text) => evidenceRef({
    source: 'reverse-engineering',
    filePath: '.tic-code/reverse-engineering/permissions.md',
    matchedText: text,
    confidence: 'CONFIRMED',
    reason: 'Permissao extraida de permissions.md.'
  }));
  if (!refs.length && !files.length) return [];
  return [makeAntibody({
    id: 'AB-PERMISSION-001',
    name: 'Fluxo de permissao protegido',
    category: 'permission',
    severity: 'CRITICAL',
    rule: 'Mudancas em autenticacao, perfil, usuario, role ou permissao exigem validacao contra permissions.md.',
    evidenceFiles: files,
    evidenceRefs: refs.length ? refs : files.map((file) => evidenceRef({ source: 'file', filePath: file, confidence: 'INFERRED', reason: 'Arquivo critico de permissao detectado por nome/caminho.' })),
    riskIfViolated: 'Usuario pode ganhar ou perder acesso indevidamente.',
    detectionSignals: ['auth', 'security', 'permission', 'role', 'profile', 'user', 'PreAuthorize', 'hasRole'],
    relatedModules: ['security', 'api'],
    validationSteps: ['Revisar permissions.md.', 'Validar perfis com e sem permissao.', 'Confirmar que contrato de acesso nao mudou.'],
    createdAt,
    confidence: immune.permissions.length ? 'CONFIRMED' : 'INFERRED'
  })];
}

function fromDatabase(immune: LegacyImmuneContext, createdAt: string): LegacyAntibody[] {
  const out: LegacyAntibody[] = [];
  if (immune.databaseObjects.length || hasAny(immune.criticalFiles, /sql|plsql|database|migration/i)) {
    const refs = immune.databaseObjects.slice(0, 20).map((objectName) => evidenceRef({
      source: 'database-analysis',
      filePath: '.tic-code/reverse-engineering/database-analysis.md',
      matchedText: objectName,
      confidence: 'CONFIRMED',
      reason: 'Objeto de banco extraido de artefato de analise.'
    }));
    const evidenceFiles = immune.criticalFiles.filter((file) => /sql|database|repository|dao|migration/i.test(file));
    if (!refs.length && !evidenceFiles.length) return out;
    out.push(makeAntibody({
      id: 'AB-DATABASE-001',
      name: 'Banco e SQL protegidos',
      category: 'database',
      severity: 'HIGH',
      rule: 'Mudancas em SQL, repository/DAO ou migrations exigem revisao de objetos de banco impactados.',
      evidenceFiles,
      evidenceRefs: refs.length ? refs : evidenceFiles.map((file) => evidenceRef({ source: 'risk', filePath: file, confidence: 'INFERRED', reason: 'Arquivo critico relacionado a banco detectado nos riscos/grafo.' })),
      riskIfViolated: 'Consulta ou escrita pode corromper dados, degradar performance ou quebrar relatorios.',
      detectionSignals: ['select', 'insert', 'update', 'delete', 'merge', 'repository', 'dao', 'migration'],
      relatedModules: ['database', 'repository'],
      relatedTables: immune.databaseObjects.slice(0, 40),
      validationSteps: ['Revisar SQL/DAO alterado.', 'Validar objeto/tabela impactado.', 'Confirmar plano de rollback de dados.'],
      createdAt,
      confidence: immune.databaseObjects.length ? 'CONFIRMED' : 'INFERRED'
    }));
  }
  if (hasAny([...immune.databaseObjects, ...immune.criticalFiles], /trigger|procedure|package|function|\.trg|\.pkb|\.pks/i)) {
    const refs = immune.databaseObjects.filter((item) => /trigger|procedure|package|function/i.test(item)).slice(0, 20).map((objectName) => evidenceRef({
      source: 'plsql-analysis',
      filePath: '.tic-code/reverse-engineering/plsql-analysis.md',
      matchedText: objectName,
      confidence: 'CONFIRMED',
      reason: 'Objeto PL/SQL detectado em analise real.'
    }));
    const evidenceFiles = immune.criticalFiles.filter((file) => /trigger|procedure|package|function|\.trg|\.pkb|\.pks/i.test(file));
    if (!refs.length && !evidenceFiles.length) return out;
    out.push(makeAntibody({
      id: 'AB-PLSQL-001',
      name: 'PLSQL transacional protegido',
      category: 'plsql',
      severity: 'CRITICAL',
      rule: 'Alteracoes em trigger, procedure, function ou package exigem teste de regressao e plano de rollback.',
      evidenceFiles,
      evidenceRefs: refs.length ? refs : evidenceFiles.map((file) => evidenceRef({ source: 'file', filePath: file, confidence: 'CONFIRMED', reason: 'Arquivo PL/SQL real detectado.' })),
      riskIfViolated: 'Regra critica pode estar no banco e afetar multiplos fluxos sem passar pela aplicacao.',
      detectionSignals: ['trigger', 'procedure', 'function', 'package', 'commit', 'rollback'],
      relatedModules: ['database'],
      relatedTables: immune.databaseObjects.slice(0, 40),
      validationSteps: ['Executar teste de regressao da rotina/trigger em ambiente apropriado.', 'Validar cenarios de erro e rollback.', 'Revisar dependencias de tabela/package.'],
      createdAt,
      confidence: 'CONFIRMED'
    }));
  }
  return out;
}

function fromRisks(immune: LegacyImmuneContext, createdAt: string): LegacyAntibody[] {
  return immune.riskAreas.slice(0, 12).map((risk, index) => {
    const severity: ChangeRiskLevel = risk.startsWith('CRITICAL') ? 'CRITICAL' : risk.startsWith('HIGH') ? 'HIGH' : 'MEDIUM';
    const fileMatch = /\(([^)]+)\)/.exec(risk);
    const file = fileMatch?.[1] ?? '';
    return makeAntibody({
      id: `AB-RISK-${String(index + 1).padStart(3, '0')}`,
      name: `Area de risco: ${risk.replace(/\([^)]*\)/g, '').slice(0, 80)}`,
      category: inferCategory(file, risk),
      severity,
      rule: 'Mudancas em arquivo/area com risco deterministico exigem revisao humana.',
      evidenceFiles: file ? [file] : [],
      evidenceRefs: [evidenceRef({ source: 'risk', filePath: file || undefined, matchedText: risk, confidence: 'CONFIRMED', reason: 'Risco extraido de risks.json/artefato de riscos.' })],
      riskIfViolated: 'Pode amplificar risco ja detectado pela engenharia reversa.',
      detectionSignals: signalsFromText(`${file} ${risk}`),
      relatedModules: [moduleFromPath(file)],
      validationSteps: ['Revisar risco original.', 'Mitigar ou justificar no Change Safety Report.', 'Adicionar evidencia de teste focado.'],
      createdAt,
      confidence: 'CONFIRMED'
    });
  });
}

function fromScreenImpact(immune: LegacyImmuneContext, createdAt: string): LegacyAntibody[] {
  if (!immune.screenFiles.length && !immune.filesToEdit.length) return [];
  const files = uniq([...immune.screenFiles, ...immune.filesToEdit]).slice(0, 30);
  return [makeAntibody({
    id: 'AB-FRONTEND-SCREEN-001',
    name: 'Tela analisada por impacto protegida',
    category: 'frontend-screen',
    severity: 'MEDIUM',
    rule: 'Arquivos apontados pelo Impacto por Imagem/Tela devem ser editados junto com revisao dos arquivos relacionados.',
    evidenceFiles: files,
    evidenceRefs: files.map((file) => evidenceRef({ source: 'screen-impact', filePath: file, confidence: 'CONFIRMED', reason: 'Arquivo listado pelo Impacto por Imagem/Tela ou Files to Edit.' })),
    riskIfViolated: 'Mudanca visual pode quebrar fluxo, API chamada pela tela ou rastreabilidade de tela.',
    detectionSignals: ['component', 'screen', 'page', 'view', 'route', 'api'],
    relatedModules: ['frontend', 'api'],
    relatedScreens: immune.screenFiles.slice(0, 20),
    validationSteps: ['Validar tela afetada.', 'Revisar arquivos apontados pelo Files to Edit.', 'Confirmar APIs/backend associados quando existirem.'],
    createdAt,
    confidence: 'CONFIRMED'
  })];
}

function fromDesignSystem(immune: LegacyImmuneContext, createdAt: string): LegacyAntibody[] {
  const text = Object.entries(immune.rawDocuments)
    .filter(([path]) => path.includes('design-system'))
    .map(([, content]) => content)
    .join('\n');
  if (!text.trim()) return [];
  return [makeAntibody({
    id: 'AB-DESIGN-TOKEN-001',
    name: 'Token global de design protegido',
    category: 'design-system',
    severity: 'MEDIUM',
    rule: 'Alterar tokens globais de cor, tema ou componente compartilhado pode afetar multiplas telas.',
    evidenceFiles: ['.tic-code/reverse-engineering/design-system/tokens.md'],
    evidenceRefs: text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 12).map((line) => evidenceRef({ source: 'design-system', filePath: '.tic-code/reverse-engineering/design-system/tokens.md', matchedText: line, confidence: 'CONFIRMED', reason: 'Token/componente detectado em documento de Design System.' })),
    riskIfViolated: 'Mudanca visual global pode gerar regressao ampla.',
    detectionSignals: ['token', 'theme', 'color', 'spacing', 'component', 'design-system'],
    relatedModules: ['design-system', 'frontend'],
    validationSteps: ['Validar telas consumidoras do token.', 'Comparar tema claro/escuro.', 'Confirmar se a alteracao deve ser global.'],
    createdAt,
    confidence: 'CONFIRMED'
  })];
}

function makeAntibody(input: Partial<LegacyAntibody> & Pick<LegacyAntibody, 'id' | 'name' | 'category' | 'severity' | 'rule' | 'riskIfViolated' | 'detectionSignals' | 'createdAt'>): LegacyAntibody {
  return {
    evidenceFiles: [],
    evidenceRefs: [],
    validationSteps: [],
    relatedModules: [],
    relatedTables: [],
    relatedEndpoints: [],
    relatedScreens: [],
    confidence: 'INFERRED',
    ...input
  };
}

function renderLegacyAntibodiesMd(antibodies: LegacyAntibody[]): string {
  const lines = ['# Legacy Antibodies', '', `Gerado em: ${new Date().toISOString()}`, ''];
  if (!antibodies.length) {
    lines.push('- Nenhum antibody gerado. LACUNA: rode Analisar Workspace para criar evidencias.');
    return lines.join('\n');
  }
  for (const antibody of antibodies) {
    lines.push(`## ${antibody.id} - ${antibody.name}`);
    lines.push('');
    lines.push(`- Categoria: ${antibody.category}`);
    lines.push(`- Severidade: ${antibody.severity}`);
    lines.push(`- Confianca: ${confidenceIcon(antibody.confidence)}`);
    lines.push(`- Regra: ${antibody.rule}`);
    lines.push(`- Risco se violado: ${antibody.riskIfViolated}`);
    lines.push(`- Sinais: ${antibody.detectionSignals.join(', ') || 'N/A'}`);
    lines.push(`- Evidencias: ${antibody.evidenceFiles.join(', ') || antibody.evidenceRefs.map((ref) => `${ref.filePath ?? ref.source}: ${ref.matchedText ?? ref.reason}`).join(' | ') || 'N/A'}`);
    lines.push(`- Como validar: ${antibody.validationSteps.join(' | ') || 'N/A'}`);
    lines.push('');
  }
  return lines.join('\n');
}

function dedupeAntibodies(antibodies: LegacyAntibody[]): LegacyAntibody[] {
  const byId = new Map<string, LegacyAntibody>();
  for (const antibody of antibodies) {
    byId.set(antibody.id, antibody);
  }
  return [...byId.values()];
}

function permissionFiles(immune: LegacyImmuneContext): string[] {
  return immune.criticalFiles.filter((file) => /auth|security|permission|role|profile|user/i.test(file));
}

function hasAny(values: string[], pattern: RegExp): boolean {
  return values.some((value) => pattern.test(value));
}

function inferCategory(file: string, text: string): AntibodyCategory {
  const value = `${file} ${text}`.toLowerCase();
  if (/auth|security|permission|role/.test(value)) return 'security';
  if (/sql|database|repository|dao/.test(value)) return 'database';
  if (/plsql|trigger|procedure|package/.test(value)) return 'plsql';
  if (/controller|endpoint|api/.test(value)) return 'api-contract';
  return 'integration';
}

function signalsFromText(text: string): string[] {
  return uniq(text.split(/[^A-Za-z0-9_./-]+/).filter((part) => part.length >= 4).slice(0, 10));
}

function moduleFromPath(file: string): string {
  if (!file) return 'unknown';
  const lower = file.toLowerCase();
  if (/auth|security|permission/.test(lower)) return 'security';
  if (/sql|plsql|database|repository|dao/.test(lower)) return 'database';
  if (/controller|api|route/.test(lower)) return 'api';
  if (/component|screen|page|view/.test(lower)) return 'frontend';
  return file.split('/')[0] || 'root';
}
