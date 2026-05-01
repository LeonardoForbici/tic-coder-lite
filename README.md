# TIC Coder Lite

TIC Coder Lite is a local-first VS Code extension that helps developers understand a workspace before asking an AI assistant to change code.

It scans the open project, builds a lightweight architecture graph, detects deterministic risks, and exports context files that tools such as Codex, Claude Code, GitHub Copilot, Cursor, Gemini CLI, and local Ollama models can read.

TIC Coder Lite is prepared for local demos and future `.vsix` packaging. It is not published to the Marketplace yet.

## Screenshots

Demo screenshots can be recorded after launching the Extension Development Host. Placeholder files are included for the future screenshots:

- `docs/screenshots/overview-placeholder.svg`
- `docs/screenshots/graph-placeholder.svg`
- `docs/screenshots/context-placeholder.svg`

## The Three Modes

### 1. Lite Mode

Lite Mode works without AI.

- Deterministic workspace scanner
- Stack and architecture detection by convention
- Lightweight graph from imports and package references
- Deterministic risk detector
- `.tic-code/` context generation
- No database
- No Docker
- No server
- No Ollama
- No AI runtime

Use this mode when you want a fast, local project inventory before editing code.

### 2. Standard AI Mode

Standard AI Mode exports TIC Coder Lite context to the AI coding tools already used by the developer.

- Codex reads `AGENTS.md`
- Claude Code reads `CLAUDE.md`
- GitHub Copilot reads `.github/copilot-instructions.md`
- Cursor reads `.cursorrules`
- Gemini CLI reads `GEMINI.md`
- Aider can read `CONVENTIONS.md`

All generated agent files instruct the assistant to read:

- `.tic-code/agent-context.md`
- `.tic-code/risks.md`
- `.tic-code/architecture.md`
- `.tic-code/confidence-report.md`
- `.tic-code/questions.md`

Existing files are handled safely. TIC Coder Lite can ask, append a marked TIC Coder Lite section, or ignore the file depending on `ticCoderLite.exports.safeWriteMode`. It never deletes project files.

### 3. Local AI Mode

Local AI Mode is optional and uses Ollama only when enabled.

- Default URL: `http://localhost:11434`
- Default model: `qwen2.5-coder:1.5b`
- No model is downloaded automatically
- A small model is recommended for the first demo
- It does not require huge 60GB models
- It can be disabled at any time
- Lite Mode continues working if Ollama is offline

Local AI Mode can generate:

- `.tic-code/agent-context.ai.md`
- `.tic-code/questions.ai.md`
- `.tic-code/module-summaries.ai.md`

## How To Run Locally

Install dependencies:

```bash
npm install
```

Compile the extension:

```bash
npm run compile
```

Open this folder in VS Code:

```bash
code .
```

Press `F5` to start an Extension Development Host. In the new VS Code window, open a project you want to analyze and run commands from the Command Palette.

## How To Analyze A Project

1. Open a workspace folder in the Extension Development Host.
2. Run `TIC Coder Lite: Analyze Project (Lite Mode)`.
3. Wait for the progress notification to complete.
4. Open the TIC Coder Lite activity bar view or run `TIC Coder Lite: Open 3 Modes Overview`.
5. Review the generated `.tic-code/` files.

Large workspaces are scanned with progress notifications, cancellation support, file count limits, file size limits, binary-file avoidance, useful logs, and a simple incremental cache based on modified time from `.tic-code/scan.json`.

Logs are written to the Output Channel named `TIC Coder Lite`.

## Generated Files

Lite Mode generates:

- `.tic-code/scan.json`
- `.tic-code/modules.json`
- `.tic-code/inventory.md`
- `.tic-code/graph.json`
- `.tic-code/architecture.md`
- `.tic-code/risks.json`
- `.tic-code/risks.md`
- `.tic-code/agent-context.md`
- `.tic-code/confidence-report.md`
- `.tic-code/questions.md`

Standard AI Mode may generate:

- `AGENTS.md`
- `CLAUDE.md`
- `.github/copilot-instructions.md`
- `.cursorrules`
- `GEMINI.md`
- `CONVENTIONS.md`
- `.tic-code/created-files.json`

Local AI Mode may generate:

- `.tic-code/agent-context.ai.md`
- `.tic-code/questions.ai.md`
- `.tic-code/module-summaries.ai.md`

## Using With Codex

1. Run `TIC Coder Lite: Analyze Project (Lite Mode)`.
2. Run `TIC Coder Lite: Export for Codex (Standard AI Mode)`.
3. Open `AGENTS.md`.
4. Ask Codex to read `AGENTS.md` and the referenced `.tic-code/` files before changing code.

## Using With Claude Code

