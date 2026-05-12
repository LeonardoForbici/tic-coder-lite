/**
 * Parsers para arquivos de build Java: pom.xml e build.gradle.
 * Usa somente leitura de arquivo — nunca executa Maven/Gradle.
 */

import type { DepEvidenceRef, DependencyEntry } from './dependencyImpactTypes';

// ─── POM XML ─────────────────────────────────────────────────────────────────

export interface JavaBuildInfo {
  runtimeVersion?: string;
  sourceCompatibility?: string;
  targetCompatibility?: string;
  releaseVersion?: string;
  springBootVersion?: string;
  mavenCompilerSource?: string;
  mavenCompilerTarget?: string;
  mavenCompilerRelease?: string;
  gradleWrapperVersion?: string;
  mavenWrapperVersion?: string;
  javaToolchainVersion?: string;
  dependencies: DependencyEntry[];
  plugins: DependencyEntry[];
  evidenceRefs: DepEvidenceRef[];
}

export function parseJavaBuildInfo(contents: Map<string, string>): JavaBuildInfo {
  const info: JavaBuildInfo = {
    dependencies: [],
    plugins: [],
    evidenceRefs: []
  };

  for (const [file, content] of contents) {
    const isPom = file.endsWith('pom.xml');
    const isGradle = file.endsWith('build.gradle') || file.endsWith('build.gradle.kts');
    const isGradleProps = file.endsWith('gradle.properties');
    const isMavenWrapper = file.endsWith('maven-wrapper.properties');
    const isGradleWrapper = file.endsWith('gradle-wrapper.properties');

    if (isPom) {
      extractPomInfo(file, content, info);
    } else if (isGradle) {
      extractGradleInfo(file, content, info);
    } else if (isGradleProps) {
      extractGradleProperties(file, content, info);
    } else if (isMavenWrapper) {
      extractMavenWrapper(file, content, info);
    } else if (isGradleWrapper) {
      extractGradleWrapper(file, content, info);
    }
  }

  return info;
}

function extractPomInfo(file: string, content: string, info: JavaBuildInfo): void {
  const ref = (matchedText: string, line?: number): DepEvidenceRef => ({
    filePath: file,
    line,
    matchedText,
    confidence: 'CONFIRMED',
    reason: 'Extraído de pom.xml'
  });

  // Spring Boot parent version
  const sbParent = content.match(/<parent>[\s\S]*?<artifactId>spring-boot-starter-parent<\/artifactId>[\s\S]*?<version>([\d.\-\w]+)<\/version>/);
  if (sbParent) {
    info.springBootVersion = sbParent[1];
    info.evidenceRefs.push(ref(`spring-boot-starter-parent ${sbParent[1]}`));
  }

  // Spring Boot BOM
  const sbBom = content.match(/<artifactId>spring-boot-dependencies<\/artifactId>\s*<version>([\d.\-\w]+)<\/version>/);
  if (sbBom && !info.springBootVersion) {
    info.springBootVersion = sbBom[1];
    info.evidenceRefs.push(ref(`spring-boot-dependencies ${sbBom[1]}`));
  }

  // maven.compiler properties
  const srcCompat = content.match(/<maven\.compiler\.source>([\d.]+)<\/maven\.compiler\.source>/);
  if (srcCompat) {
    info.mavenCompilerSource = srcCompat[1];
    info.evidenceRefs.push(ref(`maven.compiler.source=${srcCompat[1]}`));
  }

  const tgtCompat = content.match(/<maven\.compiler\.target>([\d.]+)<\/maven\.compiler\.target>/);
  if (tgtCompat) {
    info.mavenCompilerTarget = tgtCompat[1];
    info.evidenceRefs.push(ref(`maven.compiler.target=${tgtCompat[1]}`));
  }

  const releaseCompat = content.match(/<maven\.compiler\.release>([\d.]+)<\/maven\.compiler\.release>/);
  if (releaseCompat) {
    info.mavenCompilerRelease = releaseCompat[1];
    info.evidenceRefs.push(ref(`maven.compiler.release=${releaseCompat[1]}`));
  }

  // java.version property
  const javaVersion = content.match(/<java\.version>([\d.]+)<\/java\.version>/);
  if (javaVersion) {
    if (!info.runtimeVersion) info.runtimeVersion = javaVersion[1];
    info.evidenceRefs.push(ref(`java.version=${javaVersion[1]}`));
  }

  // maven-compiler-plugin configuration
  const compilerPlugin = content.match(/<artifactId>maven-compiler-plugin<\/artifactId>[\s\S]*?<\/plugin>/);
  if (compilerPlugin) {
    const src = compilerPlugin[0].match(/<source>([\d.]+)<\/source>/);
    const tgt = compilerPlugin[0].match(/<target>([\d.]+)<\/target>/);
    const rel = compilerPlugin[0].match(/<release>([\d.]+)<\/release>/);
    if (src) { info.mavenCompilerSource = info.mavenCompilerSource ?? src[1]; info.evidenceRefs.push(ref(`compiler source=${src[1]}`)); }
    if (tgt) { info.mavenCompilerTarget = info.mavenCompilerTarget ?? tgt[1]; info.evidenceRefs.push(ref(`compiler target=${tgt[1]}`)); }
    if (rel) { info.mavenCompilerRelease = info.mavenCompilerRelease ?? rel[1]; info.evidenceRefs.push(ref(`compiler release=${rel[1]}`)); }
  }

  // Toolchain
  const toolchain = content.match(/<version>([\d.]+)<\/version>[\s\S]{0,50}<vendor>/);
  void toolchain; // toolchain detection is complex, skip for now

  // Dependencies
  const depSection = content.match(/<dependencies>([\s\S]*?)<\/dependencies>/);
  if (depSection) {
    const depBlocks = depSection[1].match(/<dependency>[\s\S]*?<\/dependency>/g) ?? [];
    for (const block of depBlocks) {
      const gid = block.match(/<groupId>(.*?)<\/groupId>/)?.[1];
      const aid = block.match(/<artifactId>(.*?)<\/artifactId>/)?.[1];
      const ver = block.match(/<version>(.*?)<\/version>/)?.[1];
      const scope = block.match(/<scope>(.*?)<\/scope>/)?.[1];
      if (gid && aid) {
        info.dependencies.push({
          name: `${gid}:${aid}`,
          version: ver ?? '?',
          scope,
          evidenceRefs: [ref(`${gid}:${aid}:${ver ?? '?'}`)]
        });
      }
    }
  }

  // Plugins
  const pluginSection = content.match(/<plugins>([\s\S]*?)<\/plugins>/);
  if (pluginSection) {
    const pluginBlocks = pluginSection[1].match(/<plugin>[\s\S]*?<\/plugin>/g) ?? [];
    for (const block of pluginBlocks) {
      const gid = block.match(/<groupId>(.*?)<\/groupId>/)?.[1];
      const aid = block.match(/<artifactId>(.*?)<\/artifactId>/)?.[1];
      const ver = block.match(/<version>(.*?)<\/version>/)?.[1];
      if (aid) {
        info.plugins.push({
          name: gid ? `${gid}:${aid}` : aid,
          version: ver ?? '?',
          evidenceRefs: [ref(`plugin:${gid ?? ''}:${aid}`)]
        });
      }
    }
  }

  // Resolve runtime version from compiler settings
  if (!info.runtimeVersion) {
    info.runtimeVersion =
      info.mavenCompilerRelease ??
      info.mavenCompilerSource ??
      info.mavenCompilerTarget;
  }
}

