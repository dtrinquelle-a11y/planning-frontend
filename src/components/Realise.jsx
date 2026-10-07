import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTheme } from '../ThemeContext';

const API = 'https://mon-planning-production.up.railway.app/api';
const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const months = ['jan', 'fev', 'mars', 'avr', 'mai', 'juin', 'juil', 'aout', 'sep', 'oct', 'nov', 'dec'];

function getMonday(offset) {
  const now = new Date(); const day = now.getDay();
  const mon = new Date(now); mon.setDate(now.getDate() - day + (day === 0 ? -6 : 1) + offset * 7); mon.setHours(0, 0, 0, 0);
  return mon;
}
const fmtDate = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const fmtMin = min => { const s = min < 0 ? '-' : ''; const a = Math.abs(Math.round(min)); return s + Math.floor(a / 60) + 'h' + String(a % 60).padStart(2, '0'); };

// Page manager : prevu (planning) / realise (pointeuse), semaine par semaine
export default function Realise() {
  const { colors: C } = useTheme();
  const [weekOffset, setWeekOffset] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [onlyIssues, setOnlyIssues] = useState(false);
  const mon = getMonday(weekOffset);
  const end = new Date(mon); end.setDate(mon.getDate() + 6);

  useEffect(() => {
    setLoading(true);
    axios.get(API + '/reports/realise?week=' + fmtDate(mon))
      .then(r => setData(r.data)).catch(() => setData(null)).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  const ANOM_COLOR = { absent: C.red, oubli_depart: C.red, oubli_arrivee: C.red, retard: C.amber, depart_anticipe: C.amber, hors_planning: C.purple };
  const rows = (data?.rows || []).filter(r => !onlyIssues || r.anomalies > 0);
  const tot = (data?.rows || []).reduce((t, r) => ({ planned: t.planned + r.planned_min, worked: t.worked + r.worked_min, anomalies: t.anomalies + r.anomalies, retards: t.retards + r.retards }), { planned: 0, worked: 0, anomalies: 0, retards: 0 });
  const btn = { background: 'none', border: '1px solid ' + C.border, borderRadius: '6px', color: C.text, cursor: 'pointer', padding: '4px 10px', fontFamily: 'inherit', fontSize: '13px' };
  const cell = { padding: '6px', borderBottom: '1px solid ' + C.border + '88', borderLeft: '1px solid ' + C.border + '55', verticalAlign: 'top', fontSize: '11px', minWidth: '96px' };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Mono','Courier New',monospace", padding: '24px' }}>
      <div style={{ maxWidth: '1300px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '11px', color: C.muted, letterSpacing: '0.1em', marginBottom: '4px' }}>POINTAGES</div>
            <div style={{ fontSize: '18px', fontWeight: 600 }}>Prévu / réalisé</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button style={btn} onClick={() => setWeekOffset(w => w - 1)}>{'<'}</button>
            <span style={{ fontSize: '12px', minWidth: '150px', textAlign: 'center' }}>{mon.getDate()} {months[mon.getMonth()]} → {end.getDate()} {months[end.getMonth()]} {end.getFullYear()}</span>
            <button style={btn} onClick={() => setWeekOffset(w => w + 1)}>{'>'}</button>
            <button style={{ ...btn, fontSize: '11px', color: C.muted }} onClick={() => setWeekOffset(0)}>Auj.</button>
            <label style={{ fontSize: '11px', color: C.muted, display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
              <input type="checkbox" checked={onlyIssues} onChange={e => setOnlyIssues(e.target.checked)} /> Anomalies seulement
            </label>
          </div>
        </div>

        {data && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
            {[['Prévu', fmtMin(tot.planned)], ['Réalisé (pointé)', fmtMin(tot.worked)], ['Écart', fmtMin(tot.worked - tot.planned)], ['Anomalies', tot.anomalies], ['Retards', tot.retards]].map(([l, v]) => (
              <div key={l} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '8px', padding: '8px 12px' }}>
                <div style={{ fontSize: '10px', color: C.muted }}>{l}</div>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>{v}</div>
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div style={{ color: C.muted, fontSize: '12px', textAlign: 'center', padding: '30px' }}>Chargement...</div>
        ) : !data || rows.length === 0 ? (
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '30px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>
            {onlyIssues ? 'Aucune anomalie cette semaine 👍' : 'Aucun créneau ni pointage cette semaine'}
          </div>
        ) : (
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ ...cell, borderLeft: 'none', textAlign: 'left', color: C.muted, fontWeight: 500, minWidth: '150px' }}>Salarié</th>
                  {data.days.map((d, i) => <th key={d} style={{ ...cell, color: C.muted, fontWeight: 500, textAlign: 'left' }}>{DAYS[i]} {parseInt(d.slice(8, 10), 10)}</th>)}
                  <th style={{ ...cell, color: C.muted, fontWeight: 500, textAlign: 'right' }}>Semaine</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.employee_id}>
                    <td style={{ ...cell, borderLeft: 'none' }}>
                      <div style={{ fontSize: '12px', fontWeight: 500 }}>{r.prenom} {r.nom}</div>
                      <div style={{ fontSize: '10px', color: C.muted }}>{r.service}</div>
                    </td>
                    {data.days.map(d => {
                      const c = r.days[d];
                      if (!c) return <td key={d} style={{ ...cell, color: C.border }}>—</td>;
                      const bad = c.anomalies.length > 0;
                      return (
                        <td key={d} style={{ ...cell, background: bad ? C.amberLight : 'transparent' }}>
                          {c.planned && <div style={{ color: C.muted }}>prévu {c.planned}</div>}
                          <div style={{ fontWeight: 500 }}>{c.actual ? 'pointé ' + c.actual : <span style={{ color: C.muted }}>non pointé</span>}</div>
                          {c.anomalies.map((a, i) => <div key={i} style={{ color: ANOM_COLOR[a.code] || C.amber, fontSize: '10px', fontWeight: 600 }}>⚠ {a.label}</div>)}
                        </td>
                      );
                    })}
                    <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div>prévu {fmtMin(r.planned_min)}</div>
                      <div style={{ fontWeight: 600 }}>réalisé {fmtMin(r.worked_min)}</div>
                      <div style={{ color: r.worked_min - r.planned_min < 0 ? C.red : C.green, fontSize: '10px' }}>écart {fmtMin(r.worked_min - r.planned_min)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ fontSize: '11px', color: C.muted, marginTop: '10px', lineHeight: 1.6 }}>
          Heures nettes : la pause prévue au planning est déduite du temps pointé. Retard et départ anticipé signalés au-delà de {data?.tolerance ?? 5} minutes.
          Les jours non pointés comptent 0 h réalisée.
        </div>
      </div>
    </div>
  );
}
