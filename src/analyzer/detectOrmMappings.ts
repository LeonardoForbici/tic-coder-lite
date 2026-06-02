/**
 * Mapeamento ORM (JPA/Hibernate) + extração SQL multi-dialeto.
 *
 * Liga o código Java às TABELAS (não só a procedures PL/SQL): entidades
 * `@Entity`/`@Table`, repositórios Spring Data (`JpaRepository<Entity, Id>`) e
 * SQL em `@Query`/`createNativeQuery`. O extrator de tabelas é dialeto-aware
 * (Oracle/Postgres/SQLServer): lida com `schema.tab`, `"x"`, `` `x` `` e
 * `[dbo].[x]`.
 *
 * NB: é um extrator de statements SQL, não uma gramática completa — suficiente
 * para resolver quais tabelas cada ponto do código toca, em qualquer dialeto.
 */
import * as fs from 'fs';
import type { ScannedFile } from './scanFiles';

export interface EntityMapping {
  entityClass: string;
  table: string;
  file: string;
}

export interface RepoEntity {
  file: string;
  entity: string;
}

export type AccessMode = 'read' | 'write' | 'access';

export interface TableAccess {
  fromFile: string;
  table: string;
  mode: AccessMode;
  confidence: '🟢' | '🟡';
  line: number;
}

export interface OrmAnalysis {
  entities: EntityMapping[];
  repos: RepoEntity[];
  tableAccess: TableAccess[];
}

const JVM_EXTS = new Set(['.java', '.kt']);

const SQL_NON_TABLES = new Set([
  'DUAL', 'SELECT', 'WHERE', 'SET', 'VALUES', 'INTO', 'FROM', 'JOIN', 'ON', 'AND',
  'OR', 'NOT', 'NULL', 'AS', 'BY', 'GROUP', 'ORDER', 'HAVING', 'UNION', 'ALL',
  'EXCEPT', 'INTERSECT', 'WITH', 'USING', 'CROSS', 'INNER', 'OUTER', 'LEFT',
  'RIGHT', 'FULL', 'NATURAL', 'LATERAL', 'TABLE', 'ONLY', 'LIMIT', 'OFFSET'
]);

// Identificador opcionalmente qualificado, com quoting de cada dialeto.
const IDENT = String.raw`(?:\[[^\]]+\]|"[^"]+"|\`[^\`]+\`|\w+)(?:\.(?:\[[^\]]+\]|"[^"]+"|\`[^\`]+\`|\w+))*`;

export function detectOrmMappings(files: ScannedFile[]): OrmAnalysis {
  const entities: EntityMapping[] = [];
  const repos: RepoEntity[] = [];
  const rawAccess: TableAccess[] = [];

  for (const file of files) {
    if (!JVM_EXTS.has(file.extension)) continue;
    let content: string;
    try { content = fs.readFileSync(file.absolutePath, 'utf8'); }
    catch { continue; }
    if (!/@Entity|Repository|@Query|createNativeQuery|createQuery|@Table/.test(content)) continue;

    const lines = content.split('\n');

    // @Entity → classe + tabela (default = nome da classe)
    if (/@Entity\b/.test(content)) {
      const tableMatch = content.match(/@Table\s*\(\s*(?:[^)]*\bname\s*=\s*)?["']([^"']+)["']/);
      const classMatch = content.match(/(?:public\s+|abstract\s+)*class\s+(\w+)/);
      if (classMatch) {
        const entityClass = classMatch[1];
        entities.push({ entityClass, table: (tableMatch?.[1] ?? entityClass).toUpperCase(), file: file.relativePath });
      }
    }

    // Spring Data: interface X extends JpaRepository<Entity, Id>
    const repoMatch = content.match(/interface\s+\w+[^{]*\bextends\s+[^{]*Repository\s*<\s*(\w+)/);
    if (repoMatch) repos.push({ file: file.relativePath, entity: repoMatch[1] });

    // SQL em @Query("..."), createNativeQuery("..."), createQuery("...")
    for (let i = 0; i < lines.length; i++) {
      const sqlMatches = lines[i].matchAll(/(?:@Query\s*\(|createNativeQuery\s*\(|createQuery\s*\()\s*["']([^"']{6,})["']/g);
      for (const m of sqlMatches) {
        for (const ref of extractSqlTables(m[1])) {
          rawAccess.push({ fromFile: file.relativePath, table: ref.table, mode: ref.mode, confidence: '🟢', line: i + 1 });
        }
      }
    }
  }

  // Repositório Spring Data → tabela da entidade (CRUD implícito).
  const tableByEntity = new Map(entities.map((e) => [e.entityClass.toUpperCase(), e.table]));
  for (const repo of repos) {
    const table = tableByEntity.get(repo.entity.toUpperCase());
    if (table) rawAccess.push({ fromFile: repo.file, table, mode: 'access', confidence: '🟢', line: 1 });
  }

  // JPQL referencia ENTIDADES, não tabelas: mapeia para a tabela quando casar.
  const tableAccess = dedupe(rawAccess.map((a) => ({ ...a, table: tableByEntity.get(a.table.toUpperCase()) ?? a.table })));

  return { entities, repos, tableAccess };
}

/** Extrai referências de tabela de um statement SQL (multi-dialeto). */
export function extractSqlTables(sql: string): Array<{ table: string; mode: AccessMode }> {
  const out: Array<{ table: string; mode: AccessMode }> = [];
  const add = (raw: string | undefined, mode: AccessMode) => {
    if (!raw) return;
    const name = lastSegment(raw);
    if (name && !SQL_NON_TABLES.has(name)) out.push({ table: name, mode });
  };
  const scan = (re: RegExp, mode: AccessMode) => {
    for (const m of sql.matchAll(re)) add(m[1], mode);
  };
  scan(new RegExp(String.raw`\bFROM\s+(${IDENT})`, 'gi'), 'read');
  scan(new RegExp(String.raw`\bJOIN\s+(${IDENT})`, 'gi'), 'read');
  scan(new RegExp(String.raw`\bINSERT\s+INTO\s+(${IDENT})`, 'gi'), 'write');
  scan(new RegExp(String.raw`\bUPDATE\s+(${IDENT})`, 'gi'), 'write');
  scan(new RegExp(String.raw`\bDELETE\s+FROM\s+(${IDENT})`, 'gi'), 'write');
  scan(new RegExp(String.raw`\bMERGE\s+INTO\s+(${IDENT})`, 'gi'), 'write');
  return out;
}

function lastSegment(qualified: string): string {
  const seg = qualified.split('.').pop() ?? qualified;
  return seg.replace(/^[\["'`]+|[\]"'`]+$/g, '').toUpperCase();
}

function dedupe(access: TableAccess[]): TableAccess[] {
  const seen = new Set<string>();
  const out: TableAccess[] = [];
  for (const a of access) {
    const key = `${a.fromFile}|${a.table}|${a.mode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}
