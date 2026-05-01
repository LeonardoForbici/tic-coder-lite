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
exports.scanFiles = scanFiles;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const fileUtils_1 = require("../utils/fileUtils");
const ignoreRules_1 = require("./ignoreRules");
const DEFAULT_CONFIG = {
    maxFiles: 10000,
    maxFileSizeKb: 512,
    include: ['**/*'],
    exclude: []
};
async function scanFiles(rootPath, options = {}) {
    const root = path.resolve(rootPath);
    const files = [];
    const stats = { filesSeen: 0, filesScanned: 0, filesSkipped: 0, fileLimitReported: false };
    const config = options.config ?? DEFAULT_CONFIG;
    await walkDirectory(root, root, files, stats, { ...options, config });
    options.onProgress?.({ filesSeen: stats.filesSeen, filesScanned: stats.filesScanned, filesSkipped: stats.filesSkipped });
    return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
async function walkDirectory(rootPath, currentPath, files, stats, options) {
    throwIfCancelled(options.token);
    let entries;
    try {
        entries = await fs.readdir(currentPath, { withFileTypes: true });
    }
    catch (error) {
        options.logger?.warn(`Cannot read directory: ${(0, fileUtils_1.normalizeRelativePath)(path.relative(rootPath, currentPath)) || '.'}`);
        options.logger?.error('Directory read failed.', error);
        return;
    }
    for (const entry of entries) {
        throwIfCancelled(options.token);
        if (entry.isDirectory()) {
            const directoryPath = path.join(currentPath, entry.name);
            const relativeDirectory = (0, fileUtils_1.normalizeRelativePath)(path.relative(rootPath, directoryPath));
            if ((0, ignoreRules_1.shouldIgnoreDirectory)(entry.name) || (0, fileUtils_1.matchesAnyPattern)(`${relativeDirectory}/`, options.config.exclude)) {
                continue;
            }
            await walkDirectory(rootPath, directoryPath, files, stats, options);
            continue;
        }
        if (!entry.isFile()) {
            continue;
        }
        const absolutePath = path.join(currentPath, entry.name);
        const relativePath = (0, fileUtils_1.normalizeRelativePath)(path.relative(rootPath, absolutePath));
        if (!(0, ignoreRules_1.isSupportedFile)(absolutePath) || !(0, fileUtils_1.matchesAnyPattern)(relativePath, options.config.include) || (0, fileUtils_1.matchesAnyPattern)(relativePath, options.config.exclude)) {
            continue;
        }
        stats.filesSeen += 1;
        if (files.length >= options.config.maxFiles) {
            stats.filesSkipped += 1;
            if (!stats.fileLimitReported) {
                stats.fileLimitReported = true;
                options.logger?.warn(`Scan file limit reached at ${options.config.maxFiles} files. Remaining files will be skipped.`);
            }
            continue;
        }
        const scanned = await scanFile(absolutePath, relativePath, options, stats);
        if (scanned) {
            files.push(scanned);
            stats.filesScanned += 1;
        }
        if ((stats.filesSeen + stats.filesSkipped) % 50 === 0) {
            options.onProgress?.({ ...stats, currentPath: relativePath });
            await (0, fileUtils_1.yieldToEventLoop)();
        }
    }
}
async function scanFile(absolutePath, relativePath, options, scanStats) {
    let stats;
    try {
        stats = await fs.stat(absolutePath);
    }
    catch (error) {
        scanStats.filesSkipped += 1;
        options.logger?.error(`Cannot stat file: ${relativePath}`, error);
        return undefined;
    }
    const maxBytes = options.config.maxFileSizeKb * 1024;
    if (stats.size > maxBytes) {
        scanStats.filesSkipped += 1;
        options.logger?.warn(`Skipped large file (${Math.ceil(stats.size / 1024)} KB): ${relativePath}`);
        return undefined;
    }
    const cached = options.previousFiles?.get(relativePath);
    if (cached?.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
        return { ...cached, cached: true };
    }
    const sample = await readSample(absolutePath);
    if (sample && (0, fileUtils_1.isProbablyBinary)(sample)) {
        scanStats.filesSkipped += 1;
        options.logger?.warn(`Skipped binary-like file: ${relativePath}`);
        return undefined;
    }
    let content;
    try {
        content = await fs.readFile(absolutePath, 'utf8');
    }
    catch (error) {
        scanStats.filesSkipped += 1;
        options.logger?.error(`Cannot read file: ${relativePath}`, error);
        return undefined;
    }
    return {
        relativePath,
        extension: path.extname(absolutePath).toLowerCase(),
        size: stats.size,
        lines: (0, fileUtils_1.countLines)(content),
        mtimeMs: stats.mtimeMs
    };
}
async function readSample(absolutePath) {
    let handle;
    try {
        handle = await fs.open(absolutePath, 'r');
        const buffer = Buffer.alloc(4096);
        const result = await handle.read(buffer, 0, buffer.length, 0);
        return buffer.subarray(0, result.bytesRead);
    }
    catch {
        return undefined;
    }
    finally {
        await handle?.close();
    }
}
function throwIfCancelled(token) {
    if (token?.isCancellationRequested) {
        throw new Error('TIC_CODER_LITE_CANCELLED');
    }
}
//# sourceMappingURL=scanFiles.js.map