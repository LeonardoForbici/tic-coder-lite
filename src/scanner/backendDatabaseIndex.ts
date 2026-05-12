/**
 * backendDatabaseIndex.ts
 *
 * Detecta conexões entre backend Java e banco de dados (JPA, SQL, JDBC, Spring Data).
 * Análise estática 100% local — nenhuma execução ou conexão externa.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ScanResult } from './scanWorkspace';
import type { DetectedProject } from '../types';

export type Confidence = 'CONFIRMED' | 'INFERRED' | 'GAP';

export type BackendDatabaseLinkType =
  | 'CONTROLLER_CALLS_SERVICE'
  | 'SERVICE_CALLS_REPOSITORY'
  | 'SERVICE_CALLS_DAO'
  | 'DAO_USES_SQL'
  | 'REPOSITORY_USES_ENTITY'
  | 'SQL_READS_TABLE'
  | 'SQL_WRITES_TABLE'
  | 'SQL_CALLS_FUNCTION'
  | 'SQL_CALLS_PROCEDURE'
  | 'ENTITY_MAPS_TABLE';

export interface BackendDatabaseLink {
  projectId: string;
  fromFile: string;
  toFile?: string;
  type: BackendDatabaseLinkType;
  table?: string;
  sqlObject?: string;
  confidence: Confidence;
  evidence: string[];
}

export interface EntityMapping {
  projectId: string;
  file: string;
  className: string;
  tableName: string;
  confidence: Confidence;
}

export interface SqlTableRef {
  file: string;
  table: string;
  operation: 'READ' | 'WRITE' | 'CALL_FUNC' | 'CALL_PROC';
  line: number;
  evidence: string;
}

export interface BackendDatabaseIndex {
  generatedAt: string;
  projectId: string;
  links: BackendDatabaseLink[];
  entities: EntityMapping[];
  sqlTableRefs: SqlTableRef[];
  gaps: string[];
  stats: {
    totalLinks: number;
    entities: number;
    sqlFiles: number;
    tablesDetected: number;
    confirmedLinks: number;
    inferredLinks: number;
  };
}

// SQL read/write patterns
const SQL_READ_PATTERN = /\bSELECT\b[^;]*?\bFROM\b\s+([A-Za-z_$][A-Za-z0-9_$#.]*)/gi;
const SQL_WRITE_PATTERNS = [
  /\bINSERT\s+INTO\s+([A-Za-z_$][A-Za-z0-9_$#.]*)/gi,
  /\bUPDATE\s+([A-Za-z_$][A-Za-z0-9_$#.]*)\s+SET\b/gi,
  /\bDELETE\s+FROM\s+([A-Za-z_$][A-Za-z0-9_$#.]*)/gi,
  /\bMERGE\s+INTO\s+([A-Za-z_$][A-Za-z0-9_$#.]*)/gi
];
const SQL_CALL_PATTERN = /\bEXEC(?:UTE)?\s+([A-Za-z_$][A-Za-z0-9_$.]*)/gi;
const FUNC_CALL_PATTERN = /(?:CALL\s+|:=\s*)([A-Za-z_$][A-Za-z0-9_$.]*)\s*\(/gi;

const JAVA_EXTENSIONS = new Set(['.java']);
const SQL_EXTENSIONS = new Set(['.sql', '.pks', '.pkb', '.prc', '.fnc', '.pkg', '.trg', '.pls', '.plsql']);

export async function buildBackendDatabaseIndex(
  scan: ScanResult,
  projects: DetectedProject[]
): Promise<BackendDatabaseIndex[]> {
  const backendProjects = projects.filter((p) => p.kind === 'backend');
  const dbProjects = projects.filter((p) => p.kind === 'database');

  const projectsToScan = backendProjects.length > 0 ? backendProjects : [
    { id: 'workspace', relativePath: '.', kind: 'backend' } as DetectedProject
  ];

  const results: BackendDatabaseIndex[] = [];

  // Build SQL table reference map for cross-referencing
  const allSqlFiles = scan.files.filter((f) => SQL_EXTENSIONS.has(f.extension));
  const sqlTableRefs: SqlTableRef[] = [];
  for (const sqlFile of allSqlFiles) {
    const content = await readSafe(path.join(scan.rootPath, sqlFile.relativePath));
    if (content) {
      sqlTableRefs.push(...extractSqlTableRefs(sqlFile.relativePath, content));
    }
  }

  for (const project of projectsToScan) {
    const links: BackendDatabaseLink[] = [];
    const entities: EntityMapping[] = [];
    const gaps: string[] = [];

    const javaFiles = scan.files.filter((f) => {
      if (!JAVA_EXTENSIONS.has(f.extension)) return false;
      if (project.relativePath === '.') return true;
      return f.relativePath.startsWith(project.relativePath);
    });

    // Map classes to files for internal call detection
    const classToFile = new Map<string, string>();
    const classContents = new Map<string, string>();

    for (const file of javaFiles) {
      const content = await readSafe(path.join(scan.rootPath, file.relativePath));
      if (!content) continue;
      const className = extractJavaClassName(content);
      if (className) {
        classToFile.set(className, file.relativePath);
        classContents.set(file.relativePath, content);
      }
    }

    for (const file of javaFiles) {
      const content = classContents.get(file.relativePath);
      if (!content) continue;

      const className = extractJavaClassName(content) ?? '';
      const kind = classifyJavaKind(file.relativePath, content);

      // Entity → Table mapping
      const entityMapping = extractEntityMapping(file.relativePath, content, project.id);
      if (entityMapping) {
        entities.push(entityMapping);
        links.push({
          projectId: project.id,
          fromFile: file.relativePath,
          type: 'ENTITY_MAPS_TABLE',
          table: entityMapping.tableName,
          confidence: entityMapping.confidence,
          evidence: [`@Entity / @Table(name="${entityMapping.tableName}")`]
        });
      }

      // Controller → Service calls
      if (kind === 'controller') {
        const serviceRefs = extractClassReferences(content, 'Service');
        for (const ref of serviceRefs) {
          const targetFile = classToFile.get(ref);
          if (targetFile) {
            links.push({
              projectId: project.id,
              fromFile: file.relativePath,
              toFile: targetFile,
              type: 'CONTROLLER_CALLS_SERVICE',
              confidence: 'CONFIRMED',
              evidence: [`${className} → ${ref}`]
            });
          }
        }
      }

      // Service → Repository/DAO calls
      if (kind === 'service') {
        const repoRefs = extractClassReferences(content, 'Repository');
        for (const ref of repoRefs) {
          const targetFile = classToFile.get(ref);
          links.push({
            projectId: project.id,
            fromFile: file.relativePath,
            toFile: targetFile,
            type: 'SERVICE_CALLS_REPOSITORY',
            confidence: targetFile ? 'CONFIRMED' : 'INFERRED',
            evidence: [`${className} → ${ref}`]
          });
        }

        const daoRefs = extractClassReferences(content, 'DAO', 'Dao');
        for (const ref of daoRefs) {
          const targetFile = classToFile.get(ref);
          links.push({
            projectId: project.id,
            fromFile: file.relativePath,
            toFile: targetFile,
            type: 'SERVICE_CALLS_DAO',
            confidence: targetFile ? 'CONFIRMED' : 'INFERRED',
            evidence: [`${className} → ${ref}`]
          });
        }
      }

      // DAO/Repository → SQL usage
      if (kind === 'repository' || kind === 'dao') {
        // Look for SQL resource loading
        const sqlResourceRefs = extractSqlResources(content);
        for (const sqlRef of sqlResourceRefs) {
          links.push({
            projectId: project.id,
            fromFile: file.relativePath,
            type: 'DAO_USES_SQL',
            sqlObject: sqlRef,
            confidence: 'CONFIRMED',
            evidence: [`getResourceAsStream("${sqlRef}") or similar`]
          });
        }

        // Look for @Query annotations with SQL
        const queryAnnotations = extractQueryAnnotations(content);
        for (const query of queryAnnotations) {
          const tables = extractTablesFromSql(query);
          for (const table of tables) {
            links.push({
              projectId: project.id,
              fromFile: file.relativePath,
              type: 'DAO_USES_SQL',
              table,
              confidence: 'CONFIRMED',
              evidence: [`@Query("...${table}...")`]
            });
          }
        }

        // Inline SQL strings in Java
        const inlineSqlTables = extractInlineSqlTables(content);
        for (const { table, operation } of inlineSqlTables) {
          const linkType: BackendDatabaseLinkType = operation === 'READ' ? 'SQL_READS_TABLE' :
            operation === 'WRITE' ? 'SQL_WRITES_TABLE' : 'DAO_USES_SQL';
          links.push({
            projectId: project.id,
            fromFile: file.relativePath,
            type: linkType,
            table,
            confidence: 'INFERRED',
            evidence: [`inline SQL in ${path.basename(file.relativePath)}`]
          });
        }
      }
    }

    // Add SQL file links
    const projectSqlRefs = sqlTableRefs.filter((ref) => {
      if (dbProjects.length === 0) return true;
      return dbProjects.some((dp) => dp.relativePath === '.' || ref.file.startsWith(dp.relativePath));
    });

    const tablesDetected = new Set([
      ...entities.map((e) => e.tableName),
      ...projectSqlRefs.map((r) => r.table)
    ]).size;

    if (entities.length === 0 && javaFiles.length > 0) {
      gaps.push(`GAP: nenhuma entidade JPA detectada no projeto ${project.id}.`);
    }

    const confirmed = links.filter((l) => l.confidence === 'CONFIRMED').length;
    const inferred = links.filter((l) => l.confidence === 'INFERRED').length;

    results.push({
      generatedAt: new Date().toISOString(),
      projectId: project.id,
      links,
      entities,
      sqlTableRefs: projectSqlRefs,
      gaps,
      stats: {
        totalLinks: links.length,
        entities: entities.length,
        sqlFiles: allSqlFiles.length,
        tablesDetected,
        confirmedLinks: confirmed,
        inferredLinks: inferred
      }
    });
  }

  return results;
}

function extractEntityMapping(filePath: string, content: string, projectId: string): EntityMapping | null {
  if (!/@Entity\b/.test(content)) return null;
  const className = extractJavaClassName(content);
  if (!className) return null;

  const tableMatch = content.match(/@Table\s*\(\s*(?:name\s*=\s*)?["'`]([^"'`]+)["'`]/);
  const tableName = tableMatch?.[1] ?? camelToSnakeUpper(className);

  return {
    projectId,
    file: filePath,
    className,
    tableName,
    confidence: tableMatch ? 'CONFIRMED' : 'INFERRED'
  };
}

function extractSqlTableRefs(filePath: string, content: string): SqlTableRef[] {
  const refs: SqlTableRef[] = [];
  const lines = content.split('\n');

  const addRef = (pattern: RegExp, operation: SqlTableRef['operation']) => {
    const p = new RegExp(pattern.source, 'gi');
    let m: RegExpExecArray | null;
    while ((m = p.exec(content)) !== null) {
      const table = m[1]?.toUpperCase();
      if (!table || isReservedWord(table)) continue;
      const line = getLineNumber(content, m.index);
      refs.push({ file: filePath, table, operation, line, evidence: lines[line - 1]?.trim().slice(0, 100) ?? '' });
    }
  };

  addRef(SQL_READ_PATTERN, 'READ');
  for (const p of SQL_WRITE_PATTERNS) addRef(p, 'WRITE');
  addRef(SQL_CALL_PATTERN, 'CALL_PROC');
  addRef(FUNC_CALL_PATTERN, 'CALL_FUNC');

  return refs;
}

function extractTablesFromSql(sql: string): string[] {
  const tables = new Set<string>();
  const patterns = [SQL_READ_PATTERN, ...SQL_WRITE_PATTERNS];
  for (const p of patterns) {
    const pp = new RegExp(p.source, 'gi');
    let m: RegExpExecArray | null;
    while ((m = pp.exec(sql)) !== null) {
      const t = m[1]?.toUpperCase();
      if (t && !isReservedWord(t)) tables.add(t);
    }
  }
  return [...tables];
}

function extractInlineSqlTables(content: string): Array<{ table: string; operation: 'READ' | 'WRITE' }> {
  const found: Array<{ table: string; operation: 'READ' | 'WRITE' }> = [];
  const sqlStrings = content.match(/"[^"]*\b(SELECT|INSERT|UPDATE|DELETE)\b[^"]*"/gi) ?? [];
  for (const s of sqlStrings) {
    found.push(
      ...extractTablesFromSql(s).map((table) => ({
        table,
        operation: (/INSERT|UPDATE|DELETE|MERGE/i.test(s) ? 'WRITE' : 'READ') as 'READ' | 'WRITE'
      }))
    );
  }
  return found;
}

function extractClassReferences(content: string, ...suffixes: string[]): string[] {
  const refs: string[] = [];
  for (const suffix of suffixes) {
    const pattern = new RegExp(`\\b(\\w+${suffix})\\b`, 'g');
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(content)) !== null) {
      if (!refs.includes(m[1])) refs.push(m[1]);
    }
  }
  return refs;
}

function extractSqlResources(content: string): string[] {
  const resources: string[] = [];
  const patterns = [
    /getResourceAsStream\s*\(\s*["'`]([^"'`]+\.sql)["'`]/g,
    /loadSql\s*\(\s*["'`]([^"'`]+)["'`]/g,
    /classpath:([^"'\s]+\.sql)/g
  ];
  for (const p of patterns) {
    let m: RegExpExecArray | null;
    while ((m = p.exec(content)) !== null) {
      resources.push(m[1]);
    }
  }
  return resources;
}

function extractQueryAnnotations(content: string): string[] {
  const queries: string[] = [];
  const pattern = /@(?:Query|NativeQuery)\s*(?:\((?:value\s*=\s*)?)?["'`]((?:[^"'`]|``)+)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(content)) !== null) {
    queries.push(m[1]);
  }
  return queries;
}

function classifyJavaKind(relativePath: string, content: string): string {
  const lower = relativePath.toLowerCase();
  if (/@(RestController|Controller)\b/.test(content)) return 'controller';
  if (/@Service\b/.test(content) || lower.includes('/service/')) return 'service';
  if (/@Repository\b/.test(content) || lower.includes('/repository/')) return 'repository';
  if (lower.includes('/dao/') || lower.endsWith('dao.java') || lower.endsWith('daoimpl.java')) return 'dao';
  return 'unknown';
}

function extractJavaClassName(content: string): string | undefined {
  return content.match(/\b(?:class|interface)\s+([A-Za-z_$][\w$]*)/)?.[1];
}

function camelToSnakeUpper(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}

const SQL_RESERVED = new Set(['SELECT', 'FROM', 'WHERE', 'JOIN', 'ON', 'AS', 'AND', 'OR', 'NOT',
  'NULL', 'IS', 'IN', 'LIKE', 'BETWEEN', 'DISTINCT', 'GROUP', 'ORDER', 'BY', 'HAVING',
  'LIMIT', 'OFFSET', 'UNION', 'ALL', 'INTO', 'VALUES', 'SET', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'TABLE', 'INDEX', 'VIEW', 'PROCEDURE', 'FUNCTION', 'TRIGGER', 'PACKAGE', 'DECLARE', 'BEGIN',
  'DUAL', 'SYSDATE', 'ROWNUM', 'ROWID']);

function isReservedWord(word: string): boolean {
  return SQL_RESERVED.has(word.toUpperCase());
}

function getLineNumber(content: string, index: number): number {
  return content.substring(0, index).split('\n').length;
}

async function readSafe(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}
