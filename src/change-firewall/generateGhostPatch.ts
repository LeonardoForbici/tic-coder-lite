import * as vscode from 'vscode';
import type { ChangeFirewallSession, ChangeRequest, GhostPatchItem, GhostPatchResult, LegacyAntibody } from './changeFirewallTypes';
import { changeFirewallUri, confidenceIcon, ensureChangeFirewallFolders, evidenceRef, fileExists, readText, relativeArtifact, sessionUri, uniq, writeJsonFile, writeTextFile } from './changeFirewallStore';

interface GhostPatchInput {
  request: ChangeRequest;
  candidateFiles: string[];
  signals: string[];
  antibodies: LegacyAntibody[];
}

export async function generateGhostPatch(
  root: vscode.WorkspaceFolder,
  session: ChangeFirewallSession,
  input: GhostPatchInput
): Promise<GhostPatchResult> {
  await ensureChangeFirewallFolders(root, session);
  const items: GhostPatchItem[] = [];
  const gaps: string[] = [];
  const signals = uniq(input.signals.flatMap(splitSignals)).filter((signal) => signal.length >= 3).slice(0, 40);

  for (const file of uniq(input.candidateFiles).slice(0, 25)) {
    const exists = await fileExists(root, file);
    if (!exists) {
      const item: GhostPatchItem = {
        file,
        realFileExists: false,
        matchedLines: [],
        evidence: [evidenceRef({ source: 'screen-impact', filePath: file, confidence: 'GAP', reason: 'Arquivo candidato nao existe no workspace.' })],
        confidence: 'GAP',
        recommendation: '🔴 LACUNA: confirmar arquivo real antes de propor patch.',
        risks: ['Arquivo candidato ausente.'],
        relatedAntibodies: relatedAntibodies(file, input.antibodies)
      };
      items.push(item);
      gaps.push(`${file}: arquivo candidato nao existe.`);
      continue;
    }

    const content = await readText(root, file);
    const matches = findRealMatches(content, signals);
    if (!matches.length) {
      items.push({
        file,
        realFileExists: true,
        matchedLines: [],
        evidence: [evidenceRef({ source: 'file', filePath: file, confidence: 'GAP', reason: 'Arquivo existe, mas nenhum trecho real relacionado aos sinais foi localizado.' })],
        confidence: 'GAP',
        recommendation: '🔴 LACUNA: nenhum trecho exato encontrado; revisar manualmente antes de editar.',
        risks: ['Patch orientativo nao gerado para evitar diff falso.'],
        relatedAntibodies: relatedAntibodies(file, input.antibodies)
      });
      gaps.push(`${file}: nenhum trecho real relacionado encontrado.`);
      continue;
    }

    items.push({
      file,
      realFileExists: true,
      matchedLines: matches,
      evidence: matches.map((match) => evidenceRef({ source: 'file', filePath: file, line: match.line, matchedText: match.text, confidence: 'CONFIRMED', reason: 'Trecho real localizado no arquivo.' })),
      confidence: 'CONFIRMED',
      pseudoDiff: buildPseudoDiff(matches[0].text),
      risks: ['Pseudo-diff orientativo: revisar manualmente; nenhuma alteracao foi aplicada.'],
      relatedAntibodies: relatedAntibodies(file, input.antibodies)
    });
  }

  if (!items.length) {
    gaps.push('Nenhum arquivo candidato real disponivel para Ghost Patch.');
  }

  const result: GhostPatchResult = {
    id: session.id,
    createdAt: new Date().toISOString(),
    request: input.request,
    items,
    gaps,
    generatedFiles: [
      '.tic-code/change-firewall/latest-ghost-patch.md',
      '.tic-code/change-firewall/latest-ghost-patch.json',
      `${session.sessionDir}/ghost-patch.md`,
      `${session.sessionDir}/ghost-patch.json`
    ]
  };

  await writeJsonFile(changeFirewallUri(root, 'latest-ghost-patch.json'), result);
  await writeTextFile(changeFirewallUri(root, 'latest-ghost-patch.md'), renderGhostPatchMd(result));
  await writeJsonFile(sessionUri(root, session, 'ghost-patch.json'), result);
  await writeTextFile(sessionUri(root, session, 'ghost-patch.md'), renderGhostPatchMd(result));
  void relativeArtifact(root, changeFirewallUri(root, 'latest-ghost-patch.md'));
  return result;
}

function findRealMatches(content: string, signals: string[]): Array<{ line: number; text: string }> {
  const lines = content.split(/\r?\n/);
  const matches: Array<{ line: number; text: string }> = [];
  lines.forEach((text, index) => {
    const lower = text.toLowerCase();
    if (signals.some((signal) => lower.includes(signal.toLowerCase()))) {
      matches.push({ line: index + 1, text: text.trim() });
    }
  });
  return matches.slice(0, 8);
}

function buildPseudoDiff(realLine: string): string {
  return `\`\`\`diff
- ${realLine}
+ ${realLine}
\`\`\``;
}

function splitSignals(value: string): string[] {
  return value.split(/[^A-Za-z0-9_./:-]+/).map((part) => part.trim()).filter((part) => part.length >= 3);
}

function relatedAntibodies(file: string, antibodies: LegacyAntibody[]): string[] {
  return antibodies
    .filter((item) => item.evidenceFiles.some((evidence) => file.toLowerCase().includes(evidence.toLowerCase()) || evidence.toLowerCase().includes(file.toLowerCase())))
    .map((item) => item.id);
}

function renderGhostPatchMd(result: GhostPatchResult): string {
  const lines = ['# Ghost Patch', '', `Gerado em: ${result.createdAt}`, '', '> Orientativo apenas. Nenhum arquivo do usuario foi alterado.', ''];
  if (result.gaps.length) {
    lines.push('## Lacunas');
    lines.push(...result.gaps.map((gap) => `- 🔴 ${gap}`));
    lines.push('');
  }
  for (const item of result.items) {
    lines.push(`## ${item.file}`);
    lines.push('');
    lines.push(`- Arquivo real existe: ${item.realFileExists ? 'sim' : 'nao'}`);
    lines.push(`- Confianca: ${confidenceIcon(item.confidence)}`);
    lines.push(`- Antibodies relacionados: ${item.relatedAntibodies.join(', ') || 'N/A'}`);
    lines.push(`- Evidencia: ${item.evidence.map((ref) => `${ref.filePath ?? ref.source}${ref.line ? `:${ref.line}` : ''} - ${ref.reason}`).join(' | ') || 'N/A'}`);
    if (item.matchedLines.length) {
      lines.push('- Linhas reais encontradas:');
      lines.push(...item.matchedLines.map((line) => `  - ${line.line}: \`${line.text.replace(/`/g, "'")}\``));
    }
    if (item.pseudoDiff) {
      lines.push('');
      lines.push(item.pseudoDiff);
    } else {
      lines.push(`- Recomendacao: ${item.recommendation ?? 'N/A'}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
