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
exports.SafeWriter = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("node:path"));
const config_1 = require("../utils/config");
const CREATED_FILES_PATH = ['.tic-code', 'created-files.json'];
class SafeWriter {
    root;
    constructor(root) {
        this.root = root;
    }
    async writeFile(relativePath, content) {
        const target = vscode.Uri.joinPath(this.root.uri, ...toPathParts(relativePath));
        const existed = await this.exists(target);
        if (!existed) {
            await this.ensureParentDirectory(target);
            await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf8'));
            await this.registerCreatedFile(relativePath);
            return { action: 'created', uri: target };
        }
        const strategy = await this.resolveExistingFileStrategy(relativePath);
        if (strategy === 'ignore') {
            return { action: 'ignored', uri: target };
        }
        if (strategy === 'overwrite') {
            await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf8'));
            return { action: 'overwritten', uri: target };
        }
        const existing = Buffer.from(await vscode.workspace.fs.readFile(target)).toString('utf8');
        const next = mergeTicCoderLiteSection(existing, content);
        await vscode.workspace.fs.writeFile(target, Buffer.from(next, 'utf8'));
        return { action: 'appended', uri: target };
    }
    async registerCreatedFile(relativePath) {
        const manifestUri = vscode.Uri.joinPath(this.root.uri, ...CREATED_FILES_PATH);
        await this.ensureParentDirectory(manifestUri);
        const manifest = await this.readManifest(manifestUri);
        const normalized = normalizeRelativePath(relativePath);
        if (!manifest.files.includes(normalized)) {
            manifest.files.push(normalized);
            manifest.files.sort();
        }
        manifest.generatedAt = new Date().toISOString();
        await vscode.workspace.fs.writeFile(manifestUri, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'));
    }
    async resolveExistingFileStrategy(relativePath) {
        const configured = (0, config_1.getTicCoderLiteConfig)().exports.safeWriteMode;
        if (configured === 'append' || configured === 'ignore') {
            return configured;
        }
        const overwrite = 'Overwrite';
        const append = 'Append TIC Coder Lite section';
        const ignore = 'Ignore';
        const answer = await vscode.window.showWarningMessage(`${relativePath} already exists. How should TIC Coder Lite export this engine context?`, { modal: true }, append, ignore, overwrite);
        if (answer === overwrite) {
            return 'overwrite';
        }
        if (answer === append) {
            return 'append';
        }
        return 'ignore';
    }
    async ensureParentDirectory(uri) {
        const parent = vscode.Uri.file(path.dirname(uri.fsPath));
        await vscode.workspace.fs.createDirectory(parent);
    }
    async exists(uri) {
        try {
            await vscode.workspace.fs.stat(uri);
            return true;
        }
        catch {
            return false;
        }
    }
    async readManifest(uri) {
        try {
            const bytes = await vscode.workspace.fs.readFile(uri);
            const parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
            return {
                generatedAt: parsed.generatedAt ?? new Date().toISOString(),
                files: Array.isArray(parsed.files) ? parsed.files : []
            };
        }
        catch {
            return { generatedAt: new Date().toISOString(), files: [] };
        }
    }
}
exports.SafeWriter = SafeWriter;
const START_MARKER = '<!-- TIC_CODER_LITE_START -->';
const END_MARKER = '<!-- TIC_CODER_LITE_END -->';
function mergeTicCoderLiteSection(existing, content) {
    const block = `${START_MARKER}\n${content.trim()}\n${END_MARKER}`;
    const start = existing.indexOf(START_MARKER);
    const end = existing.indexOf(END_MARKER);
    if (start >= 0 && end > start) {
        return `${existing.slice(0, start)}${block}${existing.slice(end + END_MARKER.length)}`.trimEnd() + '\n';
    }
    return `${existing.trimEnd()}\n\n${block}\n`;
}
function toPathParts(relativePath) {
    return normalizeRelativePath(relativePath).split('/').filter(Boolean);
}
function normalizeRelativePath(relativePath) {
    return relativePath.split(path.sep).join('/');
}
//# sourceMappingURL=safeWriter.js.map