/**
 * Varredura única de funções/métodos via AST (tree-sitter), reutilizada por
 * métricas por função, taint e detecção de dead-code — evita reparsear o mesmo
 * arquivo em cada feature.
 *
 * Suporta Java e TS/JS/TSX. Cada `FunctionNode` carrega o nó de corpo da AST
 * (para análises de complexidade/fluxo) além de metadados leves (nome, linhas,
 * parâmetros, se é exportado). 100% local/offline.
 */
import type { SemanticLang, SyntaxNode } from './treeSitter';
import { getParser, langForExtension } from './treeSitter';

export interface FunctionParam {
  name: string;
  /** Nome simples do tipo (TS annotation / Java type), se houver. */
  type?: string;
}

export interface FunctionNode {
  name: string;
  /** Tipo (classe/interface) que declara o método, se for um método. */
  enclosingType?: string;
  /** Linha 1-based da declaração. */
  line: number;
  endLine: number;
  params: FunctionParam[];
  isExported: boolean;
  /** Nó da AST do corpo (block) — para CC/taint. Null se for declaração sem corpo. */
  body: SyntaxNode | null;
  /** Nó da AST da função inteira. */
  node: SyntaxNode;
}

const JAVA_TYPE_NODES = new Set(['class_declaration', 'interface_declaration', 'enum_declaration', 'record_declaration']);
const TS_FUNC_NODES = new Set([
  'function_declaration',
  'generator_function_declaration',
  'function_expression',
  'arrow_function',
  'method_definition'
]);

export interface FileAnalysis {
  functions: FunctionNode[];
  /**
   * Contagem de todos os identificadores referenciados no arquivo (inclui a
   * própria declaração). Usado para dead-code: um nome com contagem global > 1
   * está referenciado em algum lugar além da declaração.
   */
  referencedCounts: Map<string, number>;
}

const NAME_NODES = new Set(['identifier', 'property_identifier', 'type_identifier', 'shorthand_property_identifier']);

/**
 * Parseia o arquivo uma única vez e retorna funções + contagem de referências.
 * Retorna `null` se a linguagem não é suportada ou o parse falhou.
 */
export async function analyzeFile(ext: string, content: string): Promise<FileAnalysis | null> {
  const lang = langForExtension(ext);
  if (!lang) return null;

  let root: SyntaxNode;
  try {
    const parser = await getParser(lang);
    root = parser.parse(content).rootNode;
  } catch {
    return null;
  }

  const functions: FunctionNode[] = [];
  if (lang === 'java') walkJava(root, functions, undefined);
  else walkTs(root, functions, lang, undefined, false);

  return { functions, referencedCounts: collectReferencedCounts(root) };
}

/**
 * Extrai só as funções/métodos. Retorna `null` se a linguagem não é suportada ou
 * o parse falhou — o consumidor decide o fallback.
 */
export async function extractFunctions(ext: string, content: string): Promise<FunctionNode[] | null> {
  const analysis = await analyzeFile(ext, content);
  return analysis ? analysis.functions : null;
}

/** Conta toda referência a identificador (qualquer posição) — base p/ dead-code. */
function collectReferencedCounts(root: SyntaxNode): Map<string, number> {
  const counts = new Map<string, number>();
  const stack: SyntaxNode[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.childCount === 0 && NAME_NODES.has(node.type)) {
      counts.set(node.text, (counts.get(node.text) ?? 0) + 1);
    }
    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i);
      if (c) stack.push(c);
    }
  }
  return counts;
}

// ── Java ──────────────────────────────────────────────────────────────────────

function walkJava(node: SyntaxNode, out: FunctionNode[], enclosingType: string | undefined): void {
  for (const child of node.namedChildren) {
    if (JAVA_TYPE_NODES.has(child.type)) {
      const nameNode = child.childForFieldName('name');
      const typeName = nameNode ? nameNode.text : enclosingType;
      const body = child.childForFieldName('body');
      if (body) {
        for (const member of body.namedChildren) {
          if (member.type === 'method_declaration' || member.type === 'constructor_declaration') {
            const mn = member.childForFieldName('name');
            const mBody = member.childForFieldName('body');
            const modifiers = member.childForFieldName('modifiers')?.text ?? '';
            out.push({
              name: mn ? mn.text : '(anon)',
              enclosingType: typeName,
              line: (mn ?? member).startPosition.row + 1,
              endLine: member.endPosition.row + 1,
              params: readJavaParams(member),
              isExported: modifiers.includes('public'),
              body: mBody,
              node: member
            });
          }
        }
        // tipos aninhados
        walkJava(body, out, typeName);
      }
    } else {
      walkJava(child, out, enclosingType);
    }
  }
}

