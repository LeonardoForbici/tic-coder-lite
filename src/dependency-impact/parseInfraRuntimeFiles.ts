/**
 * Parsers para arquivos de infraestrutura: Dockerfile, docker-compose, CI (GitHub Actions, Jenkinsfile, GitLab CI).
 * Usa somente leitura de arquivo — nunca executa Docker ou CI.
 */

import type { InfraRuntimeInfo } from './dependencyImpactTypes';

export function parseInfraRuntimeFiles(contents: Map<string, string>): InfraRuntimeInfo {
  const info: InfraRuntimeInfo = {
    dockerBaseImages: [],
    evidenceRefs: []
  };

  for (const [file, content] of contents) {
    const lower = file.toLowerCase();
    const base = file.split('/').pop()?.toLowerCase() ?? '';

    if (base === 'dockerfile' || base.startsWith('dockerfile.')) {
      extractDockerfile(file, content, info);
    } else if (base.includes('docker-compose') && (base.endsWith('.yml') || base.endsWith('.yaml'))) {
      extractDockerCompose(file, content, info);
    } else if (lower.includes('.github/workflows') && (base.endsWith('.yml') || base.endsWith('.yaml'))) {
      extractGitHubActions(file, content, info);
    } else if (base === 'jenkinsfile' || base === 'jenkinsfile.groovy') {
      extractJenkinsfile(file, content, info);
    } else if (base === '.gitlab-ci.yml' || base === '.gitlab-ci.yaml') {
      extractGitLabCI(file, content, info);
    } else if (base === 'nixpacks.toml' || base === 'railway.toml') {
      extractRailway(file, content, info);
    }
  }

  return info;
}

function extractDockerfile(file: string, content: string, info: InfraRuntimeInfo): void {
  const fromLines = [...content.matchAll(/^FROM\s+([\w\-/:@.]+)/gim)];
  for (const m of fromLines) {
    const image = m[1];
    if (!info.dockerBaseImages.includes(image)) {
      info.dockerBaseImages.push(image);
      info.evidenceRefs.push({ filePath: file, matchedText: `FROM ${image}`, confidence: 'CONFIRMED', reason: 'Docker base image' });
    }
    // Detect Java version in FROM
    const javaM = image.match(/(?:openjdk|eclipse-temurin|amazoncorretto|liberica|zulu)[:-](\d+)/i);
    if (javaM && !info.ciJavaVersion) {
      info.ciJavaVersion = javaM[1];
      info.evidenceRefs.push({ filePath: file, matchedText: `Docker Java ${javaM[1]}`, confidence: 'CONFIRMED', reason: 'Java em Docker base image' });
    }
    // Detect Node version
    const nodeM = image.match(/^node:(\d+(?:\.\d+)?)/i);
    if (nodeM && !info.ciNodeVersion) {
      info.ciNodeVersion = nodeM[1];
      info.evidenceRefs.push({ filePath: file, matchedText: `Docker Node ${nodeM[1]}`, confidence: 'CONFIRMED', reason: 'Node em Docker base image' });
    }
    // Detect Python version
    const pythonM = image.match(/^python:([\d.]+)/i);
    if (pythonM && !info.ciPythonVersion) {
      info.ciPythonVersion = pythonM[1];
      info.evidenceRefs.push({ filePath: file, matchedText: `Docker Python ${pythonM[1]}`, confidence: 'CONFIRMED', reason: 'Python em Docker base image' });
    }
  }

  // ARG/ENV for java/node/python versions
  extractEnvVersions(file, content, info);
}

function extractDockerCompose(file: string, content: string, info: InfraRuntimeInfo): void {
  const imageMatches = [...content.matchAll(/image:\s*([\w\-/:@.]+)/gi)];
  for (const m of imageMatches) {
    const image = m[1];
    if (!info.dockerBaseImages.includes(image)) {
      info.dockerBaseImages.push(image);
      info.evidenceRefs.push({ filePath: file, matchedText: `image: ${image}`, confidence: 'CONFIRMED', reason: 'docker-compose service image' });
    }
    const javaM = image.match(/(?:openjdk|eclipse-temurin|amazoncorretto)[:-](\d+)/i);
    if (javaM && !info.ciJavaVersion) {
      info.ciJavaVersion = javaM[1];
      info.evidenceRefs.push({ filePath: file, matchedText: `Java ${javaM[1]}`, confidence: 'CONFIRMED', reason: 'Java em docker-compose' });
    }
  }
}

