/**
 * Gera plano de migração incremental com base na mudança solicitada.
 * Baseado em heurísticas e evidências locais — nenhuma internet.
 */

import type {
  AffectedDependency,
  CompatibilityFinding,
  DependencyBaseline,
  DependencyChangeRequest
} from './dependencyImpactTypes';
import { normalizeJavaVersion, normalizeMajorVersion } from './detectRuntimeVersions';

export function generateMigrationSteps(
  request: DependencyChangeRequest,
  baselines: DependencyBaseline[],
  findings: CompatibilityFinding[],
  affectedDependencies: AffectedDependency[]
): string[] {
  switch (request.ecosystem) {
    case 'java': return generateJavaMigrationSteps(request, baselines, findings, affectedDependencies);
    case 'node': return generateNodeMigrationSteps(request, baselines, findings, affectedDependencies);
    case 'python': return generatePythonMigrationSteps(request, baselines, findings, affectedDependencies);
    case 'infra': return generateInfraMigrationSteps(request, baselines);
    default: return generateGenericMigrationSteps(request);
  }
}

function generateJavaMigrationSteps(
  request: DependencyChangeRequest,
  baselines: DependencyBaseline[],
  findings: CompatibilityFinding[],
  affectedDependencies: AffectedDependency[]
): string[] {
  const fromV = normalizeJavaVersion(request.fromVersion) ?? 0;
  const toV = normalizeJavaVersion(request.toVersion) ?? 0;
  const steps: string[] = [];

  steps.push('## Plano de Migração Java');
  steps.push('');
  steps.push('### 1. Preparação');
  steps.push('- [ ] Criar branch de migração dedicada');
  steps.push('- [ ] Documentar versão atual e comprometer baseline');
  steps.push('- [ ] Garantir cobertura de testes antes de iniciar');
  steps.push('- [ ] Verificar ferramentas de build (Maven/Gradle) são compatíveis com o target');
  steps.push('');

  // Incremental strategy for large jumps
  if (toV - fromV >= 6) {
    steps.push('### 2. Estratégia Incremental (recomendado)');
    const milestones = getJavaMilestones(fromV, toV);
    steps.push(`> Migração direta ${fromV} → ${toV} é alto risco. Estratégia incremental recomendada:`);
    steps.push('');
    for (let i = 0; i < milestones.length - 1; i++) {
      steps.push(`- [ ] Etapa ${i + 1}: Java ${milestones[i]} → Java ${milestones[i + 1]}`);
      steps.push(`  - Atualizar pom.xml/build.gradle sourceCompatibility/targetCompatibility para ${milestones[i + 1]}`);
      steps.push('  - Rodar build e testes');
      steps.push('  - Corrigir erros de compilação');
      steps.push('  - Validar runtime em ambiente de staging');
      steps.push('');
    }
  }

  // Spring Boot
  const springBootFindings = findings.filter((f) => /spring.*boot/i.test(f.title));
  if (springBootFindings.length > 0) {
    steps.push('### 3. Spring Boot');
    for (const baseline of baselines) {
      const sbVersion = baseline.frameworkVersions['spring-boot'];
      if (sbVersion && normalizeMajorVersion(sbVersion) === 2) {
        steps.push(`- [ ] Atualizar Spring Boot de ${sbVersion} para 3.x`);
        steps.push('- [ ] Migrar javax.* para jakarta.* em todos os imports');
        steps.push('- [ ] Atualizar dependências transicionais (Hibernate 6, Flyway 9, etc.)');
        steps.push('- [ ] Verificar configurações de security (Spring Security 6 tem breaking changes)');
      }
    }
    steps.push('');
  }

  // Affected dependencies
  if (affectedDependencies.length > 0) {
    steps.push('### 4. Dependências Críticas');
    for (const dep of affectedDependencies.slice(0, 10)) {
      steps.push(`- [ ] **${dep.name}** (atual: ${dep.currentVersion})`);
      steps.push(`  - Problema: ${dep.issue}`);
      steps.push(`  - Ação: ${dep.action}`);
    }
    steps.push('');
  }

  // Build tools
  steps.push('### 5. Build Tools');
  for (const baseline of baselines) {
    if (baseline.buildTools.includes('Maven')) {
      steps.push('- [ ] Atualizar maven-compiler-plugin para 3.11+');
      steps.push(`- [ ] Definir <maven.compiler.release>${toV}</maven.compiler.release> em pom.xml`);
      steps.push('- [ ] Atualizar maven-wrapper.properties para Maven 3.9+');
    }
    if (baseline.buildTools.includes('Gradle')) {
      steps.push('- [ ] Atualizar gradle-wrapper.properties para Gradle 8+');
      steps.push(`- [ ] Definir toolchain JavaLanguageVersion.of(${toV}) em build.gradle`);
    }
  }
  steps.push('');

  steps.push('### 6. Docker e CI/CD');
  steps.push(`- [ ] Atualizar Dockerfile: FROM eclipse-temurin:${toV}-jre-alpine`);
  steps.push(`- [ ] Atualizar GitHub Actions: java-version: '${toV}'`);
  steps.push(`- [ ] Atualizar Jenkinsfile / GitLab CI para Java ${toV}`);
  steps.push('');

  steps.push('### 7. Validação');
  steps.push('- [ ] Rodar build completo (mvn clean install / gradle build)');
  steps.push('- [ ] Rodar suite de testes unitários e de integração');
  steps.push('- [ ] Testar em ambiente de staging');
  steps.push('- [ ] Validar logs de startup e runtime');
  steps.push('- [ ] Verificar métricas de performance (GC, memory)');
  steps.push('');

  return steps;
}

