import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTheme } from '../ThemeContext';
import { API } from '../config';

const p2 = n => String(n).padStart(2, '0');
const isoOf = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const mondayOf = d => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const frShort = s => s.slice(8, 10) + '/' + s.slice(5, 7);
const eur = v => Math.round(v).toLocaleString('fr-FR') + ' €';
const hrs = v => (Math.round(v * 10) / 10).toLocaleString('fr-FR') + ' h';

const METRICS = [
  { id: 'cout', label: 'Coût brut', fmt: eur, cost: true },
  { id: 'heures', label: 'Heures travaillées', fmt: hrs },
  { id: 'sup', label: 'Heures au-delà du contrat', fmt: hrs },
];

// Tableau de bord > Services : heures, heures au-dela du contrat et cout par service et par semaine, compares a N-1
export default function StatsServices() {
  const { colors: C } = useTheme();
  const [weeks, setWeeks] = useState(8);
  const [end, setEnd] = useState(() => mondayOf(new Date())); // derniere semaine affichee
  const [metric, setMetric] = useState('cout');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  const start = new Date(end); start.setDate(start.getDate() - 7 * (weeks - 1));
  useEffect(() => {
    setData(null); setErr('');
    axios.get(API + '/exports/services?from=' + isoOf(start) + '&weeks=' + weeks)
      .then(r => { setData(r.data); if (!r.data.cost_visible) setMetric(m => (m === 'cout' ? 'heures' : m)); })
      .catch(e => setErr(e.response?.data?.error || e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks, isoOf(end)]);

  const shift = n => setEnd(d => { const x = new Date(d); x.setDate(x.getDate() + 7 * n); return x; });
  const M = METRICS.find(m => m.id === metric);
  const sum = (arr, k) => (arr || []).reduce((n, c) => n + (c[k] || 0), 0);
  const total = (src, k) => Object.values(src || {}).reduce((n, arr) => n + sum(arr, k), 0);
  const delta = (cur, prev) => (prev > 0 ? Math.round((cur - prev) / prev * 100) : null);
  const deltaEl = (cur, prev, invert) => {
    const d = delta(cur, prev);
    if (d === null) return <span style={{ color: C.muted }}>N-1 : —</span>;
    const bad = invert ? d < 0 : d > 0;
    return <span style={{ color: d === 0 ? C.muted : bad ? C.red : C.green }}>{d > 0 ? '+' : ''}{d} % vs N-1</span>;
  };

  const btn = on => ({ padding: '6px 11px', borderRadius: '8px', border: '1px solid ' + (on ? C.purple : C.border), background: on ? C.purpleLight : C.card, color: on ? C.purple : C.text, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', fontWeight: on ? 600 : 500 });
  const th = { padding: '8px 10px', fontSize: '10px', color: C.muted, fontWeight: 600, textAlign: 'right', borderBottom: '1px solid ' + C.border, whiteSpace: 'nowrap' };
  const td = { padding: '7px 10px', fontSize: '12px', color: C.text, textAlign: 'right', borderBottom: '1px solid ' + C.border + '88', whiteSpace: 'nowrap', verticalAlign: 'top' };
  const card = { background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '14px 16px' };

  const hasN1 = data && Object.keys(data.previous || {}).length > 0;
  // Valeur max pour les barres
  const maxVal = data ? Math.max(1, ...data.services.flatMap(s => (data.current[s] || []).map(c => c[metric] || 0))) : 1;

  return (
    <div style={{ marginTop: '18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <button style={btn(false)} onClick={() => shift(-weeks)} title="Période précédente">◀</button>
        <span style={{ fontSize: '13px', fontWeight: 600, color: C.text, minWidth: '170px', textAlign: 'center' }}>
          Semaines du {frShort(isoOf(start))} au {frShort(isoOf(new Date(end.getTime() + 6 * 86400000)))}
        </span>
        <button style={btn(false)} onClick={() => shift(weeks)} title="Période suivante">▶</button>
        <button style={btn(false)} onClick={() => setEnd(mondayOf(new Date()))}>Cette semaine</button>
        <span style={{ width: '10px' }} />
        {[4, 8, 13, 26].map(n => <button key={n} style={btn(weeks === n)} onClick={() => setWeeks(n)}>{n} sem.</button>)}
      </div>

      {err && <div style={{ ...card, color: C.red, fontSize: '12px' }}>Impossible de charger les statistiques : {err}</div>}
      {!data && !err && <div style={{ color: C.muted, fontSize: '13px' }}>Chargement...</div>}
      {data && (<>
        {/* Totaux de la periode */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          {METRICS.filter(m => !m.cost || data.cost_visible).map(m => {
            const cur = total(data.current, m.id), prev = total(data.previous, m.id);
            return (
              <div key={m.id} style={card}>
                <div style={{ fontSize: '11px', color: C.muted, letterSpacing: '0.04em' }}>{m.label.toUpperCase()}</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: C.text, margin: '4px 0' }}>{m.fmt(cur)}</div>
                <div style={{ fontSize: '11px' }}>{deltaEl(cur, prev, false)}{prev > 0 && <span style={{ color: C.muted }}> ({m.fmt(prev)})</span>}</div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
          {METRICS.filter(m => !m.cost || data.cost_visible).map(m => <button key={m.id} style={btn(metric === m.id)} onClick={() => setMetric(m.id)}>{m.label}</button>)}
        </div>

        {/* Detail par service et par semaine */}
        <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>SERVICE</th>
                {data.weeks.map(w => <th key={w} style={th}>sem. {frShort(w)}</th>)}
                <th style={th}>TOTAL</th><th style={th}>N-1</th>
              </tr>
            </thead>
            <tbody>
              {data.services.length === 0 && <tr><td colSpan={data.weeks.length + 3} style={{ ...td, textAlign: 'center', color: C.muted }}>Aucun créneau sur cette période.</td></tr>}
              {data.services.map(s => {
                const cur = data.current[s] || [], prev = data.previous[s] || [];
                const tc = sum(cur, metric), tp = sum(prev, metric);
                return (
                  <tr key={s}>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{s}</td>
                    {data.weeks.map((w, i) => {
                      const v = cur[i]?.[metric] || 0, pv = prev[i]?.[metric] || 0;
                      return (
                        <td key={w} style={td} title={'Même semaine N-1 (' + frShort(data.weeks_n1[i]) + ') : ' + M.fmt(pv)}>
                          <div>{v ? M.fmt(v) : '—'}</div>
                          <div style={{ height: '4px', borderRadius: '2px', background: C.purple, opacity: 0.55, width: Math.round(v / maxVal * 100) + '%', marginLeft: 'auto', marginTop: '3px' }} />
                          {hasN1 && <div style={{ fontSize: '10px', color: C.muted, marginTop: '2px' }}>{pv ? M.fmt(pv) : '—'}</div>}
                        </td>
                      );
                    })}
                    <td style={{ ...td, fontWeight: 700 }}>{M.fmt(tc)}</td>
                    <td style={{ ...td, fontSize: '11px' }}>{tp ? <>{M.fmt(tp)}<div>{deltaEl(tc, tp, false)}</div></> : <span style={{ color: C.muted }}>—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: '11px', color: C.muted, marginTop: '10px', lineHeight: 1.6 }}>
          Heures : créneaux du planning, corrigés par les horaires déclarés (modifiés ou non travaillés). Heures au-delà du contrat : par salarié et par semaine,
          réparties entre ses services (en modulation, ce ne sont pas forcément des heures supplémentaires payées).
          {data.cost_visible && <> Coût : heures × taux horaire brut, hors majorations et charges patronales{data.estimated_rates > 0 ? ' ; ' + data.estimated_rates + ' salarié' + (data.estimated_rates > 1 ? 's' : '') + ' sans taux horaire sur la fiche : estimé au minimum conventionnel de son coefficient' : ''}.</>}
          {' '}N-1 : mêmes semaines un an plus tôt{hasN1 ? '' : ' (pas encore de données : le planning a commencé en 2026)'}.
        </div>
      </>)}
    </div>
  );
}
