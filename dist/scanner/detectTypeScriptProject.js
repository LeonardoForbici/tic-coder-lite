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
exports.detectTypeScriptProject = detectTypeScriptProject;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
async function detectTypeScriptProject(scan) {
    const packageJson = await readPackageJson(path.join(scan.rootPath, 'package.json'));
    const dependencies = packageJson ? readDependencyBlock(packageJson.dependencies) : {};
    const devDependencies = packageJson ? readDependencyBlock(packageJson.devDependencies) : {};
    const allDependencies = { ...dependencies, ...devDependencies };
    const sourceFiles = scan.files.filter((file) => ['.ts', '.tsx', '.js', '.jsx'].includes(file.extension));
    return {
        detected: Boolean(packageJson) || sourceFiles.length > 0,
        packageManager: detectPackageManager(scan),
        frameworks: detectFrameworks(scan, allDependencies),
        dependencies,
        devDependencies,
        sourceFiles: {
            total: sourceFiles.length,
            components: findByConvention(sourceFiles, (file) => /(^|\/)[A-Z][^/]*\.(tsx|jsx)$/.test(file.relativePath) || /\.component\.ts$/.test(file.relativePath)),
            pages: findByConvention(sourceFiles, (file) => file.relativePath.includes('/pages/') || file.relativePath.includes('/app/') || /(^|\/)page\.(tsx|jsx|ts|js)$/.test(file.relativePath)),
            services: findByConvention(sourceFiles, (file) => /\.service\.(ts|js)$/.test(file.relativePath) || file.relativePath.includes('/services/')),
            configs: findByConvention(sourceFiles, (file) => file.relativePath.includes('config') || /^vite\.config\.(ts|js)$/.test(file.relativePath) || /^next\.config\.(ts|js)$/.test(file.relativePath))
        }
    };
}
function detectFrameworks(scan, dependencies) {
    const frameworks = new Set();
    const paths = new Set(scan.files.map((file) => file.relativePath));
    if (dependencies.react || dependencies['react-dom']) {
        frameworks.add('React');
    }
    if (dependencies['@angular/core'] || hasBasename(paths, ['angular.json'])) {
        frameworks.add('Angular');
    }
    if (dependencies.next || hasBasename(paths, ['next.config.js', 'next.config.ts'])) {
        frameworks.add('Next.js');
    }
    if (dependencies.vite || hasBasename(paths, ['vite.config.ts', 'vite.config.js'])) {
        frameworks.add('Vite');
    }
    if (paths.has('package.json')) {
        frameworks.add('Node.js');
    }
    return [...frameworks].sort();
}
function detectPackageManager(scan) {
    const paths = new Set(scan.files.map((file) => file.relativePath));
    if (hasBasename(paths, ['pnpm-lock.yaml'])) {
        return 'pnpm';
    }
    if (hasBasename(paths, ['yarn.lock'])) {
        return 'Yarn';
    }
    if (hasBasename(paths, ['bun.lockb'])) {
        return 'Bun';
    }
    if (hasBasename(paths, ['package-lock.json'])) {
        return 'npm';
    }
    return paths.has('package.json') ? 'npm or compatible' : undefined;
}
function hasBasename(paths, basenames) {
    const expected = new Set(basenames.map((name) => name.toLowerCase()));
    return [...paths].some((file) => expected.has(path.basename(file).toLowerCase()));
}
function findByConvention(files, predicate) {
    return files
        .filter(predicate)
        .map((file) => file.relativePath)
        .sort()
        .slice(0, 40);
}
async function readPackageJson(filePath) {
    try {
        return JSON.parse(await fs.readFile(filePath, 'utf8'));
    }
    catch {
        return undefined;
    }
}
function readDependencyBlock(value) {
    if (!value || typeof value !== 'object') {
        return {};
    }
    const entries = Object.entries(value)
        .filter((entry) => typeof entry[1] === 'string')
        .sort((a, b) => a[0].localeCompare(b[0]));
    return Object.fromEntries(entries);
}
//# sourceMappingURL=detectTypeScriptProject.js.map