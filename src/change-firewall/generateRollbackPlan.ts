import type { ChangeSafetyReport, GitDiffSummary } from './changeFirewallTypes';

export function renderRollbackPlanMd(diff: GitDiffSummary, report?: Pick<ChangeSafetyReport, 'riskLevel' | 'verdict'>): string {
  const files = diff.changedFiles;
  return `# Rollback Plan - AI Change Firewall

## Escopo

- Veredito: ${report?.verdict ?? 'N/A'}
- Risco: ${report?.riskLevel ?? 'N/A'}
- Arquivos alterados: ${files.length}

## Arquivos

${files.map((file) => `- ${file}`).join('\n') || '- N/A'}

## Como reverter

Comandos sugeridos para revisao humana. Nao foram executados automaticamente:

\`\`\`bash
git status --short
git diff --no-ext-diff --unified=3
# Para descartar alteracoes locais de um arquivo especifico:
git restore -- <arquivo>
# Alternativa antiga equivalente, revisar antes de usar:
git checkout -- <arquivo>
# Para desfazer staged changes de um arquivo:
git restore --staged -- <arquivo>
\`\`\`

## Riscos do rollback

- Se houver migration, script SQL, PL/SQL ou alteracao de dados, validar rollback de banco separadamente.
- Se houver alteracao em contrato de API, confirmar compatibilidade com frontend/consumidores.
- Se houver permissao/seguranca, validar perfis antes e depois do rollback.

## Validacoes depois do rollback

- Reabrir tela/fluxo afetado.
- Executar testes obrigatorios listados pelo firewall.
- Conferir \`git status --short\` e revisar diff residual.

## Lacunas

${files.length ? '- Nenhuma lacuna de arquivo alterado registrada no diff.' : '- 🔴 LACUNA: nenhum arquivo alterado confirmado no diff.'}
`;
}