function extractGitHubActions(file: string, content: string, info: InfraRuntimeInfo): void {
  // java-version
  const javaV = [...content.matchAll(/java-version\s*:\s*['"]?([\d.]+)['"]?/g)];
  for (const m of javaV) {
    if (!info.ciJavaVersion) {
      info.ciJavaVersion = m[1];
      info.evidenceRefs.push({ filePath: file, matchedText: `java-version: ${m[1]}`, confidence: 'CONFIRMED', reason: 'GitHub Actions setup-java' });
    }
  }
  // node-version
  const nodeV = [...content.matchAll(/node-version\s*:\s*['"]?([\d.x]+)['"]?/g)];
  for (const m of nodeV) {
    if (!info.ciNodeVersion) {
      info.ciNodeVersion = m[1];
      info.evidenceRefs.push({ filePath: file, matchedText: `node-version: ${m[1]}`, confidence: 'CONFIRMED', reason: 'GitHub Actions setup-node' });
    }
  }
  // python-version
  const pythonV = [...content.matchAll(/python-version\s*:\s*['"]?([\d.x]+)['"]?/g)];
  for (const m of pythonV) {
    if (!info.ciPythonVersion) {
      info.ciPythonVersion = m[1];
      info.evidenceRefs.push({ filePath: file, matchedText: `python-version: ${m[1]}`, confidence: 'CONFIRMED', reason: 'GitHub Actions setup-python' });
    }
  }
}

function extractJenkinsfile(file: string, content: string, info: InfraRuntimeInfo): void {
  const jdkTool = content.match(/jdk\s*['"]([^'"]+)['"]/i) ?? content.match(/tool\s+['"]jdk['"]\s*:\s*['"]([^'"]+)['"]/i);
  if (jdkTool) {
    info.evidenceRefs.push({ filePath: file, matchedText: jdkTool[0], confidence: 'INFERRED', reason: 'JDK tool em Jenkinsfile' });
  }
  // image from agent docker
  const dockerAgent = content.match(/docker\s*['"]([^'"]+)['"]/);
  if (dockerAgent) {
    const image = dockerAgent[1];
    if (!info.dockerBaseImages.includes(image)) {
      info.dockerBaseImages.push(image);
      info.evidenceRefs.push({ filePath: file, matchedText: `docker ${image}`, confidence: 'INFERRED', reason: 'Docker agent em Jenkinsfile' });
    }
  }
}

function extractGitLabCI(file: string, content: string, info: InfraRuntimeInfo): void {
  const imageMatches = [...content.matchAll(/^image:\s*([\w\-/:@.]+)/gim)];
  for (const m of imageMatches) {
    const image = m[1];
    if (!info.dockerBaseImages.includes(image)) {
      info.dockerBaseImages.push(image);
      info.evidenceRefs.push({ filePath: file, matchedText: `image: ${image}`, confidence: 'CONFIRMED', reason: 'GitLab CI image' });
    }
    const javaM = image.match(/(?:openjdk|eclipse-temurin)[:-](\d+)/i);
    if (javaM && !info.ciJavaVersion) {
      info.ciJavaVersion = javaM[1];
      info.evidenceRefs.push({ filePath: file, matchedText: `Java ${javaM[1]}`, confidence: 'CONFIRMED', reason: 'Java em GitLab CI image' });
    }
  }
}

function extractRailway(file: string, content: string, info: InfraRuntimeInfo): void {
  const nodeV = content.match(/NODE_VERSION\s*=\s*['"]?([\d.]+)/i);
  if (nodeV && !info.ciNodeVersion) {
    info.ciNodeVersion = nodeV[1];
    info.evidenceRefs.push({ filePath: file, matchedText: `NODE_VERSION=${nodeV[1]}`, confidence: 'CONFIRMED', reason: 'Node em Railway/Nixpacks' });
  }
  const pythonV = content.match(/PYTHON_VERSION\s*=\s*['"]?([\d.]+)/i);
  if (pythonV && !info.ciPythonVersion) {
    info.ciPythonVersion = pythonV[1];
    info.evidenceRefs.push({ filePath: file, matchedText: `PYTHON_VERSION=${pythonV[1]}`, confidence: 'CONFIRMED', reason: 'Python em Railway/Nixpacks' });
  }
}

function extractEnvVersions(file: string, content: string, info: InfraRuntimeInfo): void {
  const javaEnv = content.match(/(?:ENV|ARG)\s+JAVA_VERSION[=\s]+([\d.]+)/i);
  if (javaEnv && !info.ciJavaVersion) {
    info.ciJavaVersion = javaEnv[1];
    info.evidenceRefs.push({ filePath: file, matchedText: `JAVA_VERSION=${javaEnv[1]}`, confidence: 'CONFIRMED', reason: 'JAVA_VERSION env em Dockerfile' });
  }
  const nodeEnv = content.match(/(?:ENV|ARG)\s+NODE_VERSION[=\s]+([\d.]+)/i);
  if (nodeEnv && !info.ciNodeVersion) {
    info.ciNodeVersion = nodeEnv[1];
    info.evidenceRefs.push({ filePath: file, matchedText: `NODE_VERSION=${nodeEnv[1]}`, confidence: 'CONFIRMED', reason: 'NODE_VERSION env em Dockerfile' });
  }
  const pythonEnv = content.match(/(?:ENV|ARG)\s+PYTHON_VERSION[=\s]+([\d.]+)/i);
  if (pythonEnv && !info.ciPythonVersion) {
    info.ciPythonVersion = pythonEnv[1];
    info.evidenceRefs.push({ filePath: file, matchedText: `PYTHON_VERSION=${pythonEnv[1]}`, confidence: 'CONFIRMED', reason: 'PYTHON_VERSION env em Dockerfile' });
  }
}
