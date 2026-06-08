/**
 * Detecção de clones de código (cópia-e-cola). Abordagem token-based com
 * normalização de identificadores/literais (pega clones tipo-2, com rename) e
 * rolling-hash de janelas deslizantes.
 *
 * Limitado a TS/JS/Java (linguagens com grammar tree-sitter vendorada). Pensado
 * para rodar em repositórios grandes: O(total de tokens), com limites de janela
 * e exclusão de arquivos gerados/declarações.
 */
import * as fs from 'fs';
import type { ScannedFile } from './scanFiles';
import { getParser, langForExtension, grammarsAvailable, type SyntaxNode } from './semantic/treeSitter';

export interface CloneInstance {
  file: string;
  startLine: number;
  endLine: number;
}

export interface CloneGroup {
  id: number;
  /** Nº de tokens normalizados do bloco. */
  tokenLength: number;
  instances: CloneInstance[];
}

export interface CloneReport {
  groups: CloneGroup[];
  totalClonedBlocks: number;
  filesAffected: number;
}

const CLONE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.java']);
const WINDOW = 50;     // tokens por janela
const MIN_LINES = 6;   // descarta blocos muito curtos (getters/boilerplate)
const MAX_GROUPS = 200;

interface Token { norm: string; line: number; }

/**
 * Detecta blocos duplicados entre arquivos. Retorna grupos de clones, cada um com
 * ≥2 instâncias.
 */
export async function detectClones(files: ScannedFile[]): Promise<CloneReport> {
  if (!grammarsAvailable()) return { groups: [], totalClonedBlocks: 0, filesAffected: 0 };

  const candidates = files.filter(
    (f) => CLONE_EXTS.has(f.extension) &&
      !f.relativePath.endsWith('.d.ts') &&
      !/(\.min\.|\.generated\.|\.spec\.|\.test\.|node_modules|dist\/|build\/)/.test(f.relativePath)
  );

  // hash da janela → ocorrências (arquivo + linhas)
  const windowMap = new Map<string, CloneInstance[]>();

  for (const file of candidates) {
    const lang = langForExtension(file.extension);
    if (!lang) continue;
    let content: string;
    try { content = fs.readFileSync(file.absolutePath, 'utf8'); }
    catch { continue; }
    if (content.length > 400_000) continue; // pula arquivos gigantes

    let tokens: Token[];
    try {
      const parser = await getParser(lang);
      tokens = tokenize(parser.parse(content).rootNode);
    } catch {
      continue;
    }
    if (tokens.length < WINDOW) continue;

    // janelas deslizantes (stride = metade da janela para reduzir volume)
    const stride = Math.max(1, Math.floor(WINDOW / 2));
    for (let i = 0; i + WINDOW <= tokens.length; i += stride) {
      const slice = tokens.slice(i, i + WINDOW);
      const startLine = slice[0].line;
      const endLine = slice[slice.length - 1].line;
      if (endLine - startLine + 1 < MIN_LINES) continue;
      const hash = hashTokens(slice);
      const list = windowMap.get(hash) ?? [];
      list.push({ file: file.relativePath, startLine, endLine });
      windowMap.set(hash, list);
    }
  }

  // agrupa janelas com ≥2 instâncias em arquivos/posições distintas
  const groups: CloneGroup[] = [];
  let id = 1;
  for (const instances of windowMap.values()) {
    const distinct = dedupeInstances(instances);
    if (distinct.length < 2) continue;
    groups.push({ id: id++, tokenLength: WINDOW, instances: distinct });
  }

  // maiores grupos primeiro (mais instâncias)
  groups.sort((a, b) => b.instances.length - a.instances.length);
  const top = groups.slice(0, MAX_GROUPS);

  const affected = new Set<string>();
  let blocks = 0;
  for (const g of top) for (const inst of g.instances) { affected.add(inst.file); blocks++; }

  return { groups: top, totalClonedBlocks: blocks, filesAffected: affected.size };
}

/** Linhas folha da AST viram tokens normalizados (identificadores/literais → placeholder). */
function tokenize(root: SyntaxNode): Token[] {
  const tokens: Token[] = [];
  const stack: SyntaxNode[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.namedChildCount === 0 && node.childCount === 0) {
      const norm = normalizeToken(node);
      if (norm) tokens.push({ norm, line: node.startPosition.row + 1 });
    } else {
      for (let i = node.childCount - 1; i >= 0; i--) {
        const c = node.child(i);
        if (c) stack.push(c);
      }
    }
  }
  // a pilha inverte a ordem; reordena por posição
  tokens.sort((a, b) => a.line - b.line);
  return tokens;
}

function normalizeToken(node: SyntaxNode): string | null {
  const type = node.type;
  if (type === 'comment') return null;
  if (type === 'identifier' || type === 'property_identifier' || type === 'type_identifier' || type === 'shorthand_property_identifier') return 'ID';
  if (type === 'number' || type === 'decimal_integer_literal' || type === 'decimal_floating_point_literal') return 'NUM';
  if (type === 'string' || type === 'string_literal' || type === 'template_string' || type === 'string_fragment' || type === 'character_literal') return 'STR';
  const text = node.text.trim();
  if (!text) return null;
  return text; // keywords, operadores, pontuação preservados
}

/** FNV-1a 64-bit (via BigInt) sobre a sequência de tokens normalizados. */
function hashTokens(tokens: Token[]): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const t of tokens) {
    for (let i = 0; i < t.norm.length; i++) {
      h ^= BigInt(t.norm.charCodeAt(i));
      h = (h * prime) & mask;
    }
    h ^= 0x20n; // separador entre tokens
    h = (h * prime) & mask;
  }
  return h.toString(16);
}

/** Remove instâncias sobrepostas no mesmo arquivo (mantém regiões distintas). */
function dedupeInstances(instances: CloneInstance[]): CloneInstance[] {
  const out: CloneInstance[] = [];
  for (const inst of instances) {
    const overlap = out.find(
      (o) => o.file === inst.file && inst.startLine <= o.endLine && o.startLine <= inst.endLine
    );
    if (!overlap) out.push(inst);
  }
  return out;
}

/** Relatório markdown dos maiores grupos de clones. */
export function formatClonesReport(report: CloneReport): string {
  const lines: string[] = ['# Clones de Código (TIC Analyzer)', ''];
  if (report.groups.length === 0) {
    lines.push('> Nenhum clone relevante detectado. ✅', '');
    return lines.join('\n');
  }
  lines.push(
    `> ${report.groups.length} grupos de clones, ${report.totalClonedBlocks} blocos, ${report.filesAffected} arquivos afetados.`,
    '> Janela de ' + WINDOW + ' tokens normalizados (clones tipo-1 e tipo-2).',
    ''
  );
  for (const g of report.groups.slice(0, 50)) {
    lines.push(`## Grupo #${g.id} — ${g.instances.length} ocorrências (~${g.tokenLength} tokens)`);
    for (const inst of g.instances) {
      lines.push(`- \`${inst.file}\` linhas ${inst.startLine}–${inst.endLine}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