function generateNodeMigrationSteps(
  request: DependencyChangeRequest,
  baselines: DependencyBaseline[],
  _findings: CompatibilityFinding[],
  affectedDependencies: AffectedDependency[]
): string[] {
  const toV = normalizeMajorVersion(request.toVersion) ?? 0;
  const steps: string[] = [];

  steps.push('## Plano de Migração Node.js / React');
  steps.push('');
  steps.push('### 1. Preparação');
  steps.push('- [ ] Criar branch de migração dedicada');
  steps.push('- [ ] Garantir cobertura de testes');
  steps.push('- [ ] Verificar .nvmrc ou .node-version existente');
  steps.push('');

  steps.push(`### 2. Atualizar Node.js para ${toV}`);
  steps.push(`- [ ] Atualizar .nvmrc: echo '${toV}' > .nvmrc`);
  steps.push(`- [ ] Atualizar engines.node em package.json para >=${toV}`);
  steps.push('- [ ] Atualizar docker/CI para usar node:' + toV);
  steps.push('');

  if (affectedDependencies.length > 0) {
    steps.push('### 3. Dependências Críticas');
    for (const dep of affectedDependencies.slice(0, 10)) {
      steps.push(`- [ ] **${dep.name}** → ${dep.action}`);
    }
    steps.push('');
  }

  const hasNodeSass = baselines.some((b) => [...b.dependencies, ...b.devDependencies].some((d) => d.name === 'node-sass'));
  if (hasNodeSass) {
    steps.push('### 4. node-sass → sass');
    steps.push('- [ ] npm uninstall node-sass');
    steps.push('- [ ] npm install sass');
    steps.push('- [ ] Verificar configuração de webpack/vite');
    steps.push('');
  }

  steps.push('### 5. Validação');
  steps.push('- [ ] npm install (clean)');
  steps.push('- [ ] npm run build');
  steps.push('- [ ] npm test');
  steps.push('- [ ] Testar em ambiente de staging');
  steps.push('');

  return steps;
}

function generatePythonMigrationSteps(
  request: DependencyChangeRequest,
  _baselines: DependencyBaseline[],
  findings: CompatibilityFinding[],
  _affectedDependencies: AffectedDependency[]
): string[] {
  const toV = normalizeMajorVersion(request.toVersion) ?? 0;
  const steps: string[] = [];

  steps.push('## Plano de Migração Python');
  steps.push('');
  steps.push('### 1. Preparação');
  steps.push('- [ ] Criar branch de migração dedicada');
  steps.push('- [ ] Garantir que requirements.txt/pyproject.toml estão atualizados');
  steps.push('- [ ] Verificar cobertura de testes');
  steps.push('');

  steps.push(`### 2. Atualizar Python para ${request.toVersion}`);
  steps.push(`- [ ] Instalar Python ${request.toVersion}`);
  steps.push(`- [ ] Atualizar .python-version: echo '${request.toVersion}' > .python-version`);
  steps.push(`- [ ] Atualizar runtime.txt: python-${request.toVersion}`);
  steps.push(`- [ ] Atualizar Dockerfile: FROM python:${request.toVersion}-slim`);
  steps.push('');

  if (toV >= 12) {
    steps.push('### 3. Adaptações Python 3.12+');
    const hasDistutils = findings.some((f) => /distutils/i.test(f.title));
    if (hasDistutils) {
      steps.push('- [ ] Substituir distutils por setuptools em todos os arquivos');
    }
    const hasImp = findings.some((f) => /\bimp\b/i.test(f.title));
    if (hasImp) {
      steps.push('- [ ] Substituir import imp por importlib');
    }
    steps.push('- [ ] Verificar dependências com wheels para Python 3.12+');
    steps.push('- [ ] pip install --upgrade pip setuptools wheel');
    steps.push('');
  }

  steps.push('### 4. Validação');
  steps.push('- [ ] pip install -r requirements.txt (clean venv)');
  steps.push('- [ ] python -m pytest');
  steps.push('- [ ] Testar em ambiente de staging');
  steps.push('');

  return steps;
}

