/**
 * Métricas a nível de função/método + dead-code abrangente.
 *
 *  - Complexidade ciclomática por função (contagem de nós de decisão na AST).
 *  - Variáveis locais declaradas e nunca referenciadas no corpo.
 *  - Funções/métodos "mortos": sem aresta de chamada de entrada, não exportados
 *    e não são entrypoints (rota, main, lifecycle, etc.).
 *
 * Reutiliza o walker compartilhado `extractFunctions` (tree-sitter) e as
 * `methodEdges` já produzidas pela camada semântica. Conservador por design:
 * dispatch dinâmico/DI/reflexão geram falsos positivos, então dead-code é
 * advisory (`inferred`).
 */
import * as fs from 'fs';
import type { ScannedFile } from './scanFiles';
import type { DependencyGraph } from './buildDependencyGraph';
import { analyzeFile, type FunctionNode } from './semantic/functions';
import { grammarsAvailable, type SyntaxNode } from './semantic/treeSitter';

export interface FunctionMetric {
  file: string;
  name: string;
  enclosingType?: string;
  line: number;
  cyclomaticComplexity: number;
  loc: number;
  params: number;
  unusedLocals: string[];
}

export interface DeadFunction {
  file: string;
  name: string;
  enclosingType?: string;
  line: number;
}

export interface FunctionMetricsResult {
  functions: FunctionMetric[];
  deadFunctions: DeadFunction[];
  available: boolean;
}

const SUPPORTED = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.java']);

/** Nós que adicionam um ramo de decisão à complexidade ciclomática. */
const DECISION_NODES = new Set([
  'if_statement',
  'for_statement',
  'for_in_statement',
  'enhanced_for_statement',
  'while_statement',
  'do_statement',
  'catch_clause',
  'ternary_expression',
  'conditional_expression',
  'switch_label',
  'case'
]);

/** Nomes de método/função que nunca devem ser marcados como mortos. */
const ENTRYPOINT_NAMES = new Set([
  'main', 'constructor', 'ngOnInit', 'ngOnDestroy', 'ngAfterViewInit',
  'componentDidMount', 'componentWillUnmount', 'render', 'handle', 'run',
  'toString', 'equals', 'hashCode', 'configure', 'init'
]);

/**
 * Calcula métricas por função e dead-code. Assíncrono porque usa tree-sitter.
 */
export async function computeFunctionMetrics(
  files: ScannedFile[],
  graph: DependencyGraph
): Promise<FunctionMetricsResult> {
  if (!grammarsAvailable()) return { functions: [], deadFunctions: [], available: false };

  // Contagem GLOBAL de referências a cada identificador no projeto — base
  // conservadora para dead-code (independe de A1/methodEdges). Um nome referenciado
  // só na própria declaração tem contagem 1; > 1 significa uso em algum lugar.
  const refCounts = new Map<string, number>();

  // 1ª passada: parseia cada arquivo uma vez, coletando funções + referências.
  const perFile: Array<{ file: string; functions: FunctionNode[] }> = [];
  for (const file of files) {
    if (!SUPPORTED.has(file.extension)) continue;
    let content: string;
    try { content = fs.readFileSync(file.absolutePath, 'utf8'); }
    catch { continue; }

    let analysis;
    try { analysis = await analyzeFile(file.extension, content); }
    catch { continue; }
    if (!analysis) continue;

    for (const [n, c] of analysis.referencedCounts) refCounts.set(n, (refCounts.get(n) ?? 0) + c);
    perFile.push({ file: file.relativePath, functions: analysis.functions });
  }

  // 2ª passada: métricas + dead-code com o conjunto global já completo.
  const functions: FunctionMetric[] = [];
  const deadFunctions: DeadFunction[] = [];

  for (const { file: relativePath, functions: fns } of perFile) {
    for (const fn of fns) {
      const cc = fn.body ? cyclomaticComplexity(fn.body) : 1;
      const unusedLocals = fn.body ? findUnusedLocals(fn.body) : [];
      functions.push({
        file: relativePath,
        name: fn.name,
        enclosingType: fn.enclosingType,
        line: fn.line,
        cyclomaticComplexity: cc,
        loc: Math.max(1, fn.endLine - fn.line + 1),
        params: fn.params.length,
        unusedLocals
      });

      // dead-code: não exportado, não entrypoint, nome referenciado só na declaração
      const isConstructor = fn.enclosingType !== undefined && fn.name === fn.enclosingType;
      const isEntrypoint = isConstructor || ENTRYPOINT_NAMES.has(fn.name) || /^(get|set|on|use|test|it|describe|before|after)/.test(fn.name);
      if (!fn.isExported && !isEntrypoint && (refCounts.get(fn.name) ?? 0) <= 1) {
        deadFunctions.push({ file: relativePath, name: fn.name, enclosingType: fn.enclosingType, line: fn.line });
      }
    }
  }

  return { functions, deadFunctions, available: true };
}

