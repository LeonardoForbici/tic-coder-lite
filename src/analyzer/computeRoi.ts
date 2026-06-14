/**
 * ROI — traduz débito técnico e análise em TEMPO e DINHEIRO. O argumento que
 * CTO/FinOps entende: "esta dívida custa ~X dev-days / R$ Y", "os PRs já
 * pouparam Z horas de investigação de impacto". Estimativas transparentes,
 * ancoradas no `debtScore` já calculado e numa taxa-hora configurável.
 */
import type { FileMetrics } from './computeMetrics';
import type { ProjectModule } from './detectModules';

export interface RoiConfig {
  hourlyRate: number;
  currency: string;
  hoursPerDebtPoint: number;
}

export const DEFAULT_ROI: RoiConfig = { hourlyRate: 50, currency: 'US$', hoursPerDebtPoint: 0.5 };

/** Minutos poupados por entidade cross-tier que NÃO precisou ser rastreada à mão. */
const MIN_PER_IMPACTED_ENTITY = 5;

export interface RoiModule { module: string; hours: number; cost: number; }

export interface RoiResult {
  currency: string;
  hourlyRate: number;
  remediationHours: number;
  devDays: number;
  debtCost: number;
  byModule: RoiModule[];
  hoursSaved: number;
  savedCost: number;
  /** savedCost − debtCost (positivo = o investimento na ferramenta já se pagou). */
  net: number;
}

export function resolveRoiConfig(raw: Partial<RoiConfig> | undefined): RoiConfig {
  return {
    hourlyRate: typeof raw?.hourlyRate === 'number' && raw.hourlyRate > 0 ? raw.hourlyRate : DEFAULT_ROI.hourlyRate,
    currency: typeof raw?.currency === 'string' && raw.currency ? raw.currency : DEFAULT_ROI.currency,
    hoursPerDebtPoint: typeof raw?.hoursPerDebtPoint === 'number' && raw.hoursPerDebtPoint > 0 ? raw.hoursPerDebtPoint : DEFAULT_ROI.hoursPerDebtPoint
  };
}

interface PrHistoryEntry { totalImpacted?: number; }

export function computeRoi(
  fileMetrics: FileMetrics[],
  modules: ProjectModule[],
  prHistory: PrHistoryEntry[],
  rawConfig: Partial<RoiConfig> | undefined
): RoiResult {
  const cfg = resolveRoiConfig(rawConfig);

  // ── Remediação: débito → horas → custo ──────────────────────────────────────
  const hoursByFile = new Map<string, number>();
  let remediationHours = 0;
  for (const m of fileMetrics) {
    const h = (m.debtScore ?? 0) * cfg.hoursPerDebtPoint;
    if (h <= 0) continue;
    hoursByFile.set(m.file, h);
    remediationHours += h;
  }

  // por módulo
  const byModule: RoiModule[] = [];
  for (const mod of modules) {
    let h = 0;
    for (const f of mod.files) h += hoursByFile.get(f.relativePath) ?? 0;
    if (h <= 0) continue;
    byModule.push({ module: mod.name, hours: Math.round(h * 10) / 10, cost: Math.round(h * cfg.hourlyRate) });
  }
  byModule.sort((a, b) => b.cost - a.cost);

  // ── Economia: horas que os PRs pouparam de investigação manual ──────────────
  const impactedTotal = prHistory.reduce((s, p) => s + (p.totalImpacted ?? 0), 0);
  const hoursSaved = (impactedTotal * MIN_PER_IMPACTED_ENTITY) / 60;

  const round1 = (n: number) => Math.round(n * 10) / 10;
  const debtCost = Math.round(remediationHours * cfg.hourlyRate);
  const savedCost = Math.round(hoursSaved * cfg.hourlyRate);

  return {
    currency: cfg.currency,
    hourlyRate: cfg.hourlyRate,
    remediationHours: round1(remediationHours),
    devDays: round1(remediationHours / 8),
    debtCost,
    byModule: byModule.slice(0, 20),
    hoursSaved: round1(hoursSaved),
    savedCost,
    net: savedCost - debtCost
  };
}
