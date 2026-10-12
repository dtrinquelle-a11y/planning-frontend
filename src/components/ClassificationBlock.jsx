import React, { useState } from 'react';
import { useTheme } from '../ThemeContext';
import { GRID, CATEGORIES, minimumFor, monthlyFor, suggestTrial, eur } from '../ccHpa';

// Dossiers RH > fiche : classification CC HPA (fourchette par emploi), salaire, periode d'essai, taches, logement
export default function ClassificationBlock({ form, setForm, cfg }) {
  const { colors: C } = useTheme();
  const [trialHint, setTrialHint] = useState(null);
  const row = GRID.find(g => g.emploi === form.emploi_repere) || null;
  const coef = parseInt(form.coefficient, 10) || null;
  const min = coef ? minimumFor(coef, cfg) : null;
  const hours = parseFloat(form.contract_hours) || 35;
  const hourly = parseFloat(String(form.salaire_horaire || '').replace(',', '.')) || null;
  const outOfRange = row && coef && (coef < row.min || coef > row.max);

  function chooseEmploi(name) {
    const g = GRID.find(x => x.emploi === name);
    setForm(f => {
      const c = parseInt(f.coefficient, 10);
      const nextCoef = g && (!c || c < g.min || c > g.max) ? g.min : c || '';
      return { ...f, emploi_repere: name, categorie: g ? String(g.cat) : f.categorie, coefficient: nextCoef };
    });
  }

  const inp = { width: '100%', background: C.bg, border: '1px solid ' + C.border, borderRadius: '6px', padding: '7px 9px', color: C.text, fontSize: '12px', fontFamily: 'inherit', boxSizing: 'border-box', marginTop: '4px' };
  const lbl = { fontSize: '11px', color: C.muted, display: 'block' };
  const small = { background: C.card, border: '1px solid ' + C.border, borderRadius: '6px', padding: '4px 10px', color: C.purple, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit', whiteSpace: 'nowrap' };

  return (
    <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid ' + C.border }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: C.text, marginBottom: '10px' }}>Classification et rémunération (CC HPA)</div>

      <label style={lbl}>EMPLOI DE LA GRILLE
        <select style={inp} value={form.emploi_repere || ''} onChange={e => chooseEmploi(e.target.value)}>
          <option value="">— Choisir l'emploi le plus proche du poste —</option>
          {Object.entries(CATEGORIES).map(([cat, label]) => (
            <optgroup key={cat} label={label}>
              {GRID.filter(g => String(g.cat) === cat).map(g => <option key={g.emploi} value={g.emploi}>{g.emploi} ({g.min}–{g.max})</option>)}
            </optgroup>
          ))}
        </select>
      </label>

      {row && (() => {
        const lo = minimumFor(row.min, cfg), hi = minimumFor(row.max, cfg);
        return (
          <div style={{ background: C.purpleLight, borderRadius: '8px', padding: '10px 12px', margin: '10px 0', fontSize: '12px', color: C.text, lineHeight: 1.6 }}>
            <div><strong>{CATEGORIES[row.cat]}</strong> · coefficients <strong>{row.min} à {row.max}</strong></div>
            <div>Minimum conventionnel : <strong>{eur(lo.monthly)} → {eur(hi.monthly)}</strong> brut / mois pour 35 h ({eur(lo.hourly)} → {eur(hi.hourly)} / h)</div>
            <div style={{ color: C.muted, fontSize: '11px' }}>{row.def}</div>
          </div>
        );
      })()}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', marginTop: '6px' }}>
        <label style={lbl}>COEFFICIENT RETENU
          <input type="number" min="100" max="700" step="5" style={{ ...inp, borderColor: outOfRange ? C.amber : C.border }} value={form.coefficient ?? ''}
            onChange={e => setForm(f => ({ ...f, coefficient: e.target.value }))} placeholder="Ex : 120" />
          {outOfRange && <span style={{ color: C.amber, fontSize: '10px' }}>Hors de la fourchette de cet emploi ({row.min}–{row.max})</span>}
        </label>
        <label style={lbl}>CATÉGORIE
          <input style={inp} value={form.categorie || ''} onChange={e => setForm(f => ({ ...f, categorie: e.target.value }))} />
        </label>
        <label style={lbl}>SALAIRE HORAIRE BRUT (€)
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input style={{ ...inp, borderColor: hourly && min && hourly < min.hourly ? C.red : C.border }} inputMode="decimal" value={form.salaire_horaire ?? ''}
              onChange={e => setForm(f => ({ ...f, salaire_horaire: e.target.value }))} placeholder={min ? String(min.hourly).replace('.', ',') : ''} />
            {min && <button type="button" onClick={() => setForm(f => ({ ...f, salaire_horaire: String(min.belowSmic ? min.smic : min.hourly).replace('.', ',') }))} style={{ ...small, marginTop: '4px' }} title="Reprendre le minimum">= mini</button>}
          </div>
        </label>
      </div>

      {min && (
        <div style={{ fontSize: '11px', color: C.muted, marginTop: '6px', lineHeight: 1.6 }}>
          Coefficient {coef} : minimum {eur(min.hourly)} / h, soit {eur(monthlyFor(min.hourly, hours))} / mois pour {String(hours).replace('.', ',')} h par semaine.
          {hourly ? <> Salaire saisi : <strong style={{ color: hourly < min.hourly ? C.red : C.green }}>{eur(monthlyFor(hourly, hours))} brut / mois</strong>{hourly < min.hourly ? ' — inférieur au minimum conventionnel !' : ''}</> : null}
          {min.belowSmic && <div style={{ color: C.red }}>⚠ Ce minimum est inférieur au SMIC horaire ({eur(min.smic)}) : le SMIC s'applique.</div>}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginTop: '12px' }}>
        <label style={lbl}>PÉRIODE D'ESSAI
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input style={inp} value={form.periode_essai || ''} onChange={e => setForm(f => ({ ...f, periode_essai: e.target.value }))} placeholder="Ex : 14 jours" />
            <button type="button" style={{ ...small, marginTop: '4px' }} onClick={() => {
              const s = suggestTrial({ contractType: form.contract_type, start: form.hire_date, end: form.contract_end_date, cat: row?.cat || 1 });
              setTrialHint(s.rule); setForm(f => ({ ...f, periode_essai: s.text }));
            }}>Proposer</button>
          </div>
          {trialHint && <span style={{ fontSize: '10px', color: C.muted }}>{trialHint}. Durée maximale : vérifiez la convention, qui peut prévoir moins.</span>}
        </label>
        <label style={{ ...lbl, display: 'flex', gap: '8px', alignItems: 'center', marginTop: '18px', cursor: 'pointer', color: C.text, fontSize: '12px' }}>
          <input type="checkbox" checked={!!form.logement} onChange={e => setForm(f => ({ ...f, logement: e.target.checked }))} style={{ accentColor: C.purple }} />
          Logement fourni par l'employeur
        </label>
      </div>
      {form.logement && (
        <label style={{ ...lbl, marginTop: '10px' }}>CONDITIONS DU LOGEMENT (reprises dans le contrat)
          <textarea style={{ ...inp, minHeight: '50px', resize: 'vertical' }} value={form.logement_details || ''} onChange={e => setForm(f => ({ ...f, logement_details: e.target.value }))}
            placeholder="Ex : mobil-home partagé sur le camping, avantage en nature de … € / mois, à libérer à la fin du contrat" />
        </label>
      )}
      <label style={{ ...lbl, marginTop: '10px' }}>TÂCHES CONFIÉES (reprises dans le contrat)
        <textarea style={{ ...inp, minHeight: '70px', resize: 'vertical' }} value={form.taches || ''} onChange={e => setForm(f => ({ ...f, taches: e.target.value }))}
          placeholder="Une tâche par ligne. Ex :&#10;Accueil et information de la clientèle&#10;Gestion des arrivées et des départs" />
      </label>
    </div>
  );
}
