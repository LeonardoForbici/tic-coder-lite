/**
 * Parsers para manifests Python: pyproject.toml, requirements.txt, Pipfile, setup.py, runtime.txt.
 * Usa somente leitura de arquivo — nunca executa pip/poetry/pipenv.
 */

import type { DepEvidenceRef, DependencyEntry } from './dependencyImpactTypes';

export interface PythonManifestInfo {
  pythonVersion?: string;
  djangoVersion?: string;
  fastapiVersion?: string;
  flaskVersion?: string;
  poetryVersion?: string;
  hasPoetry: boolean;
  hasPipenv: boolean;
  hasSetupPy: boolean;
  hasPyprojectToml: boolean;
  hasRequirementsTxt: boolean;
  pythonRequires?: string;
  dependencies: DependencyEntry[];
  devDependencies: DependencyEntry[];
  evidenceRefs: DepEvidenceRef[];
}

export function parsePythonManifests(contents: Map<string, string>): PythonManifestInfo {
  const info: PythonManifestInfo = {
    hasPoetry: false,
    hasPipenv: false,
    hasSetupPy: false,
    hasPyprojectToml: false,
    hasRequirementsTxt: false,
    dependencies: [],
    devDependencies: [],
    evidenceRefs: []
  };

  for (const [file, content] of contents) {
    const base = file.split('/').pop() ?? file;
    if (base === 'pyproject.toml') {
      info.hasPyprojectToml = true;
      extractPyproject(file, content, info);
    } else if (base === 'requirements.txt' || base.startsWith('requirements')) {
      info.hasRequirementsTxt = true;
      extractRequirementsTxt(file, content, info);
    } else if (base === 'Pipfile') {
      info.hasPipenv = true;
      extractPipfile(file, content, info);
    } else if (base === 'setup.py') {
      info.hasSetupPy = true;
      extractSetupPy(file, content, info);
    } else if (base === 'runtime.txt' || base === '.python-version') {
      const match = content.trim().match(/python-?([\d.]+)/i) ?? content.trim().match(/([\d.]+)/);
      if (match) {
        info.pythonVersion = info.pythonVersion ?? match[1];
        info.evidenceRefs.push({ filePath: file, matchedText: match[0], confidence: 'CONFIRMED', reason: `Python version em ${base}` });
      }
    }
  }

  return info;
}

