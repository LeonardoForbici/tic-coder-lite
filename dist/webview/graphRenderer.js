"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildWebviewGraphData = buildWebviewGraphData;
function buildWebviewGraphData(graph) {
    const degree = new Map();
    for (const edge of graph.edges) {
        degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
        degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
    }
    const centralPaths = new Set(graph.stats.centralFiles.slice(0, 60).map((file) => file.path));
    const connectedIds = new Set();
    for (const edge of graph.edges) {
        if (centralPaths.has(edge.sourcePath) || centralPaths.has(edge.targetPath)) {
            connectedIds.add(edge.from);
            connectedIds.add(edge.to);
        }
    }
    const selectedNodes = graph.nodes
        .filter((node) => centralPaths.has(node.path) || connectedIds.has(node.id) || node.riskLevel || node.module !== 'unknown')
        .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.path.localeCompare(b.path))
        .slice(0, 180);
    const selectedIds = new Set(selectedNodes.map((node) => node.id));
    const visibleEdges = graph.edges
        .filter((edge) => selectedIds.has(edge.from) && selectedIds.has(edge.to))
        .sort((a, b) => (degree.get(b.from) ?? 0) + (degree.get(b.to) ?? 0) - ((degree.get(a.from) ?? 0) + (degree.get(a.to) ?? 0)))
        .slice(0, 420);
    const modules = [...new Set(selectedNodes.map((node) => node.module))].sort();
    const moduleCenters = new Map();
    const columns = Math.max(2, Math.ceil(Math.sqrt(modules.length)));
    modules.forEach((module, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        moduleCenters.set(module, {
            x: 170 + col * 220,
            y: 120 + row * 170
        });
    });
    const moduleCounts = {};
    return {
        nodes: selectedNodes.map((node, index) => {
            const moduleIndex = moduleCounts[node.module] ?? 0;
            moduleCounts[node.module] = moduleIndex + 1;
            const center = moduleCenters.get(node.module) ?? { x: 360, y: 220 };
            const angle = moduleIndex * 2.399963229728653;
            const ring = 18 + Math.sqrt(moduleIndex) * 18;
            return {
                id: node.id,
                label: node.label,
                path: node.path,
                module: node.module,
                type: node.type,
                language: node.language,
                riskLevel: node.riskLevel,
                degree: degree.get(node.id) ?? 0,
                x: Math.round(center.x + Math.cos(angle) * ring),
                y: Math.round(center.y + Math.sin(angle) * ring)
            };
        }),
        edges: visibleEdges.map((edge) => ({ from: edge.from, to: edge.to, type: edge.type })),
        stats: {
            totalNodes: graph.nodes.length,
            totalEdges: graph.edges.length,
            visibleNodes: selectedNodes.length,
            visibleEdges: visibleEdges.length,
            modules: graph.stats.modules
        }
    };
}
//# sourceMappingURL=graphRenderer.js.map