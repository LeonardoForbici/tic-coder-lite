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
exports.scanWorkspace = scanWorkspace;
const path = __importStar(require("node:path"));
const vscode = __importStar(require("vscode"));
const config_1 = require("../utils/config");
const workspace_1 = require("../utils/workspace");
const scanFiles_1 = require("./scanFiles");
async function scanWorkspace(workspaceFolder, options = {}) {
    const root = workspaceFolder ?? vscode.workspace.workspaceFolders?.[0];
    if (!root) {
        return undefined;
    }
    const rootPath = path.resolve(root.uri.fsPath);
    const config = options.config ?? (0, config_1.getTicCoderLiteConfig)().scan;
    const previousScan = await (0, workspace_1.readJsonIfExists)(vscode.Uri.joinPath(root.uri, '.tic-code', 'scan.json'));
    const previousFiles = new Map((previousScan?.files ?? []).map((file) => [file.relativePath, file]));
    const files = await (0, scanFiles_1.scanFiles)(rootPath, {
        config,
        token: options.token,
        previousFiles,
        logger: options.logger,
        onProgress: (scanProgress) => {
            options.progress?.report({
                message: `Scanning ${scanProgress.filesScanned}/${config.maxFiles} files`,
                increment: 0
            });
            options.logger?.info(`Scan progress: ${scanProgress.filesScanned} scanned, ${scanProgress.filesSkipped} skipped, current=${scanProgress.currentPath ?? 'n/a'}`);
        }
    });
    const reusedFiles = files.filter((file) => file.cached).length;
    return {
        projectName: root.name,
        rootPath,
        scannedAt: new Date().toISOString(),
        files,
        totals: {
            files: files.length,
            lines: files.reduce((total, file) => total + file.lines, 0),
            size: files.reduce((total, file) => total + file.size, 0)
        },
        limits: {
            maxFiles: config.maxFiles,
            maxFileSizeKb: config.maxFileSizeKb
        },
        incremental: {
            reusedFiles
        }
    };
}
//# sourceMappingURL=scanWorkspace.js.map