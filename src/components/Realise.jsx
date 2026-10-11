import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTheme } from '../ThemeContext';
import supabase from '../supabase';
import { API } from '../config';
import { markSeen } from '../badges';

// Photo de pointage : miniature au survol (lien temporaire de 5 min), clic pour l'ouvrir en grand
function PhotoThumb({ photo, C }) {
  const [url, setUrl] = useState(null);
  const [show, setShow] = useState(false);
  async function getUrl() {
    if (url) return url;
    const { data } = await supabase.storage.from('documents-rh').createSignedUrl(photo.path, 300);
    if (data?.signedUrl) setUrl(data.signedUrl);
    return data?.signedUrl;
  }
  return (
    <span style={{ position: 'relative', display: 'inline-block', marginRight: '3px' }}
      onMouseEnter={() => { setShow(true); getUrl(); }} onMouseLeave={() => setShow(false)}>
      <button onClick={async () => { const u = await getUrl(); if (u) window.open(u, '_blank'); }} title={photo.label}
        style={{ background: 'none', border: 'none', padding: 0, fontSize: '12px', cursor: 'pointer' }}>📷</button>
      {show && (
        <span style={{ position: 'absolute', zIndex: 50, top: '100%', left: 0, marginTop: '4px', background: C.card, border: '1px solid ' + C.border, borderRadius: '8px', padding: '4px', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
          {url ? <img src={url} alt={photo.label} style={{ display: 'block', width: '160px', borderRadius: '6px' }} />
               : <span style={{ display: 'block', width: '160px', padding: '20px 0', textAlign: 'center', fontSize: '10px', color: C.muted }}>Chargement...</span>}
          <span style={{ display: 'block', fontSize: '10px', color: C.muted, textAlign: 'center', marginTop: '2px' }}>{photo.label}</span>
        </span>
      )}
    </span>
  );
}

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const months = ['jan', 'fév', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];

function getMonday(offset) {
  const now = new Date(); const day = now.getDay();
  const mon = new Date(now); mon.setDate(now.getDate() - day + (day === 0 ? -6 : 1) + offset * 7); mon.setHours(0, 0, 0, 0);
  return mon;
}
const fmtDate = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const fmtMin = min => { const s = min < 0 ? '−' : ''; const a = Math.abs(Math.round(min)); return s + Math.floor(a / 60) + 'h' + String(a % 60).padStart(2, '0'); };
const fmtDiff = min => (min > 0 ? '+' : '') + fmtMin(min);

// Pastilles courtes des anomalies (le libelle complet s'affiche au survol)
const SEVERITY = {
  absent: 'red', oubli_depart: 'red', oubli_arrivee: 'red', declare_non_travaille: 'red',
  declare_revise: 'pink',
  retard: 'amber', depart_anticipe: 'amber', declare_auto: 'amber',
  hors_planning: 'purple', declare_modifie: 'purple', a_valider: 'grey',
};
function shortLabel(a) {
  switch (a.code) {
    case 'absent': return 'Non pointé';
    case 'oubli_depart': return 'Départ manquant';
    case 'oubli_arrivee': return 'Arrivée manquante';
    case 'retard': return 'Retard ' + (a.minutes || '') + ' min';
    case 'depart_anticipe': return 'Départ −' + (a.minutes || '') + ' min';
    case 'hors_planning': return 'Hors planning';
    case 'a_valider': return 'À valider';
    case 'declare_modifie': return 'Modifié';
    case 'declare_non_travaille': return 'Non travaillé';
    case 'declare_auto': return 'Non validé';
    case 'declare_revise': return '↺ Revu';
    default: return a.label;
  }
}
const RANK = { red: 0, pink: 1, amber: 2, purple: 3, grey: 4 };

// Page manager : prevu (planning) / realise (pointeuse ou horaires declares), semaine par semaine
export default function Realise() {
  const { colors: C } = useTheme();
  const [weekOffset, setWeekOffset] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [service, setService] = useState('');
  // Alerte email en cas d'oubli de pointage (reglage partage, applique par le serveur toutes les 5 min)
  const [alertCfg, setAlertCfg] = useState({ enabled: false, delay_min: 30 });
  const [alertMsg, setAlertMsg] = useState('');
  useEffect(() => {
    axios.get(API + '/settings/alertes_pointage').then(r => { if (r.data?.value) setAlertCfg(c => ({ ...c, ...r.data.value })); }).catch(() => {});
    markSeen('realise', 'manager'); // pastille du menu : modifications d'horaires consultees
  }, []);
  async function saveAlertCfg(next) {
    const prev = alertCfg;
    setAlertCfg(next);
    try {
      await axios.patch(API + '/settings/alertes_pointage', next);
      setAlertMsg(next.enabled ? 'Alertes activées' : 'Alertes désactivées');
    } catch { setAlertCfg(prev); setAlertMsg('Erreur, réglage non enregistré'); }
    setTimeout(() => setAlertMsg(''), 2500);
  }
  const mon = getMonday(weekOffset);
  const end = new Date(mon); end.setDate(mon.getDate() + 6);
  const today = fmtDate(new Date());

  useEffect(() => {
    setLoading(true);
    axios.get(API + '/reports/realise?week=' + fmtDate(mon))
      .then(r => setData(r.data)).catch(() => setData(null)).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  const SEV = {
    red: { fg: C.red, bg: C.redLight, tint: C.redLight },
    pink: { fg: '#DB2777', bg: '#FDF2F8', tint: '#FDF2F8' },
    amber: { fg: C.amber, bg: C.amberLight, tint: C.amberLight },
    purple: { fg: C.purple, bg: C.purpleLight, tint: 'transparent' },
    grey: { fg: C.muted, bg: C.bg, tint: 'transparent' },
  };
  const worst = list => list.reduce((w, a) => { const s = SEVERITY[a.code] || 'amber'; return w === null || RANK[s] < RANK[w] ? s : w; }, null);

  const allRows = data?.rows || [];
  const services = [...new Set(allRows.map(r => r.service || 'Sans service'))].sort();
  const rows = allRows.filter(r => (!onlyIssues || r.anomalies > 0) && (!service || (r.service || 'Sans service') === service));
  const tot = rows.reduce((t, r) => ({ planned: t.planned + r.planned_min, worked: t.worked + r.worked_min, anomalies: t.anomalies + r.anomalies, retards: t.retards + r.retards }), { planned: 0, worked: 0, anomalies: 0, retards: 0 });
  const diffColor = d => (Math.abs(d) <= 5 ? C.green : d < 0 ? C.red : C.purple);
  const btn = { background: C.card, border: '1px solid ' + C.border, borderRadius: '8px', color: C.text, cursor: 'pointer', padding: '6px 12px', fontFamily: 'inherit', fontSize: '13px' };
  const th = { padding: '10px 8px', fontSize: '11px', fontWeight: 600, color: C.muted, textAlign: 'center', borderBottom: '1px solid ' + C.border, background: C.card, position: 'sticky', top: 0, zIndex: 2 };
  const td = { padding: '8px 6px', borderBottom: '1px solid ' + C.border + '99', borderLeft: '1px solid ' + C.border + '55', verticalAlign: 'top', textAlign: 'center', minWidth: '104px' };
  const verb = data?.declarative ? 'déclaré' : 'pointé';

  // Lignes regroupees par service
  let lastService = null;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", padding: '24px' }}>
      <div style={{ maxWidth: '1300px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', color: C.muted, letterSpacing: '0.1em', marginBottom: '4px' }}>{data?.declarative ? 'HORAIRES DÉCLARÉS' : 'POINTAGES'}</div>
            <div style={{ fontSize: '20px', fontWeight: 700 }}>Prévu / réalisé</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button style={btn} onClick={() => setWeekOffset(w => w - 1)} aria-label="Semaine précédente">‹</button>
            <span style={{ fontSize: '14px', fontWeight: 600, minWidth: '170px', textAlign: 'center' }}>{mon.getDate()} {months[mon.getMonth()]} → {end.getDate()} {months[end.getMonth()]} {end.getFullYear()}</span>
            <button style={btn} onClick={() => setWeekOffset(w => w + 1)} aria-label="Semaine suivante">›</button>
            {weekOffset !== 0 && <button style={{ ...btn, color: C.muted }} onClick={() => setWeekOffset(0)}>Cette semaine</button>}
          </div>
        </div>

        {/* Indicateurs de la semaine */}
        {data && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '14px' }}>
            {[
              { l: 'Heures prévues', v: fmtMin(tot.planned), c: C.text },
              { l: 'Heures réalisées', v: fmtMin(tot.worked), c: C.text },
              { l: 'Écart', v: fmtDiff(tot.worked - tot.planned), c: diffColor(tot.worked - tot.planned) },
              { l: 'Anomalies', v: tot.anomalies, c: tot.anomalies ? C.amber : C.green },
              { l: 'Retards', v: tot.retards, c: tot.retards ? C.amber : C.green },
            ].map(k => (
              <div key={k.l} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '12px 16px' }}>
                <div style={{ fontSize: '11px', color: C.muted, marginBottom: '4px' }}>{k.l}</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: k.c }}>{k.v}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filtres */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {[{ v: false, l: 'Tout afficher' }, { v: true, l: '⚠ Anomalies seulement' }].map(f => (
            <button key={f.l} onClick={() => setOnlyIssues(f.v)}
              style={{ ...btn, fontSize: '12px', borderRadius: '999px', background: onlyIssues === f.v ? C.purpleLight : C.card, color: onlyIssues === f.v ? C.purple : C.text, borderColor: onlyIssues === f.v ? C.purple : C.border, fontWeight: onlyIssues === f.v ? 600 : 400 }}>{f.l}</button>
          ))}
          {services.length > 1 && (
            <select value={service} onChange={e => setService(e.target.value)} style={{ ...btn, fontSize: '12px', borderRadius: '999px' }}>
              <option value="">Tous les services</option>
              {services.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {/* Legende */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '11px', color: C.muted, alignItems: 'center' }}>
            <span><b style={{ color: C.green }}>●</b> conforme</span>
            <span><b style={{ color: C.red }}>●</b> en moins / manquant</span>
            <span><b style={{ color: C.purple }}>●</b> en plus</span>
            <span><b style={{ color: C.amber }}>●</b> retard, à vérifier</span>
            <span><b style={{ color: '#DB2777' }}>●</b> revu par le salarié</span>
          </div>
        </div>

        {loading ? (
          <div style={{ color: C.muted, fontSize: '13px', textAlign: 'center', padding: '40px' }}>Chargement...</div>
        ) : !data || rows.length === 0 ? (
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '40px', textAlign: 'center', color: C.muted, fontSize: '14px' }}>
            {onlyIssues ? 'Aucune anomalie cette semaine 👍' : 'Aucun créneau ni pointage cette semaine'}
          </div>
        ) : (
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', overflow: 'auto', maxHeight: '75vh' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left', left: 0, zIndex: 3, minWidth: '170px', paddingLeft: '14px' }}>Salarié</th>
                  {data.days.map((d, i) => {
                    const isToday = d === today;
                    return (
                      <th key={d} style={{ ...th, color: isToday ? C.purple : C.muted, background: isToday ? C.purpleLight : C.card }}>
                        {DAYS[i]} <span style={{ fontSize: '14px', color: isToday ? C.purple : C.text }}>{parseInt(d.slice(8, 10), 10)}</span>
                      </th>
                    );
                  })}
                  <th style={{ ...th, minWidth: '110px' }}>Semaine</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const svc = r.service || 'Sans service';
                  const header = !service && svc !== lastService;
                  lastService = svc;
                  const wd = r.worked_min - r.planned_min;
                  return (
                    <React.Fragment key={r.employee_id}>
                      {header && (
                        <tr><td colSpan={9} style={{ padding: '6px 14px', background: C.bg, fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', color: C.muted, borderBottom: '1px solid ' + C.border }}>{svc.toUpperCase()}</td></tr>
                      )}
                      <tr>
                        <td style={{ ...td, textAlign: 'left', borderLeft: 'none', position: 'sticky', left: 0, background: C.card, zIndex: 1, paddingLeft: '14px' }}>
                          <div style={{ fontSize: '13px', fontWeight: 600 }}>{r.prenom} {r.nom}</div>
                          {r.anomalies > 0 && <div style={{ fontSize: '10px', color: C.amber, marginTop: '2px' }}>{r.anomalies} anomalie{r.anomalies > 1 ? 's' : ''}</div>}
                        </td>
                        {data.days.map(d => {
                          const c = r.days[d];
                          const isToday = d === today;
                          if (!c) return <td key={d} style={{ ...td, color: C.border, background: isToday ? C.purpleLight + '55' : 'transparent' }}>·</td>;
                          const sev = worst(c.anomalies);
                          const diff = c.worked_min - c.planned_min;
                          const hasWork = !!c.actual;
                          const title = [c.planned ? 'Prévu : ' + c.planned : 'Pas de créneau prévu', c.actual ? (c.declared ? 'Déclaré : ' : 'Pointé : ') + c.actual : null, ...c.anomalies.map(a => '• ' + a.label)].filter(Boolean).join('\n');
                          return (
                            <td key={d} title={title} style={{ ...td, background: sev ? SEV[sev].tint : isToday ? C.purpleLight + '55' : 'transparent' }}>
                              {/* Heures realisees (grosses), comparees au prevu */}
                              <div style={{ fontSize: '15px', fontWeight: 700, color: hasWork ? (c.planned_min ? diffColor(diff) : C.purple) : (c.planned_min ? C.red : C.muted) }}>
                                {hasWork ? fmtMin(c.worked_min) : '—'}
                              </div>
                              {c.planned_min > 0 && <div style={{ fontSize: '10px', color: C.muted }}>sur {fmtMin(c.planned_min)}</div>}
                              {c.actual && <div style={{ fontSize: '10px', color: C.muted, marginTop: '2px' }}>{c.declared ? '✍️ ' : ''}{c.actual}</div>}
                              {c.photos && c.photos.length > 0 && <div style={{ marginTop: '2px' }}>{c.photos.map((ph, i) => <PhotoThumb key={i} photo={ph} C={C} />)}</div>}
                              {c.anomalies.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', justifyContent: 'center', marginTop: '4px' }}>
                                  {[...c.anomalies].sort((x, y) => RANK[SEVERITY[x.code] || 'amber'] - RANK[SEVERITY[y.code] || 'amber']).map((a, i) => {
                                    const s = SEV[SEVERITY[a.code] || 'amber'];
                                    return <span key={i} title={a.label} style={{ fontSize: '10px', fontWeight: 600, color: s.fg, background: C.card, border: '1px solid ' + s.fg + '55', borderRadius: '999px', padding: '1px 7px', whiteSpace: 'nowrap' }}>{shortLabel(a)}</span>;
                                  })}
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>
                          <div style={{ fontSize: '15px', fontWeight: 700 }}>{fmtMin(r.worked_min)}</div>
                          <div style={{ fontSize: '10px', color: C.muted }}>sur {fmtMin(r.planned_min)}</div>
                          <span style={{ display: 'inline-block', marginTop: '4px', fontSize: '11px', fontWeight: 700, color: diffColor(wd), background: C.bg, borderRadius: '999px', padding: '1px 8px' }}>{fmtDiff(wd)}</span>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ fontSize: '11px', color: C.muted, marginTop: '10px', lineHeight: 1.6 }}>
          Dans chaque case : heures réalisées (pause déduite) sur heures prévues, puis horaires {verb}s. Survolez une case pour le détail.
          Retard et départ anticipé signalés au-delà de {data?.tolerance ?? 5} minutes. Les jours sans {data?.declarative ? 'déclaration' : 'pointage'} comptent 0 h.
        </div>

        {/* Alerte email d'oubli de pointage (inutile quand la pointeuse est desactivee) */}
        {!data?.declarative && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginTop: '18px', padding: '12px 16px', background: C.card, border: '1px solid ' + (alertCfg.enabled ? C.green + '88' : C.border), borderRadius: '12px' }}>
            <button onClick={() => saveAlertCfg({ ...alertCfg, enabled: !alertCfg.enabled })} aria-pressed={alertCfg.enabled}
              style={{ width: '42px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer', position: 'relative', background: alertCfg.enabled ? C.green : C.border, transition: 'background .2s', flexShrink: 0 }}>
              <span style={{ position: 'absolute', top: '3px', left: alertCfg.enabled ? '21px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
            </button>
            <div style={{ fontSize: '12px' }}>
              <strong>🔔 Me prévenir des oublis de pointage</strong>
              <div style={{ fontSize: '11px', color: C.muted }}>Email aux managers si une arrivée ou un départ n'est pas pointé, une fois par créneau.</div>
            </div>
            <label style={{ fontSize: '11px', color: C.muted, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
              Délai
              <select value={alertCfg.delay_min} onChange={e => saveAlertCfg({ ...alertCfg, delay_min: Number(e.target.value) })}
                style={{ background: C.bg, border: '1px solid ' + C.border, borderRadius: '6px', padding: '4px 6px', color: C.text, fontSize: '11px', fontFamily: 'inherit' }}>
                {[15, 30, 60].map(m => <option key={m} value={m}>{m} min</option>)}
              </select>
            </label>
            {alertMsg && <span style={{ fontSize: '11px', color: C.green }}>{alertMsg}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
