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
exports.ENGINE_DEFINITIONS = void 0;
exports.detectEngines = detectEngines;
exports.detectEngineById = detectEngineById;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
// Conceptually adapted from Reversa's installer detector by Sandeco (MIT License).
// TIC Coder Lite keeps only lightweight engine detection and writes context to .tic-code.
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
exports.ENGINE_DEFINITIONS = [
    {
        id: 'claude-code',
        name: 'Claude Code',
        entryFile: 'CLAUDE.md',
        entryTemplate: 'CLAUDE.md',
        skillsDir: '.claude/skills',
        universalSkillsDir: '.agents/skills',
        command: 'claude',
        folderSignals: ['.claude'],
        fileSignals: ['CLAUDE.md']
    },
    {
        id: 'codex',
        name: 'Codex',
        entryFile: 'AGENTS.md',
        entryTemplate: 'AGENTS.md',
        skillsDir: '.agents/skills',
        universalSkillsDir: '.agents/skills',
        command: 'codex',
        folderSignals: [],
        fileSignals: ['AGENTS.md']
    },
    {
        id: 'cursor',
        name: 'Cursor',
        entryFile: '.cursorrules',
        entryTemplate: 'cursorrules',
        skillsDir: '.agents/skills',
        universalSkillsDir: '.agents/skills',
        folderSignals: ['.cursor'],
        fileSignals: ['.cursorrules']
    },
    {
        id: 'github-copilot',
        name: 'GitHub Copilot',
        entryFile: '.github/copilot-instructions.md',
        entryTemplate: 'copilot-instructions',
        skillsDir: '.agents/skills',
        universalSkillsDir: '.agents/skills',
        folderSignals: ['.github'],
        fileSignals: ['.github/copilot-instructions.md']
    },
    {
        id: 'gemini-cli',
        name: 'Gemini CLI',
        entryFile: 'GEMINI.md',
        entryTemplate: 'GEMINI.md',
        skillsDir: '.agents/skills',
        universalSkillsDir: '.agents/skills',
        command: 'gemini',
        folderSignals: [],
        fileSignals: ['GEMINI.md']
    },
    {
        id: 'aider',
        name: 'Aider',
        entryFile: 'CONVENTIONS.md',
        entryTemplate: 'CONVENTIONS.md',
        skillsDir: '.agents/skills',
        universalSkillsDir: '.agents/skills',
        command: 'aider',
        folderSignals: [],
        fileSignals: ['CONVENTIONS.md', '.aider.conf.yml']
    }
];
async function detectEngines(projectRoot) {
    return Promise.all(exports.ENGINE_DEFINITIONS.map((engine) => detectEngine(projectRoot, engine)));
}
async function detectEngineById(projectRoot, id) {
    const definition = exports.ENGINE_DEFINITIONS.find((engine) => engine.id === id);
    return definition ? detectEngine(projectRoot, definition) : undefined;
}
async function detectEngine(projectRoot, definition) {
    const reasons = [];
    for (const folder of definition.folderSignals) {
        if (await exists(path.join(projectRoot, folder))) {
            reasons.push(`folder:${folder}`);
        }
    }
    for (const file of definition.fileSignals) {
        if (await exists(path.join(projectRoot, file))) {
            reasons.push(`file:${file}`);
        }
    }
    if (definition.command && await commandExists(definition.command)) {
        reasons.push(`command:${definition.command}`);
    }
    return {
        ...definition,
        detected: reasons.length > 0,
        detectionReasons: reasons
    };
}
async function exists(targetPath) {
    try {
        await fs.stat(targetPath);
        return true;
    }
    catch {
        return false;
    }
}
async function commandExists(command) {
    try {
        const lookup = process.platform === 'win32' ? 'where.exe' : 'which';
        await execFileAsync(lookup, [command], { windowsHide: true });
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=detectEngines.js.map