import * as path from 'path';
import * as vscode from 'vscode';
import { Confidence, ImageIndexEntry, ScreenFingerprint, ScreenImpactInput, VisualIndex } from './impactTypes';

// ─── Paths ──────────────────────────────────────────────────────────────────

function getVisualIndexDir(root: vscode.WorkspaceFolder): vscode.Uri {
  return vscode.Uri.joinPath(root.uri, '.tic-code', 'visual-index');
}

function getVisualIndexScreenshotDir(root: vscode.WorkspaceFolder, screenId: string): vscode.Uri {
  return vscode.Uri.joinPath(root.uri, '.tic-code', 'visual-index', 'screenshots', screenId);
}

// ─── Build entry from screen input + fingerprint ─────────────────────────────

export function buildImageIndexEntry(
  root: vscode.WorkspaceFolder,
  input: ScreenImpactInput,
  fingerprint: ScreenFingerprint,
  relatedArtifacts?: Array<{ path: string; type: string }>,
  relatedFiles?: Array<{ file: string; reason: string; confidence: Confidence }>
): ImageIndexEntry {
  const screenshotPath = input.screenshotPath;
  const relativeScreenshotPath = screenshotPath
    ? path.relative(root.uri.fsPath, screenshotPath).replace(/\\/g, '/')
    : undefined;

  const base = `.tic-code/impact/screens/${input.id}`;

  const localVision = input.localVision;

  return {
    id: input.id,
    type: 'screenshot',
    source: 'impact-by-image',
    screenshotPath,
    screenshotFileName: input.screenshotFileName,
    relativeScreenshotPath,
    extension: fingerprint.screenshotMetadata.extension,
    sizeBytes: fingerprint.screenshotMetadata.sizeBytes,
    width: fingerprint.screenshotMetadata.width,
    height: fingerprint.screenshotMetadata.height,
    createdAt: input.createdAt,
    url: input.url,
    normalizedRoute: input.normalizedRoute,
    changeDescription: input.changeDescription,
    userHints: input.userHints,
    fingerprintPath: `${base}/screen-fingerprint.json`,
    screenInputPath: `${base}/screen-input.json`,
    impactReportPath: `${base}/impact-by-screen.md`,
    filesToEditPath: `${base}/files-to-edit.md`,
    aiChangePackagePath: `${base}/ai-change-package.md`,
    safePromptPath: `${base}/safe-implementation-prompt.md`,
    relatedFiles: relatedFiles ?? [],
    relatedArtifacts: relatedArtifacts ?? [
      { path: `${base}/screen-input.json`, type: 'screen-input' },
      { path: `${base}/screen-fingerprint.json`, type: 'screen-fingerprint' },
      { path: `${base}/impact-by-screen.md`, type: 'impact-report' },
      { path: `${base}/files-to-edit.md`, type: 'files-to-edit' },
      { path: `${base}/ai-change-package.md`, type: 'ai-change-package' }
    ],
    localVision: {
      enabled: localVision?.enabled ?? false,
      attempted: localVision?.attempted ?? false,
      model: localVision?.model,
      confidence: localVision?.confidence,
      visibleText: localVision?.visibleText ?? [],
      uiElements: localVision?.uiElements ?? [],
      actions: localVision?.actions ?? [],
      warnings: localVision?.warnings ?? []
    },
    paidAi: {
      attachable: true,
      instruction:
        'Anexe esta imagem junto com latest-ai-change-package.md se sua IA paga suportar visão.'
    },
    confidence: resolveConfidence(input, fingerprint),
    gaps: buildGaps(input, fingerprint)
  };
}

// ─── Write per-screen image-index.json + README.md ───────────────────────────