function readJavaParams(method: SyntaxNode): FunctionParam[] {
  const params: FunctionParam[] = [];
  const list = method.childForFieldName('parameters');
  if (!list) return params;
  for (const p of list.namedChildren) {
    if (p.type !== 'formal_parameter' && p.type !== 'spread_parameter') continue;
    const nameNode = p.childForFieldName('name') ?? p.namedChildren.find((c) => c.type === 'identifier');
    const typeNode = p.childForFieldName('type');
    if (nameNode) params.push({ name: nameNode.text, type: typeNode ? simpleType(typeNode.text) : undefined });
  }
  return params;
}

// ── TS / JS / TSX ──────────────────────────────────────────────────────────────

function walkTs(
  node: SyntaxNode,
  out: FunctionNode[],
  lang: SemanticLang,
  enclosingType: string | undefined,
  exportedScope: boolean
): void {
  for (const child of node.namedChildren) {
    // rastreia classe envolvente
    if (child.type === 'class_declaration' || child.type === 'abstract_class_declaration') {
      const nameNode = child.childForFieldName('name');
      const body = child.childForFieldName('body');
      const exported = exportedScope || isExported(child);
      if (body) walkTs(body, out, lang, nameNode ? nameNode.text : enclosingType, exported);
      continue;
    }

    if (TS_FUNC_NODES.has(child.type)) {
      const fn = readTsFunction(child, enclosingType, exportedScope);
      if (fn) out.push(fn);
      // funções aninhadas dentro do corpo
      const body = child.childForFieldName('body');
      if (body) walkTs(body, out, lang, undefined, false);
      continue;
    }

    // const foo = () => {} / const foo = function(){}
    if (child.type === 'lexical_declaration' || child.type === 'variable_declaration') {
      const exported = exportedScope || isExported(child);
      for (const decl of child.namedChildren.filter((c) => c.type === 'variable_declarator')) {
        const nameNode = decl.childForFieldName('name');
        const value = decl.childForFieldName('value');
        if (nameNode && value && (value.type === 'arrow_function' || value.type === 'function_expression')) {
          const fn = readTsFunction(value, enclosingType, exported, nameNode.text);
          if (fn) out.push(fn);
          const body = value.childForFieldName('body');
          if (body) walkTs(body, out, lang, undefined, false);
        }
      }
      continue;
    }

    // export statement embrulhando declaração
    if (child.type === 'export_statement') {
      walkTs(child, out, lang, enclosingType, true);
      continue;
    }

    walkTs(child, out, lang, enclosingType, exportedScope);
  }
}

function readTsFunction(
  node: SyntaxNode,
  enclosingType: string | undefined,
  exported: boolean,
  fallbackName?: string
): FunctionNode | null {
  const nameNode = node.childForFieldName('name');
  const name = nameNode ? nameNode.text : fallbackName ?? '(anon)';
  if (name === '(anon)' && node.type === 'arrow_function') return null; // arrow anônima inline — ignora
  const body = node.childForFieldName('body');
  const isMethod = node.type === 'method_definition';
  return {
    name,
    enclosingType: isMethod ? enclosingType : undefined,
    line: (nameNode ?? node).startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    params: readTsParams(node),
    isExported: exported,
    body: body ?? null,
    node
  };
}

function readTsParams(node: SyntaxNode): FunctionParam[] {
  const params: FunctionParam[] = [];
  const list = node.childForFieldName('parameters');
  if (!list) return params;
  for (const p of list.namedChildren) {
    if (p.type !== 'required_parameter' && p.type !== 'optional_parameter') continue;
    const pattern = p.childForFieldName('pattern') ?? p.namedChildren.find((c) => c.type === 'identifier');
    const typeNode = p.childForFieldName('type');
    const typeText = typeNode ? typeNode.namedChildren[0]?.text ?? typeNode.text.replace(/^:\s*/, '') : undefined;
    if (pattern && pattern.type === 'identifier') {
      params.push({ name: pattern.text, type: typeText ? simpleType(typeText) : undefined });
    }
  }
  return params;
}

function isExported(node: SyntaxNode): boolean {
  return node.parent?.type === 'export_statement' || (node.previousSibling?.text === 'export');
}

/** Nome simples de um tipo: remove genéricos/qualificação/arrays. */
function simpleType(text: string): string {
  return text.split('<')[0].replace(/\[\]$/, '').split('.').pop()?.trim() ?? text;
}
