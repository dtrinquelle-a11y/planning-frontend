import React, { useState } from 'react';
import { useTheme } from '../ThemeContext';
import { GRID, CATEGORIES, SALARY_DEFAULTS, minimumFor, eur } from '../ccHpa';

// Parametrage > CC HPA : valeurs des salaires minima (a mettre a jour a chaque avenant) et grille de classification
export default function GrilleCcHpa({ settings, setSettings }) {
  const { colors: C } = useTheme();
  const [coef, setCoef] = useState('');
  const cc = settings.cc_hpa || {};
  const cfg = { ...SALARY_DEFAULTS, ...Object.fromEntries(Object.entries(cc).filter(([k, v]) => k in SALARY_DEFAULTS && v !== '' && v != null)) };
  const set = (k, v) => setSettings(prev => ({ ...prev, cc_hpa: { ...prev.cc_hpa, [k]: v } }));
  const inp = { width: '100%', background: C.bg, border: '1px solid ' + C.border, borderRadius: '6px', padding: '8px 10px', color: C.text, fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' };
  const lbl = { display: 'block', fontSize: '10px', color: C.muted, letterSpacing: '0.08em', marginBottom: '4px', fontWeight: 500 };
  const sim = parseInt(coef, 10) >= 100 ? minimumFor(parseInt(coef, 10), cfg) : null;

  return (
    <>
      <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '20px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: C.text, marginBottom: '6px' }}>Salaires minima conventionnels</div>
        <div style={{ fontSize: '11px', color: C.muted, marginBottom: '14px', lineHeight: 1.6 }}>
          Minimum mensuel (151,67 h) = salaire du coefficient 100 + (coefficient − 100) × valeur du point. À mettre à jour à chaque nouvel avenant « salaires ».
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
          <div><label style={lbl}>COEFFICIENT 100 (€ / MOIS)</label><input style={inp} inputMode="decimal" value={cc.salaire_base ?? SALARY_DEFAULTS.salaire_base} onChange={e => set('salaire_base', e.target.value.replace(',', '.'))} /></div>
          <div><label style={lbl}>VALEUR DU POINT (€)</label><input style={inp} inputMode="decimal" value={cc.valeur_point ?? SALARY_DEFAULTS.valeur_point} onChange={e => set('valeur_point', e.target.value.replace(',', '.'))} /></div>
          <div><label style={lbl}>SMIC HORAIRE BRUT (€)</label><input style={inp} inputMode="decimal" placeholder="à renseigner" value={cc.smic_horaire ?? ''} onChange={e => set('smic_horaire', e.target.value.replace(',', '.'))} /></div>
          <div><label style={lbl}>RÉFÉRENCE</label><input style={inp} value={cc.avenant ?? SALARY_DEFAULTS.avenant} onChange={e => set('avenant', e.target.value)} /></div>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginTop: '14px', padding: '10px 12px', background: C.bg, borderRadius: '8px' }}>
          <span style={{ fontSize: '12px', color: C.text }}>Simulateur : coefficient</span>
          <input style={{ ...inp, width: '90px' }} type="number" min="100" max="700" step="5" value={coef} onChange={e => setCoef(e.target.value)} placeholder="135" />
          {sim && <span style={{ fontSize: '13px', color: C.text }}>→ <strong>{eur(sim.monthly)}</strong> / mois · {eur(sim.hourly)} / h{sim.belowSmic && <span style={{ color: C.red }}> (inférieur au SMIC : le SMIC s'applique)</span>}</span>}
        </div>
        <div style={{ fontSize: '11px', color: C.muted, marginTop: '8px' }}>Le SMIC sert seulement à vous alerter si un minimum conventionnel lui est inférieur.</div>
      </div>

      <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '20px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: C.text, marginBottom: '4px' }}>Grille de classification des emplois</div>
        <div style={{ fontSize: '11px', color: C.muted, marginBottom: '12px', lineHeight: 1.6 }}>
          Accord de révision du 22 mai 2025 (en vigueur au 1er jour du mois suivant son arrêté d'extension). Coefficients minimum et maximum à l'embauche, et fourchette de salaire minimum correspondante pour 35 h.
          Le coefficient retenu se choisit dans la fiche de chaque salarié (Dossiers RH).
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ color: C.muted, textAlign: 'left' }}>
                <th style={{ padding: '6px', borderBottom: '1px solid ' + C.border }}>Emploi</th>
                <th style={{ padding: '6px', borderBottom: '1px solid ' + C.border, whiteSpace: 'nowrap' }}>Coefficients</th>
                <th style={{ padding: '6px', borderBottom: '1px solid ' + C.border, whiteSpace: 'nowrap' }}>Minimum mensuel brut</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(CATEGORIES).map(([cat, label]) => (
                <React.Fragment key={cat}>
                  <tr><td colSpan={3} style={{ padding: '10px 6px 4px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', color: C.purple }}>{label.toUpperCase()}</td></tr>
                  {GRID.filter(g => String(g.cat) === cat).map(g => (
                    <tr key={g.emploi} title={g.def} style={{ borderBottom: '1px solid ' + C.border + '88' }}>
                      <td style={{ padding: '6px', color: C.text }}>{g.emploi}</td>
                      <td style={{ padding: '6px', whiteSpace: 'nowrap' }}>{g.min} – {g.max}</td>
                      <td style={{ padding: '6px', whiteSpace: 'nowrap' }}>{eur(minimumFor(g.min, cfg).monthly)} – {eur(minimumFor(g.max, cfg).monthly)}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