export async function writeImageIndexEntry(
  root: vscode.WorkspaceFolder,
  entry: ImageIndexEntry
): Promise<void> {
  const dir = getVisualIndexScreenshotDir(root, entry.id);
  await vscode.workspace.fs.createDirectory(dir);

  const indexUri = vscode.Uri.joinPath(dir, 'image-index.json');
  await vscode.workspace.fs.writeFile(indexUri, Buffer.from(JSON.stringify(entry, null, 2), 'utf8'));

  const readmeUri = vscode.Uri.joinPath(dir, 'README.md');
  await vscode.workspace.fs.writeFile(readmeUri, Buffer.from(buildImageReadme(entry), 'utf8'));
}

// ─── Read / write global images.json ─────────────────────────────────────────

async function readVisualIndex(root: vscode.WorkspaceFolder): Promise<VisualIndex> {
  const uri = vscode.Uri.joinPath(getVisualIndexDir(root), 'images.json');
  try {
    const raw = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
    return JSON.parse(raw) as VisualIndex;
  } catch {
    return {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      images: [],
      totalImages: 0,
      totalWithLocalVision: 0,
      totalReadyForPaidAiAttachment: 0
    };
  }
}

export async function updateVisualIndex(
  root: vscode.WorkspaceFolder,
  entry: ImageIndexEntry
): Promise<VisualIndex> {
  const dir = getVisualIndexDir(root);
  await vscode.workspace.fs.createDirectory(dir);

  const current = await readVisualIndex(root);
  const idx = current.images.findIndex((img) => img.id === entry.id);
  if (idx >= 0) {
    current.images[idx] = entry;
  } else {
    current.images.push(entry);
  }

  const updated: VisualIndex = {
    version: current.version,
    generatedAt: new Date().toISOString(),
    images: current.images,
    latestImageId: entry.id,
    totalImages: current.images.length,
    totalWithLocalVision: current.images.filter((img) => img.localVision.attempted).length,
    totalReadyForPaidAiAttachment: current.images.filter((img) => img.screenshotPath).length
  };

  const uri = vscode.Uri.joinPath(dir, 'images.json');
  await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(updated, null, 2), 'utf8'));

  const mdUri = vscode.Uri.joinPath(dir, 'images.md');
  await vscode.workspace.fs.writeFile(mdUri, Buffer.from(buildVisualIndexMd(updated), 'utf8'));

  return updated;
}

// ─── latest-image-index.json / .md ──────────────────────────────────────────

export async function writeLatestImageIndex(
  root: vscode.WorkspaceFolder,
  entry: ImageIndexEntry
): Promise<void> {
  const dir = getVisualIndexDir(root);
  await vscode.workspace.fs.createDirectory(dir);

  const uri = vscode.Uri.joinPath(dir, 'latest-image-index.json');
  await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(entry, null, 2), 'utf8'));

  const mdUri = vscode.Uri.joinPath(dir, 'latest-image-index.md');
  await vscode.workspace.fs.writeFile(mdUri, Buffer.from(buildImageReadme(entry), 'utf8'));
}

// ─── Read latest entry ───────────────────────────────────────────────────────

export async function readLatestImageIndexEntry(
  root: vscode.WorkspaceFolder
): Promise<ImageIndexEntry | undefined> {
  try {
    const uri = vscode.Uri.joinPath(getVisualIndexDir(root), 'latest-image-index.json');
    const raw = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
    return JSON.parse(raw) as ImageIndexEntry;
  } catch {
    return undefined;
  }
}

// ─── Visor integration ──────────────────────────────────────────────────────

