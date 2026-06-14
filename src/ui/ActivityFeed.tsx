/**
 * Aba Atividade — a pulsação do sistema vivo. Timeline do que mudou a cada
 * análise (health, riscos, regras, predições confirmadas) + taxa de acerto do
 * loop preditivo. Atualiza ao vivo via onActivity (modo Ao Vivo / servidor).
 */
import { useCallback, useEffect, useState } from 'react';

export interface ActivityEvent {
  ts: string;
  type: string;
  severity: 'info' | 'warn' | 'critical';
  title: string;
  detail?: string;
  entity?: string;
}

interface Accuracy { confirmed: number; total: number; hitRate: number; }

const C = { card: '#16213e', border: '#2a2a4e', accent: '#7c83fd', green: '#56cfad', red: '#ff6b6b', orange: '#f0a500', text: '#e0e0e0', muted: '#888' };

const SEV_COLOR: Record<string, string> = { info: C.accent, warn: C.orange, critical: C.red };
const TYPE_ICON: Record<string, string> = {
  analysis: '🔍', 'health-up': '📈', 'health-down': '📉', 'risk-new': '⚠️',
  'rule-violation': '🏛️', 'triage-new': '🎫', 'module-added': '➕',
  'module-removed': '➖', 'prediction-confirmed': '🎯', 'alert-sent': '📣'
};

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

export function ActivityFeed({ ticCodeDir, projectPath }: { ticCodeDir: string; projectPath: string }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [accuracy, setAccuracy] = useState<Accuracy | null>(null);

  const load = useCallback(() => {
    window.ticAnalyzer.getActivity(projectPath, 200).then((e) => setEvents(Array.isArray(e) ? e : []));
    window.ticAnalyzer.readFile(`${ticCodeDir}/prediction-accuracy.json`).then((c) => {
      try { setAccuracy(c ? JSON.parse(c) : null); } catch { setAccuracy(null); }
    });
  }, [projectPath, ticCodeDir]);

  useEffect(() => {
    load();
    // Push ao vivo: cada evento novo entra no topo sem recarregar tudo
    const off = window.ticAnalyzer.onActivity((e) => {
      setEvents((prev) => [...prev, e]);
      if (e.type === 'prediction-confirmed' || e.type === 'analysis') load();
    });
    return off;
  }, [load]);

  const ordered = [...events].reverse();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '15px' }}>Atividade</div>
          <div style={{ fontSize: '12px', color: C.muted }}>O que mudou a cada análise — o batimento do projeto. Atualiza ao vivo quando o modo Ao Vivo está ligado.</div>
        </div>
        {accuracy && accuracy.total > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '10px 14px', textAlign: 'center' as const }}>
            <div style={{ fontSize: '22px', fontWeight: 800, color: C.green }}>{Math.round(accuracy.hitRate * 100)}%</div>
            <div style={{ fontSize: '10px', color: C.muted }}>acerto preditivo<br />({accuracy.confirmed}/{accuracy.total})</div>
          </div>
        )}
      </div>

      {ordered.length === 0 ? (
        <div style={{ fontSize: '12px', color: C.muted, padding: '30px', textAlign: 'center' as const }}>
          Nenhuma atividade ainda. Rode uma análise — a partir da 2ª, o delta aparece aqui.
        </div>
      ) : (
        <div style={{ position: 'relative', paddingLeft: '20px' }}>
          {/* linha vertical da timeline */}
          <div style={{ position: 'absolute', left: '6px', top: '6px', bottom: '6px', width: '2px', background: C.border }} />
          {ordered.map((e, i) => (
            <div key={i} style={{ position: 'relative', marginBottom: '12px' }}>
              <div style={{ position: 'absolute', left: '-18px', top: '2px', width: '12px', height: '12px', borderRadius: '50%', background: SEV_COLOR[e.severity] ?? C.accent, border: `2px solid ${C.card}` }} />
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span>{TYPE_ICON[e.type] ?? '•'}</span>
                <span style={{ fontSize: '13px', color: C.text, fontWeight: 600 }}>{e.title}</span>
                <span style={{ fontSize: '11px', color: C.muted, marginLeft: 'auto', flexShrink: 0 }} title={new Date(e.ts).toLocaleString('pt-BR')}>{relativeTime(e.ts)}</span>
              </div>
              {e.detail && <div style={{ fontSize: '11px', color: C.muted, marginLeft: '24px' }}>{e.detail}</div>}
              {e.entity && <div style={{ fontSize: '11px', color: C.accent, marginLeft: '24px', fontFamily: 'monospace' }}>{e.entity.replace(/^file:/, '')}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
