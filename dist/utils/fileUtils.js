"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeRelativePath = normalizeRelativePath;
exports.countLines = countLines;
exports.isProbablyBinary = isProbablyBinary;
exports.matchesAnyPattern = matchesAnyPattern;
exports.yieldToEventLoop = yieldToEventLoop;
const path = __importStar(require("node:path"));
function normalizeRelativePath(value) {
    return value.split(path.sep).join('/');
}
function countLines(content) {
    if (content.length === 0) {
        return 0;
    }
    const lineBreaks = content.match(/\r\n|\r|\n/g)?.length ?? 0;
    return lineBreaks + (/\r\n|\r|\n$/.test(content) ? 0 : 1);
}
function isProbablyBinary(buffer) {
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
function matchesAnyPattern(relativePath, patterns) {
    const normalized = normalizeRelativePath(relativePath);
    return patterns.some((pattern) => globToRegExp(pattern).test(normalized));
}
function yieldToEventLoop() {
    return new Promise((resolve) => setImmediate(resolve));
}
function globToRegExp(pattern) {
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
//# sourceMappingURL=fileUtils.js.map