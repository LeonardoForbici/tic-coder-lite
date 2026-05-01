import * as path from 'node:path';
import type { DetectedProject } from '../types';
import type { RiskReport } from './detectRisks';
import type { ScanResult } from './scanWorkspace';

const DATABASE_DIRS = new Set(['db', 'database', 'sql', 'oracle', 'plsql', 'migrations']);
const PLSQL_EXTENSIONS = new Set(['.sql', '.pks', '.pkb', '.prc', '.fnc', '.pkg', '.trg', '.pls', '.plsql']);

export function detectProjects(scan: ScanResult, risks?: RiskReport): DetectedProject[] {
  const projects = new Map<string, DetectedProject>();
  const databaseFiles = scan.files.filter((file) => isDatabaseFile(file.relativePath, file.extension));

  if (databaseFiles.length > 0) {
    projects.set('database', {
      id: 'database',
      name: 'Database / PL/SQL',
      rootPath: scan.rootPath,
      relativePath: commonDatabaseRoot(databaseFiles.map((file) => file.relativePath)),
      kind: 'database',
      stack: ['Oracle PL/SQL'],
      evidence: databaseFiles.slice(0, 20).map((file) => file.relativePath),
      files: databaseFiles.length,
      risks: risks?.risks.filter((risk) => risk.category === 'plsql').length ?? 0
    });
  }

  return [...projects.values()];
}

function isDatabaseFile(relativePath: string, extension: string): boolean {
  const first = relativePath.split('/')[0]?.toLowerCase();
  return PLSQL_EXTENSIONS.has(extension.toLowerCase()) || DATABASE_DIRS.has(first);
}

function commonDatabaseRoot(files: string[]): string {
  const firstSegments = files.map((file) => file.split('/')[0]).filter(Boolean);
  const preferred = firstSegments.find((segment) => DATABASE_DIRS.has(segment.toLowerCase()));
  return preferred ?? '.';
}