export async function updateVisorIntegration(
  root: vscode.WorkspaceFolder,
  entry: ImageIndexEntry
): Promise<void> {
  const uiDir = vscode.Uri.joinPath(root.uri, '.tic-code', 'reverse-engineering', 'ui');
  await vscode.workspace.fs.createDirectory(uiDir);

  // screenshots-index.md
  const screenshotsIndexUri = vscode.Uri.joinPath(uiDir, 'screenshots-index.md');
  let screenshotsIndex = '';
  try {
    screenshotsIndex = Buffer.from(await vscode.workspace.fs.readFile(screenshotsIndexUri)).toString('utf8');
  } catch {
    screenshotsIndex = '# Índice de Screenshots — Visor\n\n';
  }
  const screenshotLine = `- [${entry.id}] ${entry.screenshotFileName ?? 'N/A'} | ${entry.url ?? 'N/A'} | ${entry.changeDescription ?? ''} | ${entry.createdAt}`;
  if (!screenshotsIndex.includes(entry.id)) {
    screenshotsIndex += `\n${screenshotLine}`;
    await vscode.workspace.fs.writeFile(screenshotsIndexUri, Buffer.from(screenshotsIndex, 'utf8'));
  }

  // ui-analysis.md
  const uiAnalysisUri = vscode.Uri.joinPath(uiDir, 'ui-analysis.md');
  let uiAnalysis = '';
  try {
    uiAnalysis = Buffer.from(await vscode.workspace.fs.readFile(uiAnalysisUri)).toString('utf8');
  } catch {
    uiAnalysis = '# Análise de UI — Visor\n\n';
  }
  if (!uiAnalysis.includes(entry.id)) {
    const section = buildUiAnalysisSection(entry);
    uiAnalysis += `\n${section}`;
    await vscode.workspace.fs.writeFile(uiAnalysisUri, Buffer.from(uiAnalysis, 'utf8'));
  }

  // state.json
  const stateUri = vscode.Uri.joinPath(root.uri, '.tic-code', 'reversa', 'state.json');
  try {
    const raw = Buffer.from(await vscode.workspace.fs.readFile(stateUri)).toString('utf8');
    const state = JSON.parse(raw) as Record<string, unknown>;
    const visor = (state['Visor'] ?? {}) as Record<string, unknown>;
    const receivedInputs = (visor['receivedInputs'] as string[] | undefined) ?? [];
    const generatedFiles = (visor['generatedFiles'] as string[] | undefined) ?? [];
    if (!receivedInputs.includes(entry.screenshotPath ?? entry.id)) {
      receivedInputs.push(entry.screenshotPath ?? entry.id);
    }
    const imageIndexPath = `.tic-code/visual-index/screenshots/${entry.id}/image-index.json`;
    if (!generatedFiles.includes(imageIndexPath)) {
      generatedFiles.push(imageIndexPath);
    }
    if (!generatedFiles.includes('.tic-code/reverse-engineering/ui/ui-analysis.md')) {
      generatedFiles.push('.tic-code/reverse-engineering/ui/ui-analysis.md');
    }
    visor['receivedInputs'] = receivedInputs;
    visor['generatedFiles'] = generatedFiles;
    visor['status'] = 'completed';
    state['Visor'] = visor;
    await vscode.workspace.fs.writeFile(stateUri, Buffer.from(JSON.stringify(state, null, 2), 'utf8'));
  } catch {
    // state.json não existe — sem Reversa rodado ainda, ignorar silenciosamente
  }
}

// ─── Markdown builders ───────────────────────────────────────────────────────

function buildImageReadme(entry: ImageIndexEntry): string {
  const lv = entry.localVision;
  const visionStatus = lv.attempted
    ? `Executado (modelo: ${lv.model ?? 'N/A'})`
    : lv.enabled
    ? 'Habilitado mas não executado'
    : 'Desativado';

  return `# Evidência Visual — ${entry.id}

## Imagem

- **Arquivo:** ${entry.screenshotFileName ?? 'N/A'}
- **Caminho relativo:** ${entry.relativeScreenshotPath ?? 'N/A'}
- **Extensão:** ${entry.extension ?? 'N/A'}
- **Tamanho:** ${entry.sizeBytes != null ? `${entry.sizeBytes} bytes` : 'N/A'}
- **Dimensões:** ${entry.width && entry.height ? `${entry.width}x${entry.height}` : 'N/A'}
- **Criado em:** ${entry.createdAt}

## Contexto

- **URL:** ${entry.url ?? 'N/A'}
- **Rota normalizada:** ${entry.normalizedRoute ?? 'N/A'}
- **Mudança solicitada:** ${entry.changeDescription ?? 'N/A'}
- **Nome da tela:** ${entry.userHints?.screenName ?? 'N/A'}

## Visão Local

- **Status:** ${visionStatus}
- **Textos visíveis:** ${lv.visibleText.join(', ') || 'N/A'}
- **Elementos UI:** ${lv.uiElements.join(', ') || 'N/A'}
- **Ações:** ${lv.actions.join(', ') || 'N/A'}
- **Avisos:** ${lv.warnings.join(', ') || 'N/A'}

## IA Paga com Visão

${entry.paidAi.instruction}

**Caminho da imagem para anexar:** \`${entry.relativeScreenshotPath ?? entry.screenshotPath ?? 'N/A'}\`

## Artefatos relacionados

${entry.relatedArtifacts.map((a) => `- \`${a.path}\` (${a.type})`).join('\n') || '- Nenhum'}

