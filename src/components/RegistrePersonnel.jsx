import React, { useEffect, useState } from 'react';
import supabase from '../supabase';
import { useTheme } from '../ThemeContext';

const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Mentions obligatoires (art. L1221-13 et D1221-23 du code du travail)
const COLS = [
  { k: 'ordre', l: 'N°' },
  { k: 'nom', l: 'Nom' }, { k: 'prenoms', l: 'Prénoms' }, { k: 'sexe', l: 'Sexe', req: true },
  { k: 'nationalite', l: 'Nationalité', req: true }, { k: 'date_naissance', l: 'Né(e) le', req: true, date: true },
  { k: 'emploi', l: 'Emploi', req: true }, { k: 'qualification', l: 'Qualification', req: true },
  { k: 'contrat', l: 'Contrat' }, { k: 'entree', l: 'Entrée', date: true, req: true }, { k: 'sortie', l: 'Sortie', date: true },
  { k: 'titre', l: 'Titre de travail (étrangers)' },
];

// Paie > Registre unique du personnel : une ligne par embauche, dans l'ordre des entrees, tenu automatiquement
export default function RegistrePersonnel() {
  const { colors: C } = useTheme();
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('tous'); // tous / presents / sortis
  const [err, setErr] = useState('');

  useEffect(() => {
    supabase.from('personnel_register').select('*').order('entree').order('nom').then(({ data, error }) => {
      if (error) setErr(error.message);
      setRows((data || []).map((r, i) => ({
        ...r, ordre: i + 1,
        contrat: [r.type_contrat, r.temps_partiel ? 'temps partiel (' + String(r.heures).replace('.', ',') + ' h)' : null].filter(Boolean).join(', '),
        titre: [r.titre_travail_type, r.titre_travail_numero ? 'n° ' + r.titre_travail_numero : null].filter(Boolean).join(' '),
      })));
    });
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const fiveYears = new Date(); fiveYears.setFullYear(fiveYears.getFullYear() - 5);
  const list = (rows || []).filter(r => filter === 'tous' ? true : filter === 'presents' ? !r.sortie || r.sortie >= today : r.sortie && r.sortie < today);
  const missing = r => COLS.filter(c => c.req && !r[c.k]).map(c => c.l);
  const incomplete = (rows || []).filter(r => missing(r).length).length;
  const value = (r, c) => c.date ? fr(r[c.k]) : r[c.k] ?? '';

  function exportCsv() {
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const lines = [COLS.map(c => q(c.l)).join(';'), ...list.map(r => COLS.map(c => q(value(r, c))).join(';'))];
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'registre-unique-du-personnel_' + today + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  // Version imprimable (A4 paysage) : a imprimer ou enregistrer en PDF depuis le navigateur
  function print() {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Registre unique du personnel</title><style>'
      + '@page{size:A4 landscape;margin:12mm}body{font-family:Arial,sans-serif;font-size:9px;color:#111}h1{font-size:15px;margin:0 0 4px}p{margin:0 0 10px;color:#555}'
      + 'table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:3px 4px;text-align:left;vertical-align:top}th{background:#eee}</style></head><body>'
      + '<h1>Registre unique du personnel</h1><p>Établi le ' + new Date().toLocaleDateString('fr-FR') + ' · Articles L1221-13 et D1221-23 du code du travail · Mentions conservées 5 ans après le départ du salarié.</p>'
      + '<table><thead><tr>' + COLS.map(c => '<th>' + esc(c.l) + '</th>').join('') + '</tr></thead><tbody>'
      + list.map(r => '<tr>' + COLS.map(c => '<td>' + esc(value(r, c)) + '</td>').join('') + '</tr>').join('')
      + '</tbody></table></body></html>');
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  }

  const btn = { background: C.card, border: '1px solid ' + C.border, borderRadius: '8px', padding: '8px 14px', color: C.text, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600 };
  const th = { padding: '8px 6px', fontSize: '11px', color: C.muted, fontWeight: 600, textAlign: 'left', borderBottom: '1px solid ' + C.border, background: C.card, position: 'sticky', top: 0, whiteSpace: 'nowrap' };
  const td = { padding: '7px 6px', fontSize: '12px', borderBottom: '1px solid ' + C.border + '88', verticalAlign: 'top' };

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1300px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div style={{ maxWidth: '720px' }}>
          <div style={{ fontSize: '16px', fontWeight: 600, color: C.text, marginBottom: '4px' }}>Registre unique du personnel</div>
          <div style={{ fontSize: '12px', color: C.muted, lineHeight: 1.6 }}>
            Tenu automatiquement à partir des fiches : une ligne par embauche, dans l'ordre des entrées, avec les mentions obligatoires.
            Une nouvelle saison crée une nouvelle ligne ; les lignes sont conservées 5 ans après le départ, même si la fiche est supprimée.
            Pour compléter une mention, complétez la fiche du salarié (Dossiers RH) ou son onboarding.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{ ...btn, fontWeight: 400 }}>
            <option value="tous">Tous les salariés</option><option value="presents">Présents</option><option value="sortis">Sortis</option>
          </select>
          <button onClick={exportCsv} style={btn}>↓ Excel (CSV)</button>
          <button onClick={print} style={{ ...btn, background: C.purple, borderColor: C.purple, color: '#fff' }}>🖨 Imprimer / PDF</button>
        </div>
      </div>
      {err && <div style={{ color: C.red, fontSize: '12px', marginBottom: '10px' }}>{err}</div>}
      {incomplete > 0 && (
        <div style={{ background: C.amberLight, borderRadius: '10px', padding: '10px 14px', fontSize: '12px', color: C.text, marginBottom: '12px' }}>
          ⚠ {incomplete} ligne(s) avec une mention obligatoire manquante (cases orange). Les salariés étrangers hors UE doivent aussi avoir leur titre de travail renseigné.
        </div>
      )}
      {rows === null ? <div style={{ color: C.muted, fontSize: '13px' }}>Chargement...</div> : (
        <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', overflow: 'auto', maxHeight: '72vh' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{COLS.map(c => <th key={c.k} style={th}>{c.l}</th>)}</tr></thead>
            <tbody>
              {list.map(r => {
                const old = r.sortie && r.sortie < fiveYears.toISOString().slice(0, 10);
                return (
                  <tr key={r.id} style={{ opacity: old ? 0.5 : 1 }}>
                    {COLS.map(c => {
                      const v = value(r, c);
                      return <td key={c.k} style={{ ...td, background: c.req && !r[c.k] ? C.amberLight : 'transparent', fontWeight: c.k === 'nom' ? 600 : 400 }}>{v || (c.req ? '—' : '')}</td>;
                    })}
                  </tr>
                );
              })}
              {!list.length && <tr><td colSpan={COLS.length} style={{ ...td, textAlign: 'center', color: C.muted, padding: '24px' }}>Aucun salarié.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: '11px', color: C.muted, marginTop: '10px', lineHeight: 1.6 }}>
        Mentions : nom, prénoms, nationalité, date de naissance, sexe, emploi, qualification, dates d'entrée et de sortie, type de contrat (CDD, temps partiel…),
        et pour les salariés étrangers, type et numéro du titre valant autorisation de travail. Le registre doit pouvoir être présenté à l'inspection du travail.
        Les lignes grisées concernent des salariés sortis depuis plus de 5 ans.
      </div>
    </div>
  );
}
