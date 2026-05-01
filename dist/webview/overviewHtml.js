"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderOverviewHtml = renderOverviewHtml;
const graphRenderer_1 = require("./graphRenderer");
const webviewAssets_1 = require("./webviewAssets");
function renderOverviewHtml(input) {
    const { summary, engines, agentContextPreview, nonce } = input;
    const graph = (0, graphRenderer_1.buildWebviewGraphData)(summary.graph);
    const javaClasses = summary.inventory.javaSpring.files.length;
    const methods = estimateMethods(summary);
    const highRiskFiles = findHighRiskFiles(summary);
    const modules = summary.inventory.modules.filter((module) => module.files.length > 0);
    const detectedEngines = engines.filter((engine) => engine.detected);
    const stack = summary.inventory.stack.filter((signal) => signal.detected);
    const plsql = summary.inventory.plsql;
    const plsqlRisks = summary.risks.risks.filter((risk) => risk.category === 'plsql');
    const data = {
        graph,
        project: summary.workspaceName,
        engines: engines.map((engine) => ({ id: engine.id, name: engine.name, detected: engine.detected }))
    };
    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TIC Coder Lite</title>
  <style nonce="${nonce}">${(0, webviewAssets_1.getOverviewStyles)()}</style>
</head>
<body>
  <script nonce="${nonce}">window.__TIC_CODE_DATA__ = ${safeJson(data)};</script>
  <main class="page">
    <header class="header">
      <div>
        <h1>TIC Coder Lite</h1>
        <p class="muted">Workspace: <strong>${escapeHtml(summary.workspaceName)}</strong></p>
        <p class="muted">Entenda seu workspace antes de pedir para a IA alterar o codigo.</p>
      </div>
      <div class="actions">
        <button class="btn primary" data-command="analyzeProject">Analisar Projeto</button>
        <button class="btn" data-command="exportForCodex">Exportar para Codex</button>
        <button class="btn" data-command="exportForClaude">Exportar para Claude</button>
        <button class="btn" data-command="enhanceLocalAi">Melhorar com IA Local</button>
      </div>
    </header>

    <section class="summary" aria-label="Resumo">
      ${metric('Arquivos analisados', summary.totalFiles)}
      ${metric('Classes Java', javaClasses)}
      ${metric('Metodos estimados', methods)}
      ${metric('Riscos', summary.risks.summary.total)}
      ${metric('Engines de IA', detectedEngines.length)}
      ${metric('Database / PL/SQL', plsql.files.length)}
    </section>

    <section class="section">
      <h2>Configuracao facil</h2>
      <div class="setup-grid">
        <div class="card setup-card">
          <strong>Comecar sem configurar nada</strong>
          <p class="caption">Usa o Modo Lite local: sem IA, sem Docker, sem banco e sem servidor.</p>
          <button class="btn primary" data-command="setupBeginner">Aplicar padrao recomendado</button>
        </div>
        <div class="card setup-card">
          <strong>Exportar para ferramentas de IA</strong>
          <p class="caption">Detecta Codex, Claude Code, Copilot, Cursor e Gemini quando existirem no workspace.</p>
          <button class="btn" data-command="detectEngines">Detectar ferramentas instaladas</button>
        </div>
        <div class="card setup-card">
          <strong>IA Local opcional</strong>
          <p class="caption">Liga ou desliga Ollama sem mexer em JSON. O Modo Lite continua funcionando mesmo desligado.</p>
          <button class="btn" data-command="enableLocalAi">Ligar IA Local</button>
          <button class="btn" data-command="disableLocalAi">Desligar IA Local</button>
        </div>
        <div class="card setup-card">
          <strong>Ajustes avancados</strong>
          <p class="caption">Abre as configuracoes nativas do VS Code ja filtradas para TIC Coder Lite.</p>
          <button class="btn" data-command="openSettings">Abrir configuracoes</button>
        </div>
      </div>
    </section>

    <section class="section">
      <h2>Modos do TIC Coder Lite</h2>
      <div class="mode-tabs" role="tablist">
        <button class="mode active" data-mode="lite"><strong>Modo Lite</strong><br><span class="caption">Analise local, sem IA, sem banco e sem Docker.</span></button>
        <button class="mode" data-mode="standard"><strong>IA Padrao</strong><br><span class="caption">Exporta contexto para Codex, Claude Code, Copilot, Cursor e Gemini.</span></button>
        <button class="mode" data-mode="local"><strong>IA Local</strong><br><span class="caption">Usa Ollama opcionalmente para melhorar resumos e perguntas.</span></button>
      </div>

      <div class="mode-panel active" data-panel="lite">
        <p>O Modo Lite gera scan, grafo, riscos e contexto em <code>.tic-code</code> sem depender de servicos externos.</p>
      </div>
      <div class="mode-panel" data-panel="standard">
        <p>A IA Padrao grava arquivos nativos para ferramentas de codificacao assistida.</p>
        <div class="actions">
          <button class="btn primary" data-command="exportForCodex">Exportar para Codex</button>
          <button class="btn" data-command="exportForClaude">Exportar para Claude</button>
          <button class="btn" data-command="exportForCopilot">Exportar para Copilot</button>
          <button class="btn" data-command="exportForCursor">Exportar para Cursor</button>
          <button class="btn" data-command="exportForGemini">Exportar para Gemini</button>
        </div>
        <p class="caption">Engines detectadas: ${detectedEngines.map((engine) => escapeHtml(engine.name)).join(', ') || 'nenhuma detectada ainda'}.</p>
      </div>
      <div class="mode-panel" data-panel="local">
        <p>A IA Local e opcional e usa Ollama quando estiver configurado. O scan continua funcionando sem ela.</p>
        <button class="btn primary" data-command="enhanceLocalAi">Melhorar com IA Local</button>
      </div>
    </section>

    <section class="section">
      <h2>Grafo</h2>
      <div class="card graph-card">
        <div class="graph-toolbar">
          <div>
            <strong>Mapa de dependencias do workspace</strong>
            <div class="caption"><span id="graphTotal">${summary.graph.stats.nodeCount} nos totais · ${summary.graph.stats.edgeCount} arestas totais</span> · <span id="graphVisible">carregando...</span></div>
          </div>
          <div class="graph-tools">
            <input id="graphSearch" type="search" placeholder="Buscar no ou arquivo">
            <select id="moduleFilter" aria-label="Filtrar por modulo"></select>
            <select id="layoutSelect" aria-label="Layout do grafo">
              <option value="agrupado">Agrupado</option>
              <option value="radial">Radial</option>
              <option value="camadas">Camadas</option>
            </select>
            <input id="density" type="range" min="15" max="100" value="65" title="Densidade de arestas">
            <button class="btn compact" id="zoomOut">-</button>
            <button class="btn compact" id="fitGraph">Ajustar</button>
            <button class="btn compact" id="zoomIn">+</button>
            <button class="btn compact" id="toggleLabels">Labels</button>
          </div>
        </div>
        <div class="graph-shell">
          <div class="graph-wrap" id="graphWrap">
            <svg id="graph" role="img" aria-label="Grafo de dependencias do TIC Coder Lite"></svg>
            <div class="graph-hint">Arraste o fundo para mover · use scroll para zoom · clique em um no para detalhes</div>
          </div>
          <aside class="graph-side">
            <h2 id="nodeTitle">No</h2>
            <div class="caption mono" id="nodeMeta"></div>
            <ul id="nodeDetails"></ul>
            <h2 style="margin-top:16px">Legenda</h2>
            <div class="legend">
              <span>controller</span><span>service</span><span>repository</span><span>entity</span><span>external</span><span>risco alto</span>
            </div>
            <h2 style="margin-top:16px">Arestas do no</h2>
            <ul id="nodeEdges"></ul>
          </aside>
        </div>
      </div>
    </section>

    <section class="section">
      <h2>Riscos</h2>
      <ul>${highRiskFiles.map((file) => `<li><span class="mono">${escapeHtml(file.path)}</span><span class="risk-${escapeHtml(file.level)}">${riskLabel(file.level)}</span></li>`).join('') || '<li><span>Nenhum risco alto detectado.</span></li>'}</ul>
    </section>

    <section class="section">
      <h2>Database / PL/SQL</h2>
      <div class="metrics">
        ${metric('Packages', plsql.counts.package + plsql.counts.package_body)}
        ${metric('Procedures', plsql.counts.procedure)}
        ${metric('Functions', plsql.counts.function)}
        ${metric('Triggers', plsql.counts.trigger)}
        ${metric('Tabelas', plsql.tableReferences.length)}
        ${metric('Riscos PL/SQL', plsqlRisks.length)}
      </div>
      <h3>Tabelas mais referenciadas</h3>
      <ul>${plsql.tableReferences.slice(0, 10).map((table) => `<li><span class="mono">${escapeHtml(table.name)}</span><span>${table.reads} leituras / ${table.writes} escritas</span></li>`).join('') || '<li><span>Nenhuma tabela PL/SQL detectada.</span></li>'}</ul>
      <h3 style="margin-top:14px">Riscos PL/SQL</h3>
      <ul>${plsqlRisks.slice(0, 12).map((risk) => `<li><span class="mono">${escapeHtml(risk.title)} (${escapeHtml(risk.file)}${risk.line ? `:${risk.line}` : ''})</span><span class="risk-${escapeHtml(risk.level)}">${riskLabel(risk.level)}</span></li>`).join('') || '<li><span>Nenhum risco PL/SQL detectado.</span></li>'}</ul>
    </section>

    <section class="section">
      <h2>Contexto para IA</h2>
      <div class="detail context">${escapeHtml(agentContextPreview || 'Execute Analisar Projeto para gerar .tic-code/agent-context.md')}</div>
    </section>

    <section class="section">
      <h2>Exportacoes</h2>
      <div class="metrics">
        <div class="card"><strong>AGENTS.md</strong><p class="caption">Codex</p></div>
        <div class="card"><strong>CLAUDE.md</strong><p class="caption">Claude Code</p></div>
        <div class="card"><strong>copilot-instructions.md</strong><p class="caption">GitHub Copilot</p></div>
        <div class="card"><strong>.cursorrules</strong><p class="caption">Cursor</p></div>
        <div class="card"><strong>GEMINI.md</strong><p class="caption">Gemini</p></div>
      </div>
    </section>

    <section class="section">
      <h2>Stack e Modulos</h2>
      <div class="two-column">
        <div>
          <h2>Stack detectada</h2>
          <div class="pill-list">${stack.map((signal) => `<span class="pill">${escapeHtml(signal.name)}</span>`).join('') || '<span class="pill">Nenhuma stack detectada</span>'}</div>
        </div>
        <div>
          <h2>Modulos</h2>
          <ul>${modules.map((module) => `<li><strong>${escapeHtml(module.kind)}</strong><span>${module.files.length}</span></li>`).join('') || '<li><span>Nenhum modulo detectado</span></li>'}</ul>
        </div>
      </div>
    </section>

    <section class="section">
      <h2>Log do TIC</h2>
      <div class="log" id="logs"></div>
    </section>
  </main>
  ${(0, webviewAssets_1.getOverviewScript)(nonce)}
</body>
</html>`;
}
function metric(label, value) {
    return `<div class="card"><span class="value">${escapeHtml(String(value))}</span><span class="label">${escapeHtml(label)}</span></div>`;
}
function estimateMethods(summary) {
    const javaApprox = summary.inventory.javaSpring.files.reduce((total, file) => total + Math.max(1, file.endpoints.length), 0);
    const scriptApprox = summary.graph.nodes.filter((node) => node.type === 'script_source').length;
    return javaApprox + scriptApprox;
}
function findHighRiskFiles(summary) {
    const fromRisks = summary.risks.risks
        .filter((risk) => risk.level === 'critical' || risk.level === 'high')
        .map((risk) => ({ path: risk.file, level: risk.level }));
    const fromGraph = summary.graph.nodes
        .filter((node) => node.module !== 'external' && node.riskLevel)
        .map((node) => ({ path: node.path, level: node.riskLevel ?? 'medium' }));
    const seen = new Set();
    return [...fromRisks, ...fromGraph].filter((item) => {
        if (seen.has(item.path)) {
            return false;
        }
        seen.add(item.path);
        return true;
    }).slice(0, 12);
}
function riskLabel(value) {
    return {
        critical: 'critico',
        high: 'alto',
        medium: 'medio',
        low: 'baixo'
    }[value] ?? value;
}
function safeJson(value) {
    return JSON.stringify(value).replaceAll('</', '<\\/');
}
function escapeHtml(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}
//# sourceMappingURL=overviewHtml.js.map