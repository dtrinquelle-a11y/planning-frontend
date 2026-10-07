import React, { useEffect, useState } from 'react';
import axios from 'axios';
import supabase from '../supabase';
import { useTheme } from '../ThemeContext';

const API = 'https://mon-planning-production.up.railway.app/api';
const MOIS = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Aout','Septembre','Octobre','Novembre','Decembre'];

// Mois precedent par defaut (c'est celui qu'on transmet au comptable)
function defaultMonth() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// Jours d'une absence compris dans le mois (bornes incluses)
function daysInMonth(a, du, au) {
  const s = String(a.start_date).slice(0, 10) > du ? String(a.start_date).slice(0, 10) : du;
  const e = String(a.end_date).slice(0, 10) < au ? String(a.end_date).slice(0, 10) : au;
  if (e < s) return 0;
  return Math.round((new Date(e + 'T00:00:00') - new Date(s + 'T00:00:00')) / 86400000) + 1;
}

const num = v => (v === null || v === undefined ? '' : String(v).replace('.', ','));
// "2026-06-01" -> "01/06/2026"
const frD = v => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');
const fmtH = v => (v === null || v === undefined ? '—' : String(v).replace('.', ',') + ' h');

// Colonnes de l'export (libelle, valeur)
const COLUMNS = [
  ['Nom', r => r.nom], ['Prenom', r => r.prenom], ['Service', r => r.service], ['Contrat', r => r.contrat],
  ['Debut de contrat', r => frD(r.debut_contrat)], ['Fin de contrat', r => frD(r.fin_contrat)],
  ['Heures contrat / semaine', r => num(r.heures_contrat)],
  ['Heures planifiees', r => num(r.heures_planifiees)],
  ['Heures realisees (pointage)', r => num(r.heures_realisees)],
  ['Ecart realise - planifie', r => (r.heures_realisees === null ? '' : num(Math.round((r.heures_realisees - r.heures_planifiees) * 100) / 100))],
  ['Heures au-dela du contrat', r => num(r.heures_au_dela_contrat)],
  ['HS modulees payees', r => num(r.val.paid)],
  ['HS modulees reportees au compteur', r => num(r.val.banked)],
  ['Cumul reporte sur la periode de modulation', r => num(r.cumulBanked)],
  ['Detail par semaine', r => r.semaines.map(w => 'sem. du ' + w.monday.slice(8, 10) + '/' + w.monday.slice(5, 7) + ' : ' + num(w.heures) + ' h').join(' | ')],
  ['Dimanches (jours)', r => r.dimanches_jours], ['Dimanches (heures)', r => num(r.dimanches_heures)],
  ['Feries (jours)', r => r.feries_jours], ['Feries (heures)', r => num(r.feries_heures)],
  ['Conges payes (jours)', r => r.abs.conge_paye], ['Arret maladie (jours)', r => r.abs.maladie],
  ['Sans solde (jours)', r => r.abs.sans_solde], ['Repos / autres absences (jours)', r => r.abs.autres],
  ['Retards', r => r.retards], ['Cumul modulation (h)', r => num(r.modulation_cumul)],
];