function generateInfraMigrationSteps(
  request: DependencyChangeRequest,
  _baselines: DependencyBaseline[]
): string[] {
  return [
    '## Plano de Migração Infra',
    '',
    '### 1. Docker',
    `- [ ] Atualizar imagem base no Dockerfile para ${request.toVersion}`,
    '- [ ] Testar build da imagem',
    '- [ ] Testar container em staging',
    '',
    '### 2. CI/CD',
    `- [ ] Atualizar versão do runtime no pipeline CI/CD para ${request.toVersion}`,
    '- [ ] Rodar pipeline completo em branch de migração',
    '',
    '### 3. Validação',
    '- [ ] Deploy em staging',
    '- [ ] Validar métricas e logs',
    '- [ ] Rollback pronto se necessário',
    ''
  ];
}

function generateGenericMigrationSteps(request: DependencyChangeRequest): string[] {
  return [
    `## Plano de Migração: ${request.fromName} ${request.fromVersion} → ${request.toVersion}`,
    '',
    '### 1. Preparação',
    '- [ ] Documentar estado atual',
    '- [ ] Criar branch de migração',
    '- [ ] Revisar changelog e breaking changes da nova versão',
    '',
    '### 2. Atualização',
    `- [ ] Atualizar ${request.fromName} para ${request.toVersion}`,
    '- [ ] Rodar build',
    '- [ ] Corrigir erros',
    '',
    '### 3. Validação',
    '- [ ] Rodar testes',
    '- [ ] Testar em staging',
    '- [ ] Deploy gradual (canary/blue-green)',
    ''
  ];
}

function getJavaMilestones(fromV: number, toV: number): number[] {
  const milestones = [8, 11, 17, 21, 25].filter((v) => v >= fromV && v <= toV);
  if (milestones[0] !== fromV) milestones.unshift(fromV);
  if (milestones[milestones.length - 1] !== toV) milestones.push(toV);
  return milestones;
}

export function generateRequiredTests(
  request: DependencyChangeRequest,
  findings: CompatibilityFinding[]
): string[] {
  const tests: string[] = [];
  const { ecosystem } = request;

  if (ecosystem === 'java') {
    tests.push('Rodar todos os testes unitários (mvn test / gradle test)');
    tests.push('Rodar testes de integração');
    if (findings.some((f) => /spring.*boot/i.test(f.title))) {
      tests.push('Testar endpoints REST da aplicação');
      tests.push('Verificar inicialização do contexto Spring (@SpringBootTest)');
    }
    if (findings.some((f) => /database|sql|jdbc/i.test(f.title))) {
      tests.push('Testar conexão com banco de dados');
      tests.push('Verificar execução de SQL/PLSQL crítico');
    }
    if (findings.some((f) => /reflection|setAccessible/i.test(f.title))) {
      tests.push('Testar módulos que usam reflection extensivamente');
    }
    if (findings.some((f) => /jaxb|xml\.bind/i.test(f.title))) {
      tests.push('Testar serialização/deserialização XML (JAXB)');
    }
  }

  if (ecosystem === 'node') {
    tests.push('Rodar npm test / yarn test');
    tests.push('Verificar build de produção (npm run build)');
    if (findings.some((f) => /react/i.test(f.title))) {
      tests.push('Testar componentes React críticos');
      tests.push('Verificar renderização SSR se aplicável (Next.js)');
    }
  }

  if (ecosystem === 'python') {
    tests.push('Rodar python -m pytest (ambiente limpo)');
    tests.push('Verificar importações críticas');
  }

  tests.push('Testar em ambiente de staging antes de produção');
  tests.push('Monitorar logs após deploy');

  return tests;
}