function extractGradleInfo(file: string, content: string, info: JavaBuildInfo): void {
  const ref = (matchedText: string): DepEvidenceRef => ({
    filePath: file,
    matchedText,
    confidence: 'CONFIRMED',
    reason: 'Extraído de build.gradle'
  });

  // sourceCompatibility / targetCompatibility
  const src = content.match(/sourceCompatibility\s*=?\s*['"]?([\d.]+)['"]?/);
  if (src) {
    info.sourceCompatibility = src[1];
    info.evidenceRefs.push(ref(`sourceCompatibility = ${src[1]}`));
  }

  const tgt = content.match(/targetCompatibility\s*=?\s*['"]?([\d.]+)['"]?/);
  if (tgt) {
    info.targetCompatibility = tgt[1];
    info.evidenceRefs.push(ref(`targetCompatibility = ${tgt[1]}`));
  }

  // release option
  const rel = content.match(/release\s*=\s*['"]?([\d.]+)['"]?/);
  if (rel) {
    info.releaseVersion = rel[1];
    info.evidenceRefs.push(ref(`release = ${rel[1]}`));
  }

  // Java toolchain
  const toolchain = content.match(/languageVersion\s*=\s*JavaLanguageVersion\.of\((\d+)\)/);
  if (toolchain) {
    info.javaToolchainVersion = toolchain[1];
    info.evidenceRefs.push(ref(`JavaLanguageVersion.of(${toolchain[1]})`));
  }

  // Spring Boot plugin
  const sbPlugin = content.match(/id\s*[\(\s]['"]org\.springframework\.boot['"]\)?[\s\S]*?version\s+['"]([^'"]+)['"]/);
  if (sbPlugin) {
    info.springBootVersion = sbPlugin[1];
    info.evidenceRefs.push(ref(`spring-boot plugin ${sbPlugin[1]}`));
  }

  // Resolve runtime version
  if (!info.runtimeVersion) {
    info.runtimeVersion =
      info.javaToolchainVersion ??
      info.releaseVersion ??
      info.sourceCompatibility ??
      info.targetCompatibility;
  }

  // Dependencies (simplified regex for Groovy/Kotlin DSL)
  const depMatches = content.matchAll(/(?:implementation|api|compileOnly|testImplementation|runtimeOnly)\s*[('"]([^'"()]+)['"]/g);
  for (const m of depMatches) {
    const parts = m[1].split(':');
    if (parts.length >= 2) {
      info.dependencies.push({
        name: `${parts[0]}:${parts[1]}`,
        version: parts[2] ?? '?',
        evidenceRefs: [ref(m[1])]
      });
    }
  }
}

function extractGradleProperties(file: string, content: string, info: JavaBuildInfo): void {
  const ref = (matchedText: string): DepEvidenceRef => ({
    filePath: file,
    matchedText,
    confidence: 'CONFIRMED',
    reason: 'Extraído de gradle.properties'
  });

  const javaV = content.match(/sourceCompatibility\s*=\s*([\d.]+)/);
  if (javaV && !info.runtimeVersion) {
    info.runtimeVersion = javaV[1];
    info.evidenceRefs.push(ref(`sourceCompatibility=${javaV[1]}`));
  }
}

function extractMavenWrapper(file: string, content: string, info: JavaBuildInfo): void {
  const match = content.match(/distributionUrl=.*?\/apache-maven-([\d.]+)/);
  if (match) {
    info.mavenWrapperVersion = match[1];
    info.evidenceRefs.push({ filePath: file, matchedText: `maven ${match[1]}`, confidence: 'CONFIRMED', reason: 'maven-wrapper.properties' });
  }
}

function extractGradleWrapper(file: string, content: string, info: JavaBuildInfo): void {
  const match = content.match(/distributionUrl=.*?\/gradle-([\d.]+)/);
  if (match) {
    info.gradleWrapperVersion = match[1];
    info.evidenceRefs.push({ filePath: file, matchedText: `gradle ${match[1]}`, confidence: 'CONFIRMED', reason: 'gradle-wrapper.properties' });
  }
}