export default function ExportPaie() {
  const { colors: C } = useTheme();
  const [month, setMonth] = useState(defaultMonth());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [vals, setVals] = useState({});           // { employee_id: { paid, banked } } saisis ou valides
  const [validated, setValidated] = useState(null); // date de validation du mois (null = a valider)
  const [dirty, setDirty] = useState(false);       // modifications non validees
  const [cumul, setCumul] = useState({});          // reporte cumule sur la periode de modulation (mois valides precedents)
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function load() {
    setLoading(true); setError('');
    try {
      const { data: res } = await axios.get(API + '/exports/paie?month=' + month);
      // Absences acceptees du mois (decomptees en jours calendaires sur le mois)
      const { data: abs } = await supabase.from('absence_requests').select('employee_id, type, start_date, end_date')
        .eq('status', 'acceptee').lte('start_date', res.au).gte('end_date', res.du);
      const rows = res.rows.map(r => {
        const counts = { conge_paye: 0, maladie: 0, sans_solde: 0, autres: 0 };
        (abs || []).filter(a => a.employee_id === r.employee_id).forEach(a => {
          const n = daysInMonth(a, res.du, res.au);
          if (counts[a.type] !== undefined) counts[a.type] += n; else counts.autres += n;
        });
        return { ...r, abs: counts };
      });
      setData({ ...res, rows });

      const { data: pm } = await supabase.from('payroll_months').select('*').eq('month', month);
      const byEmp = Object.fromEntries((pm || []).map(v => [v.employee_id, v]));
      setVals(Object.fromEntries(rows.map(r => [r.employee_id, byEmp[r.employee_id]
        ? { paid: Number(byEmp[r.employee_id].overtime_paid), banked: Number(byEmp[r.employee_id].overtime_banked) }
        : { paid: 0, banked: r.heures_au_dela_contrat }])));
      const allValidated = rows.length > 0 && rows.every(r => byEmp[r.employee_id]);
      setValidated(allValidated ? (pm || []).map(v => v.validated_at).sort().pop() : null);
      setDirty(false);
      // Mois deja valides de la periode de modulation, avant le mois affiche
      const [yy, mm] = month.split('-').map(Number);
      const periodStart = (mm >= 11 ? yy : yy - 1) + '-11';
      const { data: prev } = await supabase.from('payroll_months').select('employee_id, overtime_banked')
        .gte('month', periodStart).lt('month', month);
      const c = {};
      (prev || []).forEach(v => { c[v.employee_id] = (c[v.employee_id] || 0) + Number(v.overtime_banked); });
      setCumul(c);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setData(null);
    } finally { setLoading(false); }
  }

  function setVal(empId, field, value) {
    const v = value === '' ? '' : Math.max(0, parseFloat(String(value).replace(',', '.')) || 0);
    setVals(prev => ({ ...prev, [empId]: { ...prev[empId], [field]: v } }));
    setDirty(true);
  }

  // Enregistre la repartition payees / reportees pour tous les salaries du mois
  async function validateMonth() {
    setSaving(true); setError('');
    try {
      const payload = data.rows.map(r => ({
        employee_id: r.employee_id, month,
        overtime_computed: r.heures_au_dela_contrat,
        overtime_paid: Number(vals[r.employee_id]?.paid) || 0,
        overtime_banked: Number(vals[r.employee_id]?.banked) || 0,
        validated_at: new Date().toISOString(),
      }));
      const { error: e } = await supabase.from('payroll_months').upsert(payload, { onConflict: 'employee_id,month' });
      if (e) throw e;
      await load();
    } catch (err) {
      setError(err.message);
    } finally { setSaving(false); }
  }

  // Fichier CSV lisible par Excel (separateur ";", virgule decimale, encodage UTF-8 avec BOM)
  function downloadCsv() {
    const esc = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rowsOut = data.rows.map(r => ({ ...r, val: vals[r.employee_id] || { paid: 0, banked: 0 },
      cumulBanked: Math.round(((cumul[r.employee_id] || 0) + (Number(vals[r.employee_id]?.banked) || 0)) * 100) / 100 }));
    const lines = [COLUMNS.map(c => esc(c[0])).join(';'), ...rowsOut.map(r => COLUMNS.map(c => esc(c[1](r))).join(';'))];
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'variables-paie-' + month + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  const [y, m] = month.split('-');
  const th = { padding: '6px 8px', fontSize: '10px', color: C.muted, textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid ' + C.border, fontWeight: 500 };
  const td = { padding: '6px 8px', fontSize: '12px', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid ' + C.border + '88' };
  const totals = data ? data.rows.reduce((t, r) => ({
    planif: t.planif + r.heures_planifiees, dela: t.dela + r.heures_au_dela_contrat, dim: t.dim + r.dimanches_jours,
    fer: t.fer + r.feries_jours, cp: t.cp + r.abs.conge_paye, mal: t.mal + r.abs.maladie,
  }), { planif: 0, dela: 0, dim: 0, fer: 0, cp: 0, mal: 0 }) : null;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Mono','Courier New',monospace", padding: '24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', color: C.muted, letterSpacing: '0.1em', marginBottom: '4px' }}>PAIE</div>
            <div style={{ fontSize: '18px', fontWeight: 600 }}>Variables de paie · {MOIS[parseInt(m, 10) - 1]} {y}</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)}
              style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '6px', padding: '6px 10px', color: C.text, fontSize: '12px', fontFamily: 'inherit' }} />
            <button onClick={validateMonth} disabled={!data || !data.rows.length || saving}
              style={{ background: C.green, border: 'none', borderRadius: '8px', padding: '8px 16px', color: '#fff', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Validation...' : validated && !dirty ? '✓ Revalider le mois' : '✓ Valider le mois'}
            </button>
            <button onClick={downloadCsv} disabled={!validated || dirty} title={!validated || dirty ? 'Validez d\'abord les heures du mois' : ''}
              style={{ background: C.purple, border: 'none', borderRadius: '8px', padding: '8px 16px', color: '#fff', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600, cursor: validated && !dirty ? 'pointer' : 'not-allowed', opacity: validated && !dirty ? 1 : 0.5 }}>
              ↓ Télécharger pour Excel
            </button>
          </div>
        </div>

        {data && data.rows.length > 0 && (
          <div style={{ marginBottom: '12px', padding: '8px 14px', borderRadius: '8px', fontSize: '12px',
            background: validated && !dirty ? C.greenLight : C.amberLight, border: '1px solid ' + (validated && !dirty ? C.green : C.amber) + '66' }}>
            {validated && !dirty
              ? '✓ Mois validé le ' + new Date(validated).toLocaleDateString('fr-FR') + ' à ' + new Date(validated).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + ' : export disponible.'
              : dirty ? '✏️ Modifications non validées : cliquez sur « Valider le mois » avant d\'exporter.'
              : '⏳ À valider : répartissez les heures au-delà du contrat entre « payées » et « reportées au compteur », puis validez le mois.'}
          </div>
        )}

        {totals && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
            {[['Salariés', data.rows.length], ['Heures planifiées', fmtH(Math.round(totals.planif * 100) / 100)], ['Au-delà des contrats', fmtH(Math.round(totals.dela * 100) / 100)],
              ['Dimanches travaillés', totals.dim + ' j'], ['Fériés travaillés', totals.fer + ' j'], ['Congés payés', totals.cp + ' j'], ['Maladie', totals.mal + ' j']].map(([l, v]) => (
              <div key={l} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '8px', padding: '8px 12px' }}>
                <div style={{ fontSize: '10px', color: C.muted }}>{l}</div>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>{v}</div>
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div style={{ color: C.muted, fontSize: '12px', textAlign: 'center', padding: '30px' }}>Calcul en cours...</div>
        ) : error ? (
          <div style={{ color: C.red, fontSize: '12px', padding: '20px' }}>Erreur : {error}</div>
        ) : data && (
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Salarié</th>
                  <th style={th}>Contrat</th><th style={th}>Planifié</th><th style={th}>Réalisé</th><th style={th}>Au-delà contrat</th>
                  <th style={th}>HS payées</th><th style={th}>HS reportées</th>
                  <th style={th}>Dim.</th><th style={th}>Fériés</th>
                  <th style={th}>CP</th><th style={th}>Maladie</th><th style={th}>Ss solde</th><th style={th}>Autres abs.</th>
                  <th style={th}>Retards</th><th style={th}>Modulation</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map(r => (
                  <tr key={r.employee_id}>
                    <td style={{ ...td, textAlign: 'left' }}>
                      <div style={{ fontWeight: 500 }}>{r.prenom} {r.nom}{r.temporaire ? ' (temp)' : ''}</div>
                      <div style={{ fontSize: '10px', color: C.muted }}>{r.service}</div>
                    </td>
                    <td style={td}>
                      <div>{r.contrat} · {num(r.heures_contrat)} h</div>
                      {(r.debut_contrat || r.fin_contrat) && <div style={{ fontSize: '10px', color: C.muted }}>{r.debut_contrat ? 'du ' + frD(r.debut_contrat) : ''}{r.fin_contrat ? ' au ' + frD(r.fin_contrat) : (r.debut_contrat ? ' · en cours' : '')}</div>}
                    </td>
                    <td style={td}>{fmtH(r.heures_planifiees)}</td>
                    <td style={td}>{fmtH(r.heures_realisees)}</td>
                    <td style={{ ...td, color: r.heures_au_dela_contrat > 0 ? C.amber : C.text }} title={r.semaines.map(w => 'Semaine du ' + w.monday.split('-').reverse().join('/') + ' : ' + num(w.heures) + ' h').join('\n')}>{fmtH(r.heures_au_dela_contrat)}</td>
                    {['paid', 'banked'].map(f => (
                      <td key={f} style={td}>
                        <input type="number" min="0" step="0.25" value={vals[r.employee_id]?.[f] ?? ''} onChange={e => setVal(r.employee_id, f, e.target.value)}
                          style={{ width: '64px', textAlign: 'right', background: C.bg, border: '1px solid ' + C.border, borderRadius: '5px', padding: '3px 5px', color: C.text, fontSize: '12px', fontFamily: 'inherit' }} />
                        {f === 'banked' && (() => { const v = vals[r.employee_id] || {}; const diff = Math.round(((Number(v.paid) || 0) + (Number(v.banked) || 0) - r.heures_au_dela_contrat) * 100) / 100;
                          return diff !== 0 ? <div style={{ fontSize: '9px', color: C.amber }} title="Payées + reportées ≠ heures au-delà du contrat">écart {diff > 0 ? '+' : ''}{String(diff).replace('.', ',')} h</div> : null; })()}
                        {f === 'banked' && cumul[r.employee_id] ? <div style={{ fontSize: '9px', color: C.muted }}>cumul période : {String(Math.round((cumul[r.employee_id] + (Number(vals[r.employee_id]?.banked) || 0)) * 100) / 100).replace('.', ',')} h</div> : null}
                      </td>
                    ))}
                    <td style={td}>{r.dimanches_jours ? r.dimanches_jours + ' j · ' + fmtH(r.dimanches_heures) : '—'}</td>
                    <td style={td}>{r.feries_jours ? r.feries_jours + ' j · ' + fmtH(r.feries_heures) : '—'}</td>
                    <td style={td}>{r.abs.conge_paye || '—'}</td>
                    <td style={td}>{r.abs.maladie || '—'}</td>
                    <td style={td}>{r.abs.sans_solde || '—'}</td>
                    <td style={td}>{r.abs.autres || '—'}</td>
                    <td style={td}>{r.retards || '—'}</td>
                    <td style={td}>{fmtH(r.modulation_cumul)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ fontSize: '11px', color: C.muted, marginTop: '10px', lineHeight: 1.6 }}>
          Heures nettes (pauses déduites). « Au-delà du contrat » : somme, par semaine rattachée au mois, des heures planifiées au-delà de la durée du contrat (survolez pour le détail).
          « HS payées / reportées » : répartition décidée par vous et enregistrée à la validation ; le cumul reporté couvre la période de modulation (1er novembre - 31 octobre). Absences : jours calendaires acceptés sur le mois. Le fichier téléchargé contient toutes les colonnes, dont le détail par semaine.
        </div>
      </div>
    </div>
  );
}