1. Run `TIC Coder Lite: Analyze Project (Lite Mode)`.
2. Run `TIC Coder Lite: Export for Claude (Standard AI Mode)`.
3. Claude Code should read `CLAUDE.md`, then the generated `.tic-code/` context files.

## Using With GitHub Copilot

1. Run `TIC Coder Lite: Analyze Project (Lite Mode)`.
2. Run `TIC Coder Lite: Export for Copilot (Standard AI Mode)`.
3. Review `.github/copilot-instructions.md`.
4. Copilot can use that file as project guidance inside VS Code and GitHub workflows.

## Using With Cursor

1. Run `TIC Coder Lite: Analyze Project (Lite Mode)`.
2. Run `TIC Coder Lite: Export for Cursor (Standard AI Mode)`.
3. Review `.cursorrules`.
4. Cursor should use the generated guidance before making project edits.

## Using With Ollama Optional

1. Install and start Ollama locally.
2. Pull a small model manually, for example:

```bash
ollama pull qwen2.5-coder:1.5b
```

3. In VS Code settings, enable `ticCoderLite.localAi.enabled`.
4. Run `TIC Coder Lite: Enhance with Local AI (Local AI Mode)`.

If Ollama is offline, TIC Coder Lite shows a friendly message and Lite Mode remains fully usable.

## Commands

- `TIC Coder Lite: Analyze Project (Lite Mode)`
- `TIC Coder Lite: Open 3 Modes Overview`
- `TIC Coder Lite: Generate Agent Context (Lite Mode)`
- `TIC Coder Lite: Detect AI Engines (Standard AI Mode)`
- `TIC Coder Lite: Export AGENTS.md (Standard AI Mode)`
- `TIC Coder Lite: Export for Codex (Standard AI Mode)`
- `TIC Coder Lite: Export for Claude (Standard AI Mode)`
- `TIC Coder Lite: Export for Copilot (Standard AI Mode)`
- `TIC Coder Lite: Export for Cursor (Standard AI Mode)`
- `TIC Coder Lite: Export for Gemini (Standard AI Mode)`
- `TIC Coder Lite: Enhance with Local AI (Local AI Mode)`

## Settings

- `ticCoderLite.scan.maxFiles`
- `ticCoderLite.scan.maxFileSizeKb`
- `ticCoderLite.scan.include`
- `ticCoderLite.scan.exclude`
- `ticCoderLite.output.openAfterScan`
- `ticCoderLite.exports.safeWriteMode`
- `ticCoderLite.localAi.enabled`
- `ticCoderLite.localAi.ollamaUrl`
- `ticCoderLite.localAi.model`

## Generate A Local VSIX

This project is prepared for local packaging only.

```bash
npm run compile
npm run package
```

The command creates a `.vsix` file in the project root. Do not publish it to the Marketplace yet.

Install the generated VSIX locally from VS Code:

1. Open the Extensions view.
2. Choose `Install from VSIX...`.
3. Select the generated `tic-coder-lite-*.vsix`.

## Demo Video Checklist

1. Launch the Extension Development Host with `F5`.
2. Open a real Java, TypeScript, or mixed workspace.
3. Run `TIC Coder Lite: Analyze Project (Lite Mode)`.
4. Show `.tic-code/scan.json`, `.tic-code/architecture.md`, `.tic-code/risks.md`, and `.tic-code/agent-context.md`.
5. Open `TIC Coder Lite: Open 3 Modes Overview`.
6. Export for Codex or Claude.
7. Optionally show Local AI Mode with Ollama offline and then online.

## MVP Limitations

- The graph is lightweight and based on imports, package manifests, paths, and conventions.
- It does not perform full compiler-grade semantic analysis.
- Java method and risk detection are approximate and deterministic.
- TypeScript path aliases are intentionally limited in the MVP.
- Local AI enhancement requires a manually installed Ollama model.
- TIC Coder Lite does not run tests, migrate databases, call cloud APIs, or start backend services.

## Credits

- Reversa by Sandeco, MIT License.
- TIC Coder Lite by TIC / Leonardo Forbici.
- InsightGraph concepts used as internal reference, not bundled as a dependency.

## Relationship To Reversa

TIC Coder Lite adapts selected concepts from Reversa around AI engine detection, agent entry files, operational context, safe writing, and confidence-oriented documentation. It does not bundle the full Reversa installer, update flow, uninstall flow, `.reversa/`, `_reversa_sdd/`, or Reversa agents.

## Relationship To InsightGraph

InsightGraph was used as an internal conceptual reference for local scan/analyze flows, in-memory graph context, impact-style reasoning, deterministic fragility/risk ideas, and optional Ollama configuration patterns. TIC Coder Lite does not bundle InsightGraph and does not use Neo4j, py2neo, FastAPI, SQLite, Ollama as a requirement, RAG, or a Python backend.

## License

MIT. See `LICENSE` and `NOTICE.md`.
