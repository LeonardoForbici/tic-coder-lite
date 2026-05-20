/**
 * Analisa código fonte do workspace para detectar sinais de risco de migração.
 * Detecta padrões específicos em Java, Node/React, Python sem executar o código.
 */

import * as vscode from 'vscode';
import type { ScanResult } from '../scanner/scanWorkspace';
import type { DependencyEcosystem } from './dependencyImpactTypes';
import type { SourceCodeSignal } from './dependencyCompatibilityRules';

// Padrões por ecossistema
const JAVA_PATTERNS: RegExp[] = [
  /import\s+javax\.xml\.bind/,
  /import\s+javax\.annotation/,
  /import\s+javax\.ws\.rs/,
  /import\s+sun\.misc/,
  /import\s+com\.sun\./,
  /setAccessible\(true\)/,
  /getDeclaredField|getDeclaredMethod/,
  /SecurityManager|setSecurityManager/,
  /JAXBContext\.newInstance/,
  /new\s+java\.util\.Date\(\)|Calendar\.getInstance\(\)/,
  /sourceCompatibility\s*=.*1\.8|targetCompatibility\s*=.*1\.8/,
  /javax\.persistence\./,
  /javax\.inject\./
];

const NODE_PATTERNS: RegExp[] = [
  /ReactDOM\.render\s*\(/,
  /componentWillMount|componentWillReceiveProps|componentWillUpdate/,
  /node-sass/,
  /webpack\s*:\s*['"4]/,
  /process\.binding/,
  /require\s*\(\s*['"]url['"]\s*\).*parse/,
  /new\s+Buffer\s*\(/
];

const PYTHON_PATTERNS: RegExp[] = [
  /from\s+distutils\b|import\s+distutils\b/,
  /import\s+imp\b|from\s+imp\b/,
  /collections\.(Callable|Mapping|MutableMapping|Sequence|MutableSequence|Set|MutableSet|Iterator|Iterable)\b/,
  /asyncio\.coroutine/,
  /@asyncio\.coroutine/,
  /yield\s+from\s+asyncio/
];

export async function scanSourceCodeSignals(
  root: vscode.WorkspaceFolder,
  scan: ScanResult,
  ecosystem: DependencyEcosystem
): Promise<SourceCodeSignal[]> {
  const patterns = getPatterns(ecosystem);
  if (patterns.length === 0) return [];

  const extensions = getExtensions(ecosystem);
  const relevantFiles = scan.files.filter((f) => extensions.some((ext) => f.relativePath.endsWith(ext)));

  // Limit to avoid scanning too many files
  const filesToScan = relevantFiles.slice(0, 200);
  const signals: SourceCodeSignal[] = [];

  await Promise.allSettled(
    filesToScan.map(async (file) => {
      try {
        const uri = vscode.Uri.joinPath(root.uri, ...file.relativePath.split('/'));
        const bytes = await vscode.workspace.fs.readFile(uri);
        const content = Buffer.from(bytes).toString('utf8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          for (const pattern of patterns) {
            if (pattern.test(line)) {
              signals.push({
                file: file.relativePath,
                pattern: pattern.toString(),
                context: line.trim().slice(0, 120),
                line: i + 1
              });
              break; // one signal per line per file
            }
          }
        }
      } catch {
        // skip unreadable files
      }
    })
  );

  return signals;
}

function getPatterns(ecosystem: DependencyEcosystem): RegExp[] {
  switch (ecosystem) {
    case 'java': return JAVA_PATTERNS;
    case 'node': return NODE_PATTERNS;
    case 'python': return PYTHON_PATTERNS;
    default: return [];
  }
}

function getExtensions(ecosystem: DependencyEcosystem): string[] {
  switch (ecosystem) {
    case 'java': return ['.java', '.kt'];
    case 'node': return ['.ts', '.tsx', '.js', '.jsx'];
    case 'python': return ['.py'];
    default: return [];
  }
}

export type { SourceCodeSignal };
