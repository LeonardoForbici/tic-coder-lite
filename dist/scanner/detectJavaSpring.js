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
exports.detectJavaSpring = detectJavaSpring;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const SPRING_ANNOTATIONS = [
    'RestController',
    'Controller',
    'Service',
    'Repository',
    'Entity',
    'Component',
    'Configuration',
    'GetMapping',
    'PostMapping',
    'PutMapping',
    'DeleteMapping',
    'RequestMapping'
];
const EMPTY_COUNTS = {
    controller: 0,
    service: 0,
    repository: 0,
    entity: 0,
    dto: 0,
    config: 0,
    security: 0,
    unknown: 0
};
async function detectJavaSpring(scan) {
    const javaFiles = scan.files.filter((file) => file.extension === '.java');
    const files = [];
    const annotations = {};
    const countsByKind = { ...EMPTY_COUNTS };
    for (const file of javaFiles) {
        const absolutePath = path.join(scan.rootPath, file.relativePath);
        const content = await readText(absolutePath);
        const foundAnnotations = extractSpringAnnotations(content);
        const kind = classifyJavaFile(file.relativePath, content, foundAnnotations);
        const endpoints = extractEndpointMappings(content);
        for (const annotation of foundAnnotations) {
            annotations[annotation] = (annotations[annotation] ?? 0) + 1;
        }
        countsByKind[kind] += 1;
        files.push({
            path: file.relativePath,
            className: extractClassName(content) ?? path.basename(file.relativePath, '.java'),
            kind,
            annotations: foundAnnotations,
            endpoints
        });
    }
    return {
        detected: files.some((file) => file.annotations.length > 0),
        annotations: sortRecord(annotations),
        files,
        countsByKind
    };
}
function classifyJavaFile(relativePath, content, annotations) {
    const lowerPath = relativePath.toLowerCase();
    const className = (extractClassName(content) ?? path.basename(relativePath, '.java')).toLowerCase();
    if (annotations.includes('RestController') || annotations.includes('Controller') || hasAny(annotations, ['GetMapping', 'PostMapping', 'PutMapping', 'DeleteMapping', 'RequestMapping'])) {
        return 'controller';
    }
    if (annotations.includes('Service') || lowerPath.includes('/service/') || className.endsWith('service')) {
        return 'service';
    }
    if (annotations.includes('Repository') || lowerPath.includes('/repository/') || className.endsWith('repository')) {
        return 'repository';
    }
    if (annotations.includes('Entity') || lowerPath.includes('/entity/') || lowerPath.includes('/model/')) {
        return 'entity';
    }
    if (lowerPath.includes('/security/') || className.includes('security') || content.includes('SecurityFilterChain') || content.includes('WebSecurityConfigurerAdapter')) {
        return 'security';
    }
    if (annotations.includes('Configuration') || lowerPath.includes('/config/') || className.endsWith('config') || className.endsWith('configuration')) {
        return 'config';
    }
    if (lowerPath.includes('/dto/') || className.endsWith('dto') || className.endsWith('request') || className.endsWith('response')) {
        return 'dto';
    }
    if (annotations.includes('Component')) {
        return 'service';
    }
    return 'unknown';
}
function extractSpringAnnotations(content) {
    return SPRING_ANNOTATIONS.filter((annotation) => new RegExp(`@${annotation}\\b`).test(content));
}
function extractEndpointMappings(content) {
    const endpoints = new Set();
    const mappingPattern = /@(GetMapping|PostMapping|PutMapping|DeleteMapping|RequestMapping)\s*(?:\(([^)]*)\))?/g;
    let match;
    while ((match = mappingPattern.exec(content)) !== null) {
        const rawArgs = match[2] ?? '';
        const route = rawArgs.match(/["'`]([^"'`]+)["'`]/)?.[1] ?? '';
        endpoints.add(route ? `${match[1]} ${route}` : match[1]);
    }
    return [...endpoints].sort();
}
function extractClassName(content) {
    return content.match(/\b(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/)?.[1];
}
function hasAny(values, expected) {
    return expected.some((value) => values.includes(value));
}
async function readText(filePath) {
    try {
        return await fs.readFile(filePath, 'utf8');
    }
    catch {
        return '';
    }
}
function sortRecord(input) {
    return Object.fromEntries(Object.entries(input).sort((a, b) => b[1] - a[1]));
}
//# sourceMappingURL=detectJavaSpring.js.map