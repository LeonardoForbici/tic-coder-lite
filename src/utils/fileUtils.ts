import * as path from 'node:path';

export function normalizeRelativePath(value: string): string {
  return value.split(path.sep).join('/');
}

export function countLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }

  const lineBreaks = content.match(/\r\n|\r|\n/g)?.length ?? 0;
  return lineBreaks + (/\r\n|\r|\n$/.test(content) ? 0 : 1);
}

export function isProbablyBinary(buffer: Buffer): boolean {
  if (buffer.length === 0) {
    return false;
  }

  if (buffer.includes(0)) {
    return true;
  }

  let suspicious = 0;
  for (const byte of buffer) {
    const isControl = byte < 7 || (byte > 13 && byte < 32);
    if (isControl) {
      suspicious += 1;
    }
  }

  return suspicious / buffer.length > 0.3;
}

export function matchesAnyPattern(relativePath: string, patterns: string[]): boolean {
  const normalized = normalizeRelativePath(relativePath);
  return patterns.some((pattern) => globToRegExp(pattern).test(normalized));
}

export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function globToRegExp(pattern: string): RegExp {
  const normalized = normalizeRelativePath(pattern.trim());
  if (!normalized || normalized === '**/*' || normalized === '**') {
    return /^.*$/;
  }

  let source = '';
  let startIndex = 0;
  if (normalized.startsWith('**/')) {
    source = '(?:.*/)?';
    startIndex = 3;
  }

  for (let index = startIndex; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === '*' && next === '*') {
      source += '.*';
      index += 1;
      continue;
    }

    if (char === '*') {
      source += '[^/]*';
      continue;
    }

    if ('\\^$+?.()|{}[]'.includes(char)) {
      source += `\\${char}`;
      continue;
    }

    source += char;
  }

  return new RegExp(`^${source}$`, 'i');
}
