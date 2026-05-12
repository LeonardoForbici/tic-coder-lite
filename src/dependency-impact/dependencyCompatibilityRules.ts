/**
 * Regras de compatibilidade heurísticas para detecção de riscos de migração.
 * Baseadas em evidências locais do workspace — nenhum acesso à internet.
 *
 * Cada regra recebe o contexto da mudança + baseline e retorna findings com confidence.
 */

import type {
  AffectedDependency,
  CompatibilityFinding,
  DependencyBaseline,
  DependencyChangeRequest,
  DependencyImpactLevel,
  DepEvidenceRef
} from './dependencyImpactTypes';
import { normalizeJavaVersion, normalizeMajorVersion } from './detectRuntimeVersions';

export interface RuleContext {
  request: DependencyChangeRequest;
  baselines: DependencyBaseline[];
  sourceCodeSignals: SourceCodeSignal[];
}

export interface SourceCodeSignal {
  file: string;
  pattern: string;
  context: string;
  line?: number;
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

export function evaluateCompatibilityRules(ctx: RuleContext): {
  findings: CompatibilityFinding[];
  affectedDependencies: AffectedDependency[];
} {
  const findings: CompatibilityFinding[] = [];
  const affectedDependencies: AffectedDependency[] = [];

  const { request, baselines } = ctx;

  switch (request.ecosystem) {
    case 'java':
      findings.push(...evaluateJavaRules(ctx, baselines));
      affectedDependencies.push(...evaluateJavaDependencies(ctx, baselines));
      break;
    case 'node':
      findings.push(...evaluateNodeRules(ctx, baselines));
      affectedDependencies.push(...evaluateNodeDependencies(ctx, baselines));
      break;
    case 'python':
      findings.push(...evaluatePythonRules(ctx, baselines));
      affectedDependencies.push(...evaluatePythonDependencies(ctx, baselines));
      break;
    case 'infra':
      findings.push(...evaluateInfraRules(ctx, baselines));
      break;
    case 'database':
      findings.push(...evaluateDatabaseRules(ctx, baselines));
      break;
    default:
      break;
  }

  // Source code signals → findings
  findings.push(...evaluateSourceCodeSignals(ctx));

  return { findings, affectedDependencies };
}

// ─── Java Rules ──────────────────────────────────────────────────────────────

function evaluateJavaRules(ctx: RuleContext, baselines: DependencyBaseline[]): CompatibilityFinding[] {
  const findings: CompatibilityFinding[] = [];
  const { request } = ctx;

  const fromV = normalizeJavaVersion(request.fromVersion);
  const toV = normalizeJavaVersion(request.toVersion);
  if (fromV === undefined || toV === undefined) return findings;

  const gap = toV - fromV;

  // Direct Java major version jump
  if (gap >= 10) {
    findings.push({
      category: 'language-runtime',
      title: `Salto grande de versão Java: ${fromV} → ${toV}`,
      description: `Salto de ${gap} versões maiores. Migração direta sem estratégia incremental é alto risco. Java 8→11→17→21/25 é recomendado.`,
      severity: 'CRITICAL',
      confidence: 'CONFIRMED',
      evidenceRefs: buildEvidenceFromBaselines(baselines, 'language-runtime'),
      recommendedAction: `Migrar incrementalmente: Java ${fromV} → ${nextJavaMilestone(fromV)} → ... → ${toV}. Validar cada etapa.`
    });
  } else if (gap >= 4) {
    findings.push({
      category: 'language-runtime',
      title: `Salto de versão Java: ${fromV} → ${toV}`,
      description: `Salto de ${gap} versões. Algumas APIs podem ter sido removidas ou depreciadas.`,
      severity: 'HIGH',
      confidence: 'CONFIRMED',
      evidenceRefs: buildEvidenceFromBaselines(baselines, 'language-runtime'),
      recommendedAction: `Verificar APIs removidas entre Java ${fromV} e ${toV}. Preferir migração incremental.`
    });
  }

  // Java 9+ module system (if from < 9 to >= 9)
  if (fromV < 9 && toV >= 9) {
    findings.push({
      category: 'language-runtime',
      title: 'Modularização Java 9 (Project Jigsaw)',
      description: 'O Java 9 introduziu o sistema de módulos. Reflection e acesso a APIs internas pode quebrar.',
      severity: 'HIGH',
      confidence: 'CONFIRMED',
      evidenceRefs: buildEvidenceFromBaselines(baselines, 'source-code'),
      recommendedAction: 'Verificar uso de --add-opens/--add-exports. Testar reflection.'
    });
  }

  // JAXB/JAX-WS removal (from < 11 to >= 11)
  if (fromV < 11 && toV >= 11) {
    const hasJaxb = baselines.some((b) => b.dependencies.some((d) => /jaxb|jax-ws|javax\.xml\.bind/i.test(d.name)));
    findings.push({
      category: 'dependency',
      title: 'JAXB/JAX-WS removidos do JDK a partir do Java 11',
      description: hasJaxb
        ? 'Dependência JAXB/JAX-WS detectada no projeto. Será necessário adicionar dependências explícitas.'
        : 'JAXB/JAX-WS foram removidos do JDK no Java 11. Se usados, adicionar dependências explícitas.',
      severity: hasJaxb ? 'HIGH' : 'MEDIUM',
      confidence: hasJaxb ? 'CONFIRMED' : 'INFERRED',
      evidenceRefs: buildEvidenceFromBaselines(baselines, 'dependency'),
      recommendedAction: 'Adicionar jakarta.xml.bind-api e implementação (glassfish-jaxb ou similar).'
    });
  }

  // SecurityManager removal (Java 17+ deprecated, 21+ warning, 25 removed)
  if (toV >= 17) {
    const hasSecMgr = ctx.sourceCodeSignals.some((s) => /SecurityManager|setSecurityManager/i.test(s.pattern));
    if (hasSecMgr) {
      findings.push({
        category: 'source-code',
        title: 'SecurityManager depreciado/removido',
        description: 'Uso de SecurityManager detectado. Depreciado no Java 17, removido no Java 21+.',
        severity: toV >= 21 ? 'CRITICAL' : 'HIGH',
        confidence: 'CONFIRMED',
        evidenceRefs: signalsToRefs(ctx.sourceCodeSignals, /SecurityManager/i),
        recommendedAction: 'Remover dependência de SecurityManager e substituir por mecanismo moderno.'
      });
    }
  }

  // Spring Boot compatibility
  for (const baseline of baselines) {
    const sbVersion = baseline.frameworkVersions['spring-boot'];
    if (sbVersion) {
      const sbMajor = normalizeMajorVersion(sbVersion) ?? 0;
      if (toV >= 17 && sbMajor < 3) {
        findings.push({
          category: 'framework',
          title: `Spring Boot ${sbVersion} incompatível com Java ${toV}`,
          description: `Spring Boot ${sbVersion} não suporta Java ${toV}. Spring Boot 3.x requer Java 17+.`,
          severity: 'CRITICAL',
          confidence: 'CONFIRMED',
          evidenceRefs: baseline.evidenceRefs.slice(0, 3),
          recommendedAction: 'Atualizar Spring Boot para 3.x antes de ou junto com a migração para Java 17+.'
        });
      }
      if (toV >= 17 && sbMajor === 2) {
        findings.push({
          category: 'framework',
          title: 'Spring Boot 2.x: javax → jakarta pode ser necessário',
          description: 'Spring Boot 3 migrou de javax.* para jakarta.*. Se migrar Spring Boot junto, revisar todos os imports.',
          severity: 'HIGH',
          confidence: 'INFERRED',
          evidenceRefs: baseline.evidenceRefs.slice(0, 3),
          recommendedAction: 'Planejar migração javax→jakarta. Usar ferramenta de refactoring ou sed.'
        });
      }
    }

    // Old Lombok
    const lombokVersion = baseline.dependencies.find((d) => /lombok/i.test(d.name))?.version;
    if (lombokVersion && toV >= 17) {
      const lombokMajor = normalizeMajorVersion(lombokVersion) ?? 99;
      if (lombokMajor < 1) {
        findings.push({
          category: 'dependency',
          title: `Lombok ${lombokVersion} pode ser incompatível com Java ${toV}`,
          description: 'Versões antigas de Lombok têm problemas com Java 17+. Versão 1.18.22+ é recomendada.',
          severity: 'HIGH',
          confidence: 'INFERRED',
          evidenceRefs: baseline.evidenceRefs.filter((r) => /lombok/i.test(r.matchedText ?? '')).slice(0, 3),
          recommendedAction: 'Atualizar Lombok para 1.18.30+.'
        });
      }
    }

    // Old Maven plugins
    const oldPlugins = baseline.plugins.filter((p) => {
      const v = normalizeMajorVersion(p.version) ?? 99;
      return /maven-compiler-plugin/i.test(p.name) && v < 3;
    });
    if (oldPlugins.length > 0) {
      findings.push({
        category: 'plugin',
        title: 'maven-compiler-plugin desatualizado',
        description: `Versão ${oldPlugins[0].version} detectada. Versões antigas podem não suportar Java ${toV}.`,
        severity: 'MEDIUM',
        confidence: 'CONFIRMED',
        evidenceRefs: oldPlugins[0].evidenceRefs.slice(0, 2),
        recommendedAction: 'Atualizar maven-compiler-plugin para 3.11+.'
      });
    }

    // Old JUnit/Mockito
    const junitV = baseline.dependencies.find((d) => /junit/i.test(d.name) && !/vintage/i.test(d.name));
    if (junitV && (normalizeMajorVersion(junitV.version) ?? 0) < 5) {
      findings.push({
        category: 'test',
        title: `JUnit ${junitV.version} pode precisar de atualização`,
        description: 'JUnit 4 funciona com Java moderno via vintage runner, mas JUnit 5 é recomendado.',
        severity: 'MEDIUM',
        confidence: 'INFERRED',
        evidenceRefs: junitV.evidenceRefs.slice(0, 2),
        recommendedAction: 'Considerar migrar para JUnit 5.'
      });
    }
  }

  // Java 25 specific
  if (toV >= 25) {
    findings.push({
      category: 'language-runtime',
      title: 'Java 25: 32-bit x86 removido',
      description: 'O JDK 25 remove suporte a 32-bit x86. Verificar ambiente de deploy.',
      severity: 'MEDIUM',
      confidence: 'CONFIRMED',
      evidenceRefs: [],
      recommendedAction: 'Validar ambiente de produção (64-bit apenas).'
    });
  }

  // Source/target compatibility mismatch
  for (const baseline of baselines) {
    const srcCompat = baseline.frameworkVersions['maven.compiler.source'] ??
      baseline.dependencies.find((d) => /maven-compiler-plugin/i.test(d.name))?.version;
    void srcCompat;
    const evidenceForCompiler = baseline.evidenceRefs.filter((r) =>
      /sourceCompatibility|targetCompatibility|compiler\.source|compiler\.target/i.test(r.matchedText ?? '')
    );
    if (evidenceForCompiler.length > 0) {
      findings.push({
        category: 'build-tool',
        title: 'sourceCompatibility/targetCompatibility precisam de atualização',
        description: `Build files contêm configuração de compatibilidade que pode precisar ser atualizada para Java ${toV}.`,
        severity: 'MEDIUM',
        confidence: 'CONFIRMED',
        evidenceRefs: evidenceForCompiler.slice(0, 3),
        recommendedAction: `Atualizar sourceCompatibility/targetCompatibility para ${toV} ou usar --release ${toV}.`
      });
    }
  }

  return findings;
}

function evaluateJavaDependencies(ctx: RuleContext, baselines: DependencyBaseline[]): AffectedDependency[] {
  const { request } = ctx;
  const toV = normalizeJavaVersion(request.toVersion) ?? 0;
  const out: AffectedDependency[] = [];

  for (const baseline of baselines) {
    for (const dep of baseline.dependencies) {
      const n = dep.name.toLowerCase();

      // JAXB
      if (/javax\.xml\.bind|jaxb|jax-ws/i.test(n)) {
        out.push({
          name: dep.name, currentVersion: dep.version,
          issue: 'JAXB/JAX-WS removido do JDK no Java 11+',
          severity: 'HIGH', confidence: 'CONFIRMED',
          evidenceRefs: dep.evidenceRefs,
          action: 'Adicionar jakarta.xml.bind-api explicitamente'
        });
      }
      // sun.misc / com.sun internal
      if (/sun\.misc|com\.sun\.internal/i.test(n)) {
        out.push({
          name: dep.name, currentVersion: dep.version,
          issue: 'API interna sun.misc pode ser inacessível no Java moderno',
          severity: 'HIGH', confidence: 'CONFIRMED',
          evidenceRefs: dep.evidenceRefs,
          action: 'Substituir por API pública equivalente'
        });
      }
      // Old Spring Boot with new Java
      if (/spring-boot/i.test(n) && toV >= 17) {
        const sbMajor = normalizeMajorVersion(dep.version) ?? 0;
        if (sbMajor < 3) {
          out.push({
            name: dep.name, currentVersion: dep.version,
            issue: `Spring Boot ${dep.version} não suporta Java ${toV}`,
            severity: 'CRITICAL', confidence: 'CONFIRMED',
            evidenceRefs: dep.evidenceRefs,
            action: 'Atualizar Spring Boot para 3.x'
          });
        }
      }
      // Old JDBC drivers
      if (/ojdbc|mysql-connector|postgresql/i.test(n)) {
        const v = normalizeMajorVersion(dep.version) ?? 99;
        if (n.includes('ojdbc') && v < 12) {
          out.push({
            name: dep.name, currentVersion: dep.version,
            issue: 'Driver JDBC Oracle antigo pode não suportar Java moderno',
            severity: 'HIGH', confidence: 'INFERRED',
            evidenceRefs: dep.evidenceRefs,
            action: 'Atualizar para ojdbc11 ou ojdbc17'
          });
        }
      }
    }
  }
  return out;
}

// ─── Node/React Rules ─────────────────────────────────────────────────────────

function evaluateNodeRules(ctx: RuleContext, baselines: DependencyBaseline[]): CompatibilityFinding[] {
  const findings: CompatibilityFinding[] = [];
  const { request } = ctx;

  const fromV = normalizeMajorVersion(request.fromVersion) ?? 0;
  const toV = normalizeMajorVersion(request.toVersion) ?? 0;

  if (fromV > 0 && toV > fromV) {
    const gap = toV - fromV;
    // Node major upgrade
    if (gap >= 6) {
      findings.push({
        category: 'language-runtime',
        title: `Node.js ${fromV} → ${toV}: mudança significativa`,
        description: `Salto de ${gap} versões maiores. Verificar engines em package.json, node-sass, pacotes nativos.`,
        severity: gap >= 10 ? 'HIGH' : 'MEDIUM',
        confidence: 'CONFIRMED',
        evidenceRefs: buildEvidenceFromBaselines(baselines, 'language-runtime'),
        recommendedAction: 'Revisar engines.node, testar pacotes nativos, atualizar node-gyp.'
      });
    }

    // OpenSSL change (Node 17+)
    if (fromV < 17 && toV >= 17) {
      findings.push({
        category: 'language-runtime',
        title: 'Node 17+: mudança de OpenSSL padrão',
        description: 'Node 17+ usa OpenSSL 3 por padrão. Builds com webpack 4/5 antigos podem precisar de --openssl-legacy-provider.',
        severity: 'MEDIUM',
        confidence: 'INFERRED',
        evidenceRefs: buildEvidenceFromBaselines(baselines, 'build-tool'),
        recommendedAction: 'Atualizar webpack/vite ou adicionar NODE_OPTIONS=--openssl-legacy-provider.'
      });
    }
  }

  // React version changes
  for (const baseline of baselines) {
    const reactV = baseline.frameworkVersions['react'];
    if (reactV && request.changeType !== 'runtime') {
      const reactMajor = normalizeMajorVersion(reactV) ?? 0;
      const toReact = normalizeMajorVersion(request.toVersion) ?? 0;
      if (reactMajor < 18 && toReact >= 18) {
        findings.push({
          category: 'framework',
          title: 'React 18: ReactDOM.render removido',
          description: 'React 18 removeu ReactDOM.render. Usar createRoot(). Strict Mode mais restrito.',
          severity: 'HIGH',
          confidence: 'CONFIRMED',
          evidenceRefs: baseline.evidenceRefs.filter((r) => /react/i.test(r.matchedText ?? '')).slice(0, 3),
          recommendedAction: 'Substituir ReactDOM.render por ReactDOM.createRoot(). Atualizar testing-library.'
        });
      }
    }

    // node-sass → dart-sass
    const hasNodeSass = baseline.dependencies.some((d) => d.name === 'node-sass') ||
                        baseline.devDependencies.some((d) => d.name === 'node-sass');
    if (hasNodeSass && toV >= 18) {
      findings.push({
        category: 'dependency',
        title: 'node-sass não suporta Node 18+',
        description: 'node-sass é baseado em libsass (abandonado). Não funciona com Node 18+.',
        severity: 'HIGH',
        confidence: 'CONFIRMED',
        evidenceRefs: buildEvidenceFromBaselines(baselines, 'dependency'),
        recommendedAction: 'Substituir node-sass por sass (dart-sass).'
      });
    }

    // Webpack 4 with modern Node
    const webpackV = baseline.frameworkVersions['webpack'];
    if (webpackV && normalizeMajorVersion(webpackV) === 4 && toV >= 18) {
      findings.push({
        category: 'build-tool',
        title: `Webpack ${webpackV} com Node ${toV}`,
        description: 'Webpack 4 pode ter problemas de compatibilidade com Node 18+.',
        severity: 'MEDIUM',
        confidence: 'INFERRED',
        evidenceRefs: baseline.evidenceRefs.filter((r) => /webpack/i.test(r.matchedText ?? '')).slice(0, 3),
        recommendedAction: 'Atualizar para Webpack 5 ou migrar para Vite.'
      });
    }

    // Enzyme (testing library)
    const hasEnzyme = baseline.devDependencies.some((d) => /^enzyme$/i.test(d.name));
    if (hasEnzyme) {
      findings.push({
        category: 'test',
        title: 'Enzyme pode não suportar React 18+',
        description: 'Enzyme não tem suporte oficial a React 18. Considerar @testing-library/react.',
        severity: 'MEDIUM',
        confidence: 'CONFIRMED',
        evidenceRefs: buildEvidenceFromBaselines(baselines, 'test'),
        recommendedAction: 'Migrar de Enzyme para @testing-library/react.'
      });
    }
  }

  // Source code signals
  const hasReactDomRender = ctx.sourceCodeSignals.some((s) => /ReactDOM\.render/i.test(s.pattern));
  if (hasReactDomRender) {
    findings.push({
      category: 'source-code',
      title: 'ReactDOM.render detectado no código',
      description: 'ReactDOM.render foi removido no React 18. Substituir por createRoot().',
      severity: 'HIGH',
      confidence: 'CONFIRMED',
      evidenceRefs: signalsToRefs(ctx.sourceCodeSignals, /ReactDOM\.render/i),
      recommendedAction: 'Substituir ReactDOM.render(element, container) por createRoot(container).render(element).'
    });
  }

  return findings;
}

function evaluateNodeDependencies(ctx: RuleContext, baselines: DependencyBaseline[]): AffectedDependency[] {
  const { request } = ctx;
  const toV = normalizeMajorVersion(request.toVersion) ?? 0;
  const out: AffectedDependency[] = [];

  for (const baseline of baselines) {
    for (const dep of [...baseline.dependencies, ...baseline.devDependencies]) {
      const n = dep.name.toLowerCase();
      if (n === 'node-sass' && toV >= 18) {
        out.push({ name: dep.name, currentVersion: dep.version, issue: 'node-sass incompatível com Node 18+', severity: 'HIGH', confidence: 'CONFIRMED', evidenceRefs: dep.evidenceRefs, action: 'Substituir por sass' });
      }
      if (n === 'webpack' && (normalizeMajorVersion(dep.version) ?? 0) < 5 && toV >= 18) {
        out.push({ name: dep.name, currentVersion: dep.version, issue: 'Webpack 4 pode ter problemas com Node 18+', severity: 'MEDIUM', confidence: 'INFERRED', evidenceRefs: dep.evidenceRefs, action: 'Atualizar para Webpack 5' });
      }
    }
  }
  return out;
}

// ─── Python Rules ────────────────────────────────────────────────────────────

function evaluatePythonRules(ctx: RuleContext, baselines: DependencyBaseline[]): CompatibilityFinding[] {
  const findings: CompatibilityFinding[] = [];
  const { request } = ctx;

  const fromV = normalizeMajorVersion(request.fromVersion) ?? 0;
  const toV = normalizeMajorVersion(request.toVersion) ?? 0;

  if (fromV > 0 && toV > fromV) {
    // distutils removed in 3.12
    if (fromV < 12 && toV >= 12) {
      const hasDistutils = ctx.sourceCodeSignals.some((s) => /from\s+distutils|import\s+distutils/i.test(s.pattern));
      findings.push({
        category: 'language-runtime',
        title: 'distutils removido no Python 3.12',
        description: hasDistutils
          ? 'Uso de distutils detectado. distutils foi removido no Python 3.12.'
          : 'distutils foi removido no Python 3.12. Substituir por setuptools.',
        severity: hasDistutils ? 'CRITICAL' : 'MEDIUM',
        confidence: hasDistutils ? 'CONFIRMED' : 'INFERRED',
        evidenceRefs: hasDistutils
          ? signalsToRefs(ctx.sourceCodeSignals, /distutils/i)
          : buildEvidenceFromBaselines(baselines, 'language-runtime'),
        recommendedAction: 'Substituir distutils por setuptools ou packaging.'
      });

      // imp module removed
      const hasImp = ctx.sourceCodeSignals.some((s) => /import\s+imp\b|from\s+imp\b/i.test(s.pattern));
      if (hasImp) {
        findings.push({
          category: 'source-code',
          title: 'Módulo imp removido no Python 3.12',
          description: 'Uso de imp detectado. Substituir por importlib.',
          severity: 'HIGH',
          confidence: 'CONFIRMED',
          evidenceRefs: signalsToRefs(ctx.sourceCodeSignals, /import\s+imp\b/i),
          recommendedAction: 'Substituir imp por importlib.import_module.'
        });
      }
    }

    // Django compatibility
    for (const baseline of baselines) {
      const djangoV = baseline.frameworkVersions['django'];
      if (djangoV) {
        const djangoMajor = normalizeMajorVersion(djangoV) ?? 0;
        if (djangoMajor < 4 && toV >= 11) {
          findings.push({
            category: 'framework',
            title: `Django ${djangoV} e Python 3.${toV} compatibilidade`,
            description: `Django ${djangoMajor}.x pode não suportar Python 3.${toV}. Django 4.2+ é recomendado.`,
            severity: 'HIGH',
            confidence: 'INFERRED',
            evidenceRefs: baseline.evidenceRefs.filter((r) => /django/i.test(r.matchedText ?? '')).slice(0, 3),
            recommendedAction: `Atualizar Django para versão compatível com Python 3.${toV}.`
          });
        }
      }
    }

    // C extensions / binary wheels
    const hasSetupPy = baselines.some((b) => b.dependencies.some((d) => d.evidenceRefs.some((r) => r.filePath.endsWith('setup.py'))));
    if (hasSetupPy && toV >= 12) {
      findings.push({
        category: 'dependency',
        title: 'Possíveis extensões C detectadas (setup.py)',
        description: 'Extensões C podem precisar de recompilação para Python 3.12+.',
        severity: 'MEDIUM',
        confidence: 'INFERRED',
        evidenceRefs: buildEvidenceFromBaselines(baselines, 'dependency'),
        recommendedAction: 'Verificar se todas as dependências têm wheels para Python 3.12+.'
      });
    }
  }

  return findings;
}

function evaluatePythonDependencies(_ctx: RuleContext, baselines: DependencyBaseline[]): AffectedDependency[] {
  const out: AffectedDependency[] = [];
  for (const baseline of baselines) {
    for (const dep of baseline.dependencies) {
      const n = dep.name.toLowerCase();
      if (n === 'setuptools' && dep.version !== '?') {
        const v = normalizeMajorVersion(dep.version) ?? 99;
        if (v < 65) {
          out.push({ name: dep.name, currentVersion: dep.version, issue: 'setuptools antigo pode não funcionar com Python 3.12+', severity: 'MEDIUM', confidence: 'INFERRED', evidenceRefs: dep.evidenceRefs, action: 'Atualizar setuptools para 68+' });
        }
      }
    }
  }
  return out;
}

// ─── Infra Rules ─────────────────────────────────────────────────────────────

function evaluateInfraRules(ctx: RuleContext, baselines: DependencyBaseline[]): CompatibilityFinding[] {
  const findings: CompatibilityFinding[] = [];

  for (const baseline of baselines) {
    for (const image of baseline.infraRuntime.dockerBaseImages) {
      const javaM = image.match(/(?:openjdk|eclipse-temurin|amazoncorretto)[:-](\d+)/i);
      if (javaM) {
        const imgV = parseInt(javaM[1], 10);
        const toV = normalizeMajorVersion(ctx.request.toVersion) ?? 0;
        if (toV > 0 && imgV !== toV) {
          findings.push({
            category: 'infra',
            title: `Docker base image usa Java ${imgV}, destino é Java ${toV}`,
            description: `FROM ${image} — imagem precisa ser atualizada para Java ${toV}.`,
            severity: 'HIGH',
            confidence: 'CONFIRMED',
            evidenceRefs: baseline.infraRuntime.evidenceRefs.filter((r) => r.matchedText?.includes(image)).slice(0, 2),
            recommendedAction: `Atualizar FROM para eclipse-temurin:${toV}-jre-alpine ou similar.`
          });
        }
      }
    }

    if (baseline.infraRuntime.ciJavaVersion) {
      const ciV = parseInt(baseline.infraRuntime.ciJavaVersion, 10);
      const toV = normalizeMajorVersion(ctx.request.toVersion) ?? 0;
      if (toV > 0 && ciV !== toV) {
        findings.push({
          category: 'infra',
          title: `CI usa Java ${ciV}, destino é Java ${toV}`,
          description: 'Pipeline CI/CD precisa ser atualizado para usar a nova versão do Java.',
          severity: 'HIGH',
          confidence: 'CONFIRMED',
          evidenceRefs: baseline.infraRuntime.evidenceRefs.filter((r) => /java/i.test(r.matchedText ?? '')).slice(0, 3),
          recommendedAction: `Atualizar java-version em GitHub Actions / Jenkinsfile / CI para ${toV}.`
        });
      }
    }
  }

  return findings;
}

// ─── Database Rules ───────────────────────────────────────────────────────────

function evaluateDatabaseRules(_ctx: RuleContext, baselines: DependencyBaseline[]): CompatibilityFinding[] {
  const findings: CompatibilityFinding[] = [];
  for (const baseline of baselines) {
    const jdbcDrivers = baseline.dependencies.filter((d) => /ojdbc|mysql-connector|postgresql|jdbc/i.test(d.name));
    for (const driver of jdbcDrivers) {
      findings.push({
        category: 'database',
        title: `Driver JDBC ${driver.name} ${driver.version} a verificar`,
        description: 'Drivers JDBC antigos podem não ser compatíveis com novas versões do banco ou do Java.',
        severity: 'MEDIUM',
        confidence: 'INFERRED',
        evidenceRefs: driver.evidenceRefs,
        recommendedAction: `Verificar compatibilidade de ${driver.name} com a versão alvo.`
      });
    }
  }
  return findings;
}

// ─── Source Code Signals ─────────────────────────────────────────────────────

function evaluateSourceCodeSignals(ctx: RuleContext): CompatibilityFinding[] {
  const findings: CompatibilityFinding[] = [];
  const { sourceCodeSignals, request } = ctx;

  if (request.ecosystem === 'java') {
    // sun.misc / internal APIs
    const sunSignals = sourceCodeSignals.filter((s) => /import\s+sun\.misc|import\s+com\.sun\./i.test(s.pattern));
    if (sunSignals.length > 0) {
      findings.push({
        category: 'source-code',
        title: `sun.misc / internal APIs: ${sunSignals.length} uso(s) detectado(s)`,
        description: 'APIs internas sun.misc são inacessíveis no Java moderno sem --add-opens.',
        severity: 'HIGH',
        confidence: 'CONFIRMED',
        evidenceRefs: sunSignals.slice(0, 5).map((s) => ({ filePath: s.file, line: s.line, matchedText: s.pattern, confidence: 'CONFIRMED' as const, reason: 'import sun.misc' })),
        recommendedAction: 'Substituir por APIs públicas ou usar Unsafe via reflection com --add-opens.'
      });
    }

    // javax.xml.bind imports
    const jaxbSignals = sourceCodeSignals.filter((s) => /import\s+javax\.xml\.bind|import\s+javax\.ws\.rs/i.test(s.pattern));
    if (jaxbSignals.length > 0) {
      findings.push({
        category: 'source-code',
        title: `javax.xml.bind / javax.ws.rs: ${jaxbSignals.length} uso(s) detectado(s)`,
        description: 'Imports javax.xml.bind e javax.ws.rs precisam de dependência explícita no Java 11+.',
        severity: 'HIGH',
        confidence: 'CONFIRMED',
        evidenceRefs: jaxbSignals.slice(0, 5).map((s) => ({ filePath: s.file, line: s.line, matchedText: s.pattern, confidence: 'CONFIRMED' as const, reason: 'import javax.xml.bind' })),
        recommendedAction: 'Adicionar dependência jakarta.xml.bind-api ao pom.xml/build.gradle.'
      });
    }

    // setAccessible reflection
    const reflectSignals = sourceCodeSignals.filter((s) => /setAccessible\(true\)|getDeclaredField|getDeclaredMethod/i.test(s.pattern));
    if (reflectSignals.length > 0) {
      findings.push({
        category: 'source-code',
        title: `Reflection detectada: ${reflectSignals.length} uso(s)`,
        description: 'Java 9+ pode bloquear acesso reflection sem --add-opens. Java 17+ é mais restrito (strong encapsulation).',
        severity: 'MEDIUM',
        confidence: 'CONFIRMED',
        evidenceRefs: reflectSignals.slice(0, 5).map((s) => ({ filePath: s.file, line: s.line, matchedText: s.pattern, confidence: 'CONFIRMED' as const, reason: 'reflection' })),
        recommendedAction: 'Revisar uso de reflection. Verificar se --add-opens é necessário.'
      });
    }
  }

  return findings;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildEvidenceFromBaselines(baselines: DependencyBaseline[], _category: string): DepEvidenceRef[] {
  return baselines.flatMap((b) => b.evidenceRefs).slice(0, 5);
}

function signalsToRefs(signals: SourceCodeSignal[], pattern: RegExp): DepEvidenceRef[] {
  return signals
    .filter((s) => pattern.test(s.pattern))
    .slice(0, 5)
    .map((s) => ({ filePath: s.file, line: s.line, matchedText: s.pattern, confidence: 'CONFIRMED' as const, reason: `Padrão: ${s.pattern}` }));
}

function nextJavaMilestone(fromV: number): number {
  if (fromV < 11) return 11;
  if (fromV < 17) return 17;
  if (fromV < 21) return 21;
  return 25;
}

export type { CompatibilityFinding, AffectedDependency };
export type { DependencyImpactLevel };
