/**
 * Verificação dos detectores de análise profunda (Trilho A) — roda contra dist/.
 *
 * Exercita as funções de produção reais (sem stub) em fixtures temporários com
 * padrões conhecidos:
 *   - detectFrameworkRisks: SQLi em ORM, misconfig web, API insegura
 *   - detectClones: bloco duplicado entre dois arquivos
 *   - computeFunctionMetrics: CC por função + função morta vs. viva
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const need = (p) => { if (!existsSync(p)) { console.error(`✗ dist ausente: ${p}. Rode \`npm run build:electron\`.`); process.exit(1); } return p; };

const { detectFrameworkRisks } = require(need(join(root, 'dist/src/analyzer/detectFrameworkRisks.js')));
const { detectClones } = require(need(join(root, 'dist/src/analyzer/detectClones.js')));
const { computeFunctionMetrics } = require(need(join(root, 'dist/src/analyzer/computeFunctionMetrics.js')));

const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failures.push(name); }
};

// fixture temporário
const tmp = join(root, '.verify-tmp-v2');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const scanned = (rel, content) => {
  const abs = join(tmp, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf8');
  return {
    relativePath: rel,
    absolutePath: abs,
    extension: rel.slice(rel.lastIndexOf('.')),
    sizeBytes: Buffer.byteLength(content),
    lines: content.split('\n').length
  };
};

(async () => {
  // ── (1) FRAMEWORK RISKS ──────────────────────────────────────────────────────
  console.log('\n(1) detectFrameworkRisks — padrões conhecidos\n');
  const fwFiles = [
    scanned('src/repo.ts', [
      'export class UserRepo {',
      '  find(name: string) {',
      '    return this.repo.query(`SELECT * FROM users WHERE name = ${name}`);',
      '  }',
      '}'
    ].join('\n')),
    scanned('src/crypto.ts', "import crypto from 'crypto';\nconst c = crypto.createCipher('aes', key);\n"),
    scanned('src/Security.java', [
      'public class Security {',
      '  void config(HttpSecurity http) {',
      '    http.csrf().disable();',
      '  }',
      '}'
    ].join('\n')),
    scanned('src/safe.ts', 'export function add(a: number, b: number) { return a + b; }\n')
  ];
  const fw = detectFrameworkRisks(fwFiles);
  const has = (id) => fw.some((f) => f.ruleId === id);
  check('detecta ORM SQLi (typeorm raw query)', has('orm-typeorm-raw-query'), fw.map((f) => f.ruleId).join(','));
  check('detecta crypto.createCipher inseguro', has('node-crypto-createcipher'));
  check('detecta CSRF disabled (Spring)', has('spring-csrf-disabled'));
  check('não gera falso positivo em código seguro', !fw.some((f) => f.file === 'src/safe.ts'));
  check('achados carregam category + cwe', fw.every((f) => f.category && f.cwe));

  // ── (2) CLONES ───────────────────────────────────────────────────────────────
  console.log('\n(2) detectClones — bloco duplicado entre arquivos\n');
  const block = (varname) => [
    `function process_${varname}(input) {`,
    `  const result = [];`,
    `  for (let i = 0; i < input.length; i++) {`,
    `    if (input[i] > 0) { result.push(input[i] * 2); }`,
    `    else { result.push(0); }`,
    `  }`,
    `  const total = result.reduce((a, b) => a + b, 0);`,
    `  return { result, total, count: result.length };`,
    `}`
  ].join('\n');
  const cloneFiles = [
    scanned('src/a.js', block('a') + '\n' + block('a2')),
    scanned('src/b.js', block('b') + '\n' + block('b2'))
  ];
  const clones = await detectClones(cloneFiles);
  check('encontra ≥1 grupo de clone', clones.groups.length >= 1, `${clones.groups.length} grupos`);
  check('clone envolve ambos os arquivos', clones.groups.some((g) => {
    const files = new Set(g.instances.map((i) => i.file));
    return files.has('src/a.js') && files.has('src/b.js');
  }));

  // ── (3) FUNCTION METRICS + DEAD CODE ─────────────────────────────────────────
  console.log('\n(3) computeFunctionMetrics — CC por função + dead-code\n');
  const fmFiles = [
    scanned('src/calc.ts', [
      'export function complex(n: number) {',         // exportada, CC alta
      '  let r = 0;',
      '  if (n > 0) r++;',
      '  if (n > 1) r++;',
      '  for (let i = 0; i < n; i++) { if (i % 2 === 0 && i > 0) r += i; }',
      '  return n > 5 ? r * 2 : r;',
      '}',
      'function helperUsed() { return 42; }',          // privada, usada abaixo
      'function helperDead() { return 99; }',          // privada, nunca usada → morta
      'export function entry() { return helperUsed(); }'
    ].join('\n'))
  ];
  const graphStub = { nodes: [], edges: [], centralFiles: [], externalDeps: [], methodEdges: [] };
  const fm = await computeFunctionMetrics(fmFiles, graphStub);
  check('camada disponível (grammars carregadas)', fm.available);
  const complex = fm.functions.find((f) => f.name === 'complex');
  check('calcula CC por função (complex ≥ 5)', !!complex && complex.cyclomaticComplexity >= 5, complex ? `CC=${complex.cyclomaticComplexity}` : 'não achou');
  check('marca helperDead como morta', fm.deadFunctions.some((d) => d.name === 'helperDead'));
  check('NÃO marca helperUsed como morta', !fm.deadFunctions.some((d) => d.name === 'helperUsed'));
  check('NÃO marca função exportada como morta', !fm.deadFunctions.some((d) => d.name === 'entry' || d.name === 'complex'));

  rmSync(tmp, { recursive: true, force: true });

  console.log(`\n${failures.length === 0 ? '✓ detectores de análise v2 verificados' : `✗ ${failures.length} falha(s): ${failures.join(', ')}`}\n`);
  process.exit(failures.length === 0 ? 0 : 1);
})().catch((err) => {
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* noop */ }
  console.error('Erro fatal na verificação:', err);
  process.exit(1);
});