/** Conta ramos de decisão na subárvore do corpo (CC = 1 + ramos). */
function cyclomaticComplexity(body: SyntaxNode): number {
  let branches = 0;
  const stack: SyntaxNode[] = [body];
  while (stack.length) {
    const node = stack.pop()!;
    if (DECISION_NODES.has(node.type)) branches++;
    else if (node.type === 'binary_expression') {
      const op = node.childForFieldName('operator')?.text;
      if (op === '&&' || op === '||') branches++;
    }
    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i);
      if (c) stack.push(c);
    }
  }
  return Math.min(branches + 1, 999);
}

/** Variáveis declaradas no corpo e referenciadas só uma vez (a própria declaração). */
function findUnusedLocals(body: SyntaxNode): string[] {
  const declared = new Map<string, number>(); // nome → linha
  const usageCount = new Map<string, number>();

  const stack: SyntaxNode[] = [body];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.type === 'variable_declarator' || node.type === 'local_variable_declaration') {
      const nameNode = node.childForFieldName('name');
      if (nameNode && nameNode.type === 'identifier') declared.set(nameNode.text, nameNode.startPosition.row + 1);
    }
    if (node.type === 'identifier') {
      usageCount.set(node.text, (usageCount.get(node.text) ?? 0) + 1);
    }
    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i);
      if (c) stack.push(c);
    }
  }

  const unused: string[] = [];
  for (const [name] of declared) {
    // 1 ocorrência = só a declaração; >1 significa que foi usada em algum lugar
    if ((usageCount.get(name) ?? 0) <= 1) unused.push(name);
  }
  return unused.slice(0, 20);
}

/** Relatório markdown: top funções complexas + dead-code. */
export function formatFunctionMetricsReport(result: FunctionMetricsResult): string {
  const lines: string[] = ['# Métricas por Função (TIC Analyzer)', ''];
  if (!result.available) {
    lines.push('> Grammars tree-sitter indisponíveis — métricas por função desativadas.', '');
    return lines.join('\n');
  }

  const complex = [...result.functions]
    .filter((f) => f.cyclomaticComplexity >= 10)
    .sort((a, b) => b.cyclomaticComplexity - a.cyclomaticComplexity)
    .slice(0, 30);

  lines.push(`> ${result.functions.length} funções analisadas, ${result.deadFunctions.length} possivelmente mortas.`, '');

  lines.push('## Top funções por complexidade ciclomática', '');
  if (complex.length === 0) {
    lines.push('> Nenhuma função com CC ≥ 10. ✅', '');
  } else {
    lines.push('| CC | Função | Arquivo | Linha | LoC | Params |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const f of complex) {
      const name = f.enclosingType ? `${f.enclosingType}.${f.name}` : f.name;
      lines.push(`| ${f.cyclomaticComplexity} | \`${name}\` | \`${f.file}\` | ${f.line} | ${f.loc} | ${f.params} |`);
    }
    lines.push('');
  }

  lines.push('## Funções possivelmente mortas (advisory)', '');
  lines.push('> ⚠️ Heurístico: DI/reflexão/dispatch dinâmico podem gerar falsos positivos.', '');
  if (result.deadFunctions.length === 0) {
    lines.push('> Nenhuma função morta detectada.', '');
  } else {
    lines.push('| Função | Arquivo | Linha |');
    lines.push('| --- | --- | --- |');
    for (const d of result.deadFunctions.slice(0, 100)) {
      const name = d.enclosingType ? `${d.enclosingType}.${d.name}` : d.name;
      lines.push(`| \`${name}\` | \`${d.file}\` | ${d.line} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
