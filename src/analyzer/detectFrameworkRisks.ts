/**
 * Detectores de vulnerabilidade específicos por framework — complementa o
 * `detectRisks` genérico (OWASP) com padrões de ORM, segurança web e APIs
 * inseguras/deprecadas que dependem do framework em uso.
 *
 * Determinístico, sem IA: varredura linha a linha com uma janela de contexto
 * (alguns padrões abrangem várias linhas, ex.: `.csrf()` → `.disable()`).
 * Cada achado reusa a interface `RiskFinding`, então é absorvido pelos relatórios
 * existentes; campos extras (category/cwe/remediation) ficam em `SecurityFinding`.
 */
import * as fs from 'fs';
import type { ScannedFile } from './scanFiles';
import type { RiskFinding, RiskLevel } from './detectRisks';

export type SecurityCategory = 'orm-sqli' | 'web-misconfig' | 'insecure-api';

export interface SecurityFinding extends RiskFinding {
  ruleId: string;
  category: SecurityCategory;
  cwe?: string;
  owasp?: string;
  /** Dica curta de remediação (usada por auto-remediation no PR). */
  remediation?: string;
}

interface Rule {
  id: string;
  level: RiskLevel;
  title: string;
  category: SecurityCategory;
  cwe?: string;
  owasp?: string;
  remediation?: string;
  exts: Set<string>;
  /** Testa a linha (com contexto opcional das linhas vizinhas). */
  test(line: string, ctx: { prev: string; next: string }): boolean;
}

const JAVA = new Set(['.java']);
const JS_TS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const ALL = new Set([...JAVA, ...JS_TS]);

