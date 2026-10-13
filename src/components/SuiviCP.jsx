import React, { useEffect, useState } from 'react';
import axios from 'axios';
import supabase from '../supabase';
import { useTheme } from '../ThemeContext';
import { API } from '../config';
import { computeCP, isCdi, fmtJ } from '../cp';

const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const num = v => (v === '' || v === null || v === undefined ? null : parseFloat(String(v).replace(',', '.')));

// Interrupteur (Parametrage > Conges payes) : afficher ou non le compteur dans l'espace salarie
export function CpSuiviToggle() {
  const { colors: C } = useTheme();
  const [on, setOn] = useState(null);
  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'cp_suivi').maybeSingle().then(({ data }) => setOn(!!data?.value?.afficher_salarie));
  }, []);
  async function toggle() {
    const v = !on; setOn(v);
    try { await axios.patch(API + '/settings/cp_suivi', { afficher_salarie: v }); } catch (e) { setOn(!v); alert('Erreur : ' + (e.response?.data?.error || e.message)); }
  }
  if (on === null) return null;
  return (
    <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '14px 16px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '14px' }}>
      <button onClick={toggle} aria-pressed={on} title={on ? 'Masquer' : 'Afficher'}
        style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', background: on ? C.green : C.border, position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
        <span style={{ position: 'absolute', top: '3px', left: on ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
      </button>
      <div style={{ fontSize: '12px', color: C.text, lineHeight: 1.5 }}>
        <strong>Afficher le compteur de congés payés dans l'espace salarié</strong>
        <div style={{ color: C.muted }}>Chaque salarié voit son solde estimé (calculé dans Paie › Suivi des CP), avec la mention « seul le bulletin de paie fait foi ».</div>
      </div>
    </div>
  );
}

// Paie > Suivi des CP : solde estime par salarie
export default function SuiviCP() {
  const { colors: C } = useTheme();
  const [emps, setEmps] = useState(null);
  const [abs, setAbs] = useState([]);
  const [edit, setEdit] = useState(null); // { id, date, n1, n }
  const [err, setErr] = useState('');
  const [visible, setVisible] = useState(null);
  const today = todayIso();

  async function load() {
    const [e, a, s] = await Promise.all([
      supabase.from('employees').select('id, first_name, last_name, service, contract_type, hire_date, contract_end_date, is_active, is_temp, cp_init_date, cp_init_n1, cp_init_n')
        .eq('is_active', true).eq('is_temp', false).order('last_name'),
      supabase.from('absence_requests').select('employee_id, type, status, start_date, end_date').eq('status', 'acceptee'),
      supabase.from('app_settings').select('value').eq('key', 'cp_suivi').maybeSingle(),
    ]);
    if (e.error || a.error) setErr((e.error || a.error).message);
    setEmps(e.data || []); setAbs(a.data || []); setVisible(!!s.data?.value?.afficher_salarie);
  }
  useEffect(() => { load(); }, []);

  async function saveInit() {
    const patch = { cp_init_date: edit.date || null, cp_init_n1: edit.date ? num(edit.n1) ?? 0 : null, cp_init_n: edit.date ? num(edit.n) ?? 0 : null };
    const { error } = await supabase.from('employees').update(patch).eq('id', edit.id);
    if (error) { setErr(error.message); return; }
    setEdit(null); load();
  }

  const rows = (emps || []).map(e => ({ e, r: computeCP(e, abs.filter(a => a.employee_id === e.id), today) }));
  const toInit = rows.filter(x => x.r.needsInit).length;

  function exportCsv() {
    const head = ['Nom', 'Prenom', 'Contrat', 'Calcul depuis', 'Reste N-1 (j)', 'Acquis N (j)', 'Solde (j)', 'Pris periode (j)', 'Poses a venir (j)', 'Solde apres conges poses (j)'];
    const n = x => String(x ?? '').replace('.', ',');
    const lines = rows.map(({ e, r }) => [e.last_name, e.first_name, e.contract_type, r.needsInit ? 'a initialiser' : fr(r.depuis),
      ...(r.needsInit ? ['', '', '', '', '', ''] : [n(r.n1), n(r.n), n(r.solde), n(r.prisPeriode), n(r.aVenir), n(r.apresPoses)])]);
    const csv = '﻿' + [head, ...lines].map(l => l.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'suivi-cp_' + today + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  }

  const th = { padding: '8px 10px', fontSize: '10px', color: C.muted, fontWeight: 600, textAlign: 'right', letterSpacing: '0.04em', borderBottom: '1px solid ' + C.border, whiteSpace: 'nowrap' };
  const td = { padding: '8px 10px', fontSize: '12px', color: C.text, textAlign: 'right', borderBottom: '1px solid ' + C.border + '88', whiteSpace: 'nowrap' };
  const inp = { width: '80px', background: C.bg, border: '1px solid ' + C.border, borderRadius: '6px', padding: '5px 7px', color: C.text, fontSize: '12px', fontFamily: 'inherit' };
  const btn = { background: C.card, border: '1px solid ' + C.border, borderRadius: '8px', padding: '7px 12px', color: C.text, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600 };

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: C.text }}>Suivi des congés payés</div>
          <div style={{ fontSize: '12px', color: C.muted, marginTop: '4px', lineHeight: 1.6, maxWidth: '760px' }}>
            Acquisition de 2,5 jours ouvrables par mois (2 jours en arrêt maladie, aucun en congé sans solde), période du 1<sup>er</sup> juin au 31 mai.
            Les congés payés acceptés sont décomptés en jours ouvrables (lundi au samedi, hors fériés), d'abord sur N-1.
            CDI : saisissez une fois le solde de votre dernier bulletin, le calcul continue ensuite tout seul. Saisonniers et CDD : calcul depuis l'embauche.
          </div>
          <div style={{ fontSize: '11px', color: C.muted, marginTop: '4px', fontStyle: 'italic' }}>Estimation indicative : seul le bulletin de paie fait foi.</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {visible !== null && <span style={{ fontSize: '11px', color: visible ? C.green : C.muted }}>{visible ? '👁️ Visible par les salariés' : '🙈 Masqué aux salariés'} (Paramétrage › Congés payés)</span>}
          <button style={btn} onClick={exportCsv} disabled={!emps}>⬇️ CSV</button>
        </div>
      </div>

      {err && <div style={{ background: C.redLight, color: C.red, borderRadius: '8px', padding: '8px 12px', fontSize: '12px', marginBottom: '12px' }}>{err}</div>}
      {toInit > 0 && <div style={{ background: C.amberLight, color: C.amber, borderRadius: '8px', padding: '8px 12px', fontSize: '12px', marginBottom: '12px' }}>⚠️ {toInit} salarié{toInit > 1 ? 's' : ''} à initialiser : cliquez sur « Saisir le solde » et reprenez les compteurs N-1 et N de son dernier bulletin.</div>}

      {!emps ? <div style={{ color: C.muted, fontSize: '13px' }}>Chargement...</div> : (
        <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>SALARIÉ</th><th style={{ ...th, textAlign: 'left' }}>CONTRAT</th><th style={{ ...th, textAlign: 'left' }}>DEPUIS</th>
                <th style={th}>RESTE N-1</th><th style={th}>ACQUIS N</th><th style={th}>SOLDE</th><th style={th}>PRIS (PÉRIODE)</th><th style={th}>POSÉS À VENIR</th><th style={th}>APRÈS CONGÉS POSÉS</th><th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ e, r }) => (
                <React.Fragment key={e.id}>
                  <tr>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{e.last_name} {e.first_name}</td>
                    <td style={{ ...td, textAlign: 'left', color: C.muted }}>{e.contract_type || '—'}{r.finContrat ? ' · fin ' + fr(r.finContrat) : ''}</td>
                    <td style={{ ...td, textAlign: 'left', color: C.muted }}>{r.needsInit ? '—' : (e.cp_init_date ? 'solde au ' : 'embauche ') + fr(r.depuis)}</td>
                    {r.needsInit ? <td colSpan={6} style={{ ...td, textAlign: 'center', color: C.amber }}>{isCdi(e) ? 'Solde de départ à saisir' : "Date d'embauche manquante"}</td> : (
                      <>
                        <td style={td}>{fmtJ(r.n1)}{r.reliquat > 0 && <span title={'Reste de ' + fmtJ(r.reliquat) + ' non pris au 31 mai : report ou perte à vérifier'} style={{ color: C.amber }}> ⚠️</span>}</td>
                        <td style={td}>{fmtJ(r.n)}</td>
                        <td style={{ ...td, fontWeight: 700, color: r.solde < 0 ? C.red : C.purple }}>{fmtJ(r.solde)}</td>
                        <td style={td}>{fmtJ(r.prisPeriode)}</td>
                        <td style={td}>{r.aVenir ? fmtJ(r.aVenir) : '—'}</td>
                        <td style={{ ...td, color: r.apresPoses < 0 ? C.red : C.text }}>{fmtJ(r.apresPoses)}</td>
                      </>
                    )}
                    <td style={td}>
                      <button onClick={() => setEdit(edit?.id === e.id ? null : { id: e.id, date: e.cp_init_date || '', n1: e.cp_init_n1 ?? '', n: e.cp_init_n ?? '' })}
                        style={{ ...btn, padding: '4px 9px', fontSize: '11px', color: r.needsInit ? C.amber : C.muted }}>
                        {r.needsInit && isCdi(e) ? 'Saisir le solde' : '✏️'}
                      </button>
                    </td>
                  </tr>
                  {edit?.id === e.id && (
                    <tr>
                      <td colSpan={10} style={{ ...td, textAlign: 'left', background: C.bg, whiteSpace: 'normal' }}>
                        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ color: C.muted }}>Reprise du solde du bulletin :</span>
                          <label>au <input type="date" style={{ ...inp, width: '140px' }} value={edit.date} onChange={ev => setEdit(x => ({ ...x, date: ev.target.value }))} /></label>
                          <label>reste N-1 <input style={inp} inputMode="decimal" value={edit.n1} onChange={ev => setEdit(x => ({ ...x, n1: ev.target.value }))} placeholder="0" /> j</label>
                          <label>acquis N <input style={inp} inputMode="decimal" value={edit.n} onChange={ev => setEdit(x => ({ ...x, n: ev.target.value }))} placeholder="0" /> j</label>
                          <button style={{ ...btn, background: C.purple, color: '#fff', border: 'none' }} onClick={saveInit}>Enregistrer</button>
                          <button style={btn} onClick={() => setEdit(null)}>Annuler</button>
                          {!isCdi(e) && <span style={{ color: C.muted, fontSize: '11px' }}>Facultatif pour un saisonnier : laissez la date vide pour calculer depuis l'embauche.</span>}
                        </div>
                        <div style={{ color: C.muted, fontSize: '11px', marginTop: '6px' }}>Jours ouvrables. Prenez la date de fin de période du bulletin (ex : 30/09) : les congés acquis et pris après cette date sont ajoutés automatiquement.</div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