function extractPyproject(file: string, content: string, info: PythonManifestInfo): void {
  const ref = (matchedText: string): DepEvidenceRef => ({ filePath: file, matchedText, confidence: 'CONFIRMED', reason: 'Extraído de pyproject.toml' });

  // python_requires
  const pyReq = content.match(/python_requires\s*=\s*["'](.*?)["']/);
  if (pyReq) {
    info.pythonRequires = pyReq[1];
    info.evidenceRefs.push(ref(`python_requires = ${pyReq[1]}`));
    const vMatch = pyReq[1].match(/([\d.]+)/);
    if (vMatch && !info.pythonVersion) info.pythonVersion = vMatch[1];
  }

  // poetry requires-python
  const pyPoetry = content.match(/python\s*=\s*["']([\^~>=\d. ,]+)["']/);
  if (pyPoetry) {
    info.evidenceRefs.push(ref(`poetry python = ${pyPoetry[1]}`));
    const vMatch = pyPoetry[1].match(/([\d.]+)/);
    if (vMatch && !info.pythonVersion) info.pythonVersion = vMatch[1];
    info.hasPoetry = true;
  }

  // Poetry tool section
  if (content.includes('[tool.poetry]')) {
    info.hasPoetry = true;
    info.evidenceRefs.push(ref('[tool.poetry]'));
  }

  // Dependencies from [tool.poetry.dependencies] or [project.dependencies]
  const depSection = content.match(/\[tool\.poetry\.dependencies\]([\s\S]*?)(?=\[|$)/);
  if (depSection) {
    extractTomlDeps(file, depSection[1], info.dependencies);
  }
  const devSection = content.match(/\[tool\.poetry\.dev-dependencies\]([\s\S]*?)(?=\[|$)/) ??
                     content.match(/\[tool\.poetry\.group\.dev\.dependencies\]([\s\S]*?)(?=\[|$)/);
  if (devSection) {
    extractTomlDeps(file, devSection[1], info.devDependencies);
  }

  // Detect known frameworks
  checkFrameworksInDeps([...info.dependencies, ...info.devDependencies], file, info);
}

function extractTomlDeps(file: string, section: string, out: DependencyEntry[]): void {
  const lines = section.split('\n');
  for (const line of lines) {
    const m = line.match(/^(\w[\w\-_]+)\s*=\s*["'{]?([\^~>=\d. ,*\w\-]+)/);
    if (m && m[1].toLowerCase() !== 'python') {
      out.push({
        name: m[1],
        version: m[2].trim(),
        evidenceRefs: [{ filePath: file, matchedText: line.trim(), confidence: 'CONFIRMED', reason: 'pyproject.toml' }]
      });
    }
  }
}

function extractRequirementsTxt(file: string, content: string, info: PythonManifestInfo): void {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
    const m = trimmed.match(/^([\w\-_]+)\s*([><=!~]+\s*[\d.]+)?/);
    if (m) {
      const dep: DependencyEntry = {
        name: m[1],
        version: m[2]?.replace(/\s/g, '') ?? '?',
        evidenceRefs: [{ filePath: file, matchedText: trimmed, confidence: 'CONFIRMED', reason: 'requirements.txt' }]
      };
      info.dependencies.push(dep);
    }
  }
  checkFrameworksInDeps(info.dependencies, file, info);
}

function extractPipfile(file: string, content: string, info: PythonManifestInfo): void {
  const pythonV = content.match(/python_version\s*=\s*["']([\d.]+)["']/);
  if (pythonV) {
    info.pythonVersion = info.pythonVersion ?? pythonV[1];
    info.evidenceRefs.push({ filePath: file, matchedText: `python_version = ${pythonV[1]}`, confidence: 'CONFIRMED', reason: 'Pipfile' });
  }

  const depSection = content.match(/\[packages\]([\s\S]*?)(?=\[|$)/);
  if (depSection) {
    const lines = depSection[1].split('\n');
    for (const line of lines) {
      const m = line.match(/^([\w\-_]+)\s*=\s*["'*]?([\^~>=\d. ,*]+)?/);
      if (m && m[1]) {
        info.dependencies.push({
          name: m[1],
          version: m[2]?.trim() ?? '*',
          evidenceRefs: [{ filePath: file, matchedText: line.trim(), confidence: 'CONFIRMED', reason: 'Pipfile [packages]' }]
        });
      }
    }
  }
  checkFrameworksInDeps(info.dependencies, file, info);
}

function extractSetupPy(file: string, content: string, info: PythonManifestInfo): void {
  const pyReq = content.match(/python_requires\s*=\s*["'](.*?)["']/);
  if (pyReq) {
    info.pythonRequires = info.pythonRequires ?? pyReq[1];
    info.evidenceRefs.push({ filePath: file, matchedText: `python_requires=${pyReq[1]}`, confidence: 'CONFIRMED', reason: 'setup.py' });
    const vMatch = pyReq[1].match(/([\d.]+)/);
    if (vMatch && !info.pythonVersion) info.pythonVersion = vMatch[1];
  }
  // install_requires list
  const reqMatch = content.match(/install_requires\s*=\s*\[([\s\S]*?)\]/);
  if (reqMatch) {
    const items = reqMatch[1].match(/["']([\w\-_>=<!\s.]+)["']/g) ?? [];
    for (const item of items) {
      const clean = item.replace(/["']/g, '').trim();
      const m = clean.match(/^([\w\-_]+)/);
      if (m) {
        info.dependencies.push({
          name: m[1],
          version: clean.slice(m[1].length).trim() || '?',
          evidenceRefs: [{ filePath: file, matchedText: clean, confidence: 'CONFIRMED', reason: 'setup.py install_requires' }]
        });
      }
    }
  }
  checkFrameworksInDeps(info.dependencies, file, info);
}

function checkFrameworksInDeps(deps: DependencyEntry[], file: string, info: PythonManifestInfo): void {
  for (const dep of deps) {
    const n = dep.name.toLowerCase();
    if (n === 'django' && !info.djangoVersion) {
      info.djangoVersion = dep.version;
      info.evidenceRefs.push({ filePath: file, matchedText: `django@${dep.version}`, confidence: 'CONFIRMED', reason: 'Framework Django detectado' });
    }
    if (n === 'fastapi' && !info.fastapiVersion) {
      info.fastapiVersion = dep.version;
      info.evidenceRefs.push({ filePath: file, matchedText: `fastapi@${dep.version}`, confidence: 'CONFIRMED', reason: 'Framework FastAPI detectado' });
    }
    if (n === 'flask' && !info.flaskVersion) {
      info.flaskVersion = dep.version;
      info.evidenceRefs.push({ filePath: file, matchedText: `flask@${dep.version}`, confidence: 'CONFIRMED', reason: 'Framework Flask detectado' });
    }
  }
}
