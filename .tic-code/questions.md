# TIC Coder Lite Questions

Generated at: 2026-04-30T23:12:27.921Z
Project: tic-coder-lite

## Architecture Validation

- Is Node.js still an active part of the project, or is it legacy residue?
- Does the unknown module boundary match the intended architecture?

## Risk Validation

- No deterministic risks were found. Are there known project-specific risks TIC Coder Lite should learn to detect?

## Graph And Impact Validation

- Is src/commands/analyzeProject.ts intentionally central, or should its responsibilities be split?
- Is src/reversa-adapter/exportForEngines.ts intentionally central, or should its responsibilities be split?
- Is src/exporters/writeTicCodeFolder.ts intentionally central, or should its responsibilities be split?
- Is src/extension.ts intentionally central, or should its responsibilities be split?
- Is src/scanner/detectStack.ts intentionally central, or should its responsibilities be split?
- Is src/commands/enhanceWithLocalAi.ts intentionally central, or should its responsibilities be split?
- Is src/commands/generateAgentContext.ts intentionally central, or should its responsibilities be split?
- Is src/webview/overviewPanel.ts intentionally central, or should its responsibilities be split?

## Human Decisions Needed

- Should this project use Lite Mode only, Standard AI exports, or optional Local AI Mode?
- Which Standard AI engine files should be committed: AGENTS.md, CLAUDE.md, Copilot instructions, Cursor rules, or GEMINI.md?
- Is Local AI Mode allowed for this workspace, and which small Ollama model should be used?
- Which generated facts should become project rules for AI agents?
- Which modules are safe for automated edits, and which require manual review?
- Are there endpoints, migrations, auth rules, or public contracts that must never change without approval?
- Are there local conventions not visible through file names, imports, or manifests?