/** Heurística de interpolação dinâmica numa string (concat `+` ou template `${}`). */
function hasInterpolation(line: string): boolean {
  return /\$\{/.test(line) || /['"`]\s*\+/.test(line) || /\+\s*['"`]/.test(line);
}

const RULES: Rule[] = [
  // ── ORM / SQL Injection ───────────────────────────────────────────────────────
  {
    id: 'orm-typeorm-raw-query',
    level: 'critical',
    title: 'ORM SQLi: query crua (TypeORM) com interpolação',
    category: 'orm-sqli',
    cwe: 'CWE-89',
    owasp: 'A03',
    remediation: 'Use parâmetros: repo.query(sql, [param]) em vez de concatenar/interpolar.',
    exts: JS_TS,
    test: (l) => /\.(query|createQueryBuilder)\s*\(/.test(l) && hasInterpolation(l)
  },
  {
    id: 'orm-querybuilder-where-template',
    level: 'critical',
    title: 'ORM SQLi: .where()/.andWhere() com template string',
    category: 'orm-sqli',
    cwe: 'CWE-89',
    owasp: 'A03',
    remediation: 'Use placeholders nomeados: .where("x = :v", { v }) em vez de `${}`.',
    exts: JS_TS,
    test: (l) => /\.(where|andWhere|orWhere|having)\s*\(\s*`[^`]*\$\{/.test(l)
  },
  {
    id: 'orm-sequelize-query-interp',
    level: 'critical',
    title: 'ORM SQLi: sequelize.query com interpolação sem replacements',
    category: 'orm-sqli',
    cwe: 'CWE-89',
    owasp: 'A03',
    remediation: 'Passe { replacements } e use :placeholders em vez de interpolar a SQL.',
    exts: JS_TS,
    test: (l) => /sequelize\.query\s*\(/.test(l) && hasInterpolation(l) && !/replacements/.test(l)
  },
  {
    id: 'jpa-query-concat',
    level: 'critical',
    title: 'ORM SQLi: @Query JPA com concatenação de string',
    category: 'orm-sqli',
    cwe: 'CWE-89',
    owasp: 'A03',
    remediation: 'Use parâmetros :param/?1 no @Query em vez de concatenar com +.',
    exts: JAVA,
    test: (l, c) => (/@Query/.test(l) && l.includes('+')) || (/@Query/.test(c.prev) && l.includes('+') && /['"]/.test(l))
  },
  {
    id: 'spring-jdbctemplate-concat',
    level: 'critical',
    title: 'ORM SQLi: JdbcTemplate com SQL concatenado',
    category: 'orm-sqli',
    cwe: 'CWE-89',
    owasp: 'A03',
    remediation: 'Use jdbcTemplate.query(sql, args) com placeholders ? em vez de concatenar.',
    exts: JAVA,
    test: (l) => /jdbcTemplate\.(query|update|execute|queryForObject|queryForList)\s*\(/.test(l) && l.includes('+')
  },

  // ── Misconfiguração de segurança web ──────────────────────────────────────────
  {
    id: 'spring-csrf-disabled',
    level: 'high',
    title: 'Web Misconfig: CSRF desabilitado (Spring Security)',
    category: 'web-misconfig',
    cwe: 'CWE-352',
    owasp: 'A01',
    remediation: 'Mantenha CSRF habilitado; desabilite apenas para APIs stateless com tokens.',
    exts: JAVA,
    test: (l, c) => /\.csrf\s*\(\s*\)\s*\.disable\s*\(/.test(l) || (/\.csrf\b/.test(c.prev) && /\.disable\s*\(/.test(l)) || /csrf\([^)]*\)\.disable/.test(l)
  },
  {
    id: 'spring-permitall-broad',
    level: 'medium',
    title: 'Web Misconfig: permitAll() em rota (revisar escopo)',
    category: 'web-misconfig',
    cwe: 'CWE-285',
    owasp: 'A01',
    remediation: 'Garanta que permitAll() cobre apenas rotas públicas (login, health, assets).',
    exts: JAVA,
    test: (l) => /\.permitAll\s*\(\s*\)/.test(l) && !/(login|public|health|actuator|swagger|css|js|static|assets|favicon)/i.test(l)
  },
  {
    id: 'nestjs-public-decorator',
    level: 'medium',
    title: 'Web Misconfig: @Public() expõe rota sem autenticação',
    category: 'web-misconfig',
    cwe: 'CWE-306',
    owasp: 'A01',
    remediation: 'Confirme que a rota marcada @Public() realmente deve ignorar o AuthGuard.',
    exts: JS_TS,
    test: (l) => /^\s*@Public\s*\(\s*\)/.test(l)
  },
  {
    id: 'express-cors-credentials-wildcard',
    level: 'high',
    title: 'Web Misconfig: CORS com credentials + origin dinâmico',
    category: 'web-misconfig',
    cwe: 'CWE-942',
    owasp: 'A05',
    remediation: 'Não combine credentials:true com origin refletido; use allowlist explícita.',
    exts: JS_TS,
    test: (l) => /credentials\s*:\s*true/.test(l) && /origin\s*:\s*(req|true|function|\()/.test(l)
  },

  // ── APIs inseguras / deprecadas ───────────────────────────────────────────────
  {
    id: 'node-child-process-exec-interp',
    level: 'critical',
    title: 'Insecure API: child_process.exec com interpolação (command injection)',
    category: 'insecure-api',
    cwe: 'CWE-78',
    owasp: 'A03',
    remediation: 'Use execFile/spawn com array de argumentos em vez de exec(string).',
    exts: JS_TS,
    test: (l) => /\b(child_process\.)?execSync?\s*\(/.test(l) && hasInterpolation(l)
  },
  {
    id: 'react-dangerously-set-innerhtml',
    level: 'high',
    title: 'Insecure API: dangerouslySetInnerHTML (risco de XSS)',
    category: 'insecure-api',
    cwe: 'CWE-79',
    owasp: 'A03',
    remediation: 'Sanitize o HTML (ex.: DOMPurify) antes de injetar, ou renderize como texto.',
    exts: JS_TS,
    test: (l) => /dangerouslySetInnerHTML/.test(l)
  },
  {
    id: 'node-crypto-createcipher',
    level: 'high',
    title: 'Insecure API: crypto.createCipher (deprecado, sem IV)',
    category: 'insecure-api',
    cwe: 'CWE-327',
    owasp: 'A02',
    remediation: 'Use crypto.createCipheriv(algo, key, iv) com IV aleatório.',
    exts: JS_TS,
    test: (l) => /crypto\.(createCipher|createDecipher)\s*\(/.test(l) && !/createCipheriv|createDecipheriv/.test(l)
  },
  {
    id: 'node-bodyparser-deprecated',
    level: 'low',
    title: 'Deprecated API: body-parser standalone (use express.json())',
    category: 'insecure-api',
    cwe: 'CWE-477',
    remediation: "Substitua por express.json()/express.urlencoded() embutidos.",
    exts: JS_TS,
    test: (l) => /require\(\s*['"]body-parser['"]\s*\)/.test(l) || /from\s+['"]body-parser['"]/.test(l)
  }
];

/**
 * Detecta vulnerabilidades específicas de framework. Lê apenas arquivos de código.
 */
export function detectFrameworkRisks(files: ScannedFile[]): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  for (const file of files) {
    if (!ALL.has(file.extension)) continue;
    let content: string;
    try { content = fs.readFileSync(file.absolutePath, 'utf8'); }
    catch { continue; }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // ignora linhas comentadas (// ou *) — reduz falso positivo
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
      const ctx = { prev: lines[i - 1] ?? '', next: lines[i + 1] ?? '' };

      for (const rule of RULES) {
        if (!rule.exts.has(file.extension)) continue;
        let matched = false;
        try { matched = rule.test(line, ctx); } catch { matched = false; }
        if (!matched) continue;
        findings.push({
          level: rule.level,
          title: rule.title,
          file: file.relativePath,
          line: i + 1,
          detail: rule.remediation,
          ruleId: rule.id,
          category: rule.category,
          cwe: rule.cwe,
          owasp: rule.owasp,
          remediation: rule.remediation
        });
      }
    }
  }

  // dedupe por ruleId+arquivo+linha
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.ruleId}|${f.file}|${f.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Relatório markdown agrupado por categoria. */
export function formatSecurityFindings(findings: SecurityFinding[]): string {
  const lines: string[] = ['# Security Findings — Detectores por Framework (TIC Analyzer)', ''];
  if (findings.length === 0) {
    lines.push('> Nenhuma vulnerabilidade específica de framework detectada. ✅', '');
    return lines.join('\n');
  }

  const byCat: Record<SecurityCategory, SecurityFinding[]> = { 'orm-sqli': [], 'web-misconfig': [], 'insecure-api': [] };
  for (const f of findings) byCat[f.category].push(f);

  const labels: Record<SecurityCategory, string> = {
    'orm-sqli': 'ORM / SQL Injection',
    'web-misconfig': 'Misconfiguração de Segurança Web',
    'insecure-api': 'APIs Inseguras / Deprecadas'
  };

  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.level]++;
  lines.push(`> ${findings.length} achados — 🔴 ${counts.critical} críticos, 🟠 ${counts.high} altos, 🟡 ${counts.medium} médios, ⚪ ${counts.low} baixos.`, '');

  for (const cat of Object.keys(byCat) as SecurityCategory[]) {
    const items = byCat[cat];
    if (items.length === 0) continue;
    lines.push(`## ${labels[cat]} (${items.length})`, '');
    lines.push('| Nível | Regra | OWASP/CWE | Arquivo | Linha | Remediação |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const f of items) {
      const tag = [f.owasp, f.cwe].filter(Boolean).join(' / ');
      lines.push(`| ${f.level} | ${f.title.replace(/\|/g, '/')} | ${tag} | \`${f.file}\` | ${f.line ?? ''} | ${(f.remediation ?? '').replace(/\|/g, '/')} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