## Confiança

- **Nível:** ${entry.confidence}
- **Lacunas:** ${entry.gaps.join(', ') || 'Nenhuma'}
`;
}

function buildVisualIndexMd(index: VisualIndex): string {
  const rows = index.images
    .map(
      (img) =>
        `| ${img.id} | ${img.screenshotFileName ?? 'N/A'} | ${img.url ?? 'N/A'} | ${img.changeDescription ?? 'N/A'} | ${img.localVision.attempted ? `Sim (${img.localVision.model ?? 'N/A'})` : 'Não'} | ${img.impactReportPath ?? 'N/A'} | ${img.aiChangePackagePath ?? 'N/A'} | ${img.confidence} |`
    )
    .join('\n');

  return `# Índice de Evidências Visuais

## Resumo

- **Total de imagens:** ${index.totalImages}
- **Com visão local executada:** ${index.totalWithLocalVision}
- **Prontas para anexar em IA paga:** ${index.totalReadyForPaidAiAttachment}
- **Gerado em:** ${index.generatedAt}

## Imagens

| ID | Screenshot | URL | Mudança | Status visão local | Relatório de impacto | Pacote IA | Confiança |
|---|---|---|---|---|---|---|---|
${rows || '| — | — | — | — | — | — | — | — |'}
`;
}

function buildUiAnalysisSection(entry: ImageIndexEntry): string {
  const lv = entry.localVision;
  return `## Tela: ${entry.userHints?.screenName ?? entry.id}

- **ID:** ${entry.id}
- **URL:** ${entry.url ?? 'N/A'}
- **Screenshot:** ${entry.relativeScreenshotPath ?? entry.screenshotFileName ?? 'N/A'}
- **Mudança solicitada:** ${entry.changeDescription ?? 'N/A'}
- **Textos visíveis (vision local):** ${lv.visibleText.join(', ') || 'N/A (visão não executada)'}
- **Elementos UI:** ${lv.uiElements.join(', ') || 'N/A'}
- **Ações detectadas:** ${lv.actions.join(', ') || 'N/A'}
- **Confiança:** ${entry.confidence}
`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveConfidence(input: ScreenImpactInput, fingerprint: ScreenFingerprint): Confidence {
  if (!input.screenshotPath) return 'GAP';
  if (input.localVision?.attempted) return 'CONFIRMED';
  if (fingerprint.screenshotMetadata.recognitionScore !== undefined && fingerprint.screenshotMetadata.recognitionScore > 0.5) return 'INFERRED';
  return 'INFERRED';
}

function buildGaps(input: ScreenImpactInput, fingerprint: ScreenFingerprint): string[] {
  const gaps: string[] = [];
  if (!input.screenshotPath) gaps.push('GAP: screenshot não importado.');
  if (!input.url) gaps.push('GAP: URL da tela não informada.');
  if (!input.localVision?.attempted) gaps.push('GAP: visão local não executada; reconhecimento real da imagem ausente.');
  if (!fingerprint.candidateKeywords.length) gaps.push('GAP: sem termos candidatos suficientes.');
  return gaps;
}
