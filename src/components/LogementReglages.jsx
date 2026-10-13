import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTheme } from '../ThemeContext';
import { API } from '../config';

// Bareme forfaitaire Urssaf 2026 de l'avantage en nature logement (tranches en fraction du PMSS)
export const LOGEMENT_DEFAULTS = {
  pmss: 4005,
  une_piece: [79.70, 93.00, 106.20, 119.40, 146.40, 172.60, 199.40, 225.60],
  par_piece: [42.60, 59.70, 79.70, 99.50, 126.10, 152.40, 185.70, 212.30],
  caution_montant: '', caution_lien: '', caution_texte: '',
};
const TRANCHES = [0.5, 0.6, 0.7, 0.9, 1.1, 1.3, 1.5];

// Parametrage > Logement : bareme de l'avantage en nature (export de paie) et caution (lien de paiement)
export default function LogementReglages() {
  const { colors: C } = useTheme();
  const [cfg, setCfg] = useState(LOGEMENT_DEFAULTS);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    axios.get(API + '/settings/logement').then(r => setCfg({ ...LOGEMENT_DEFAULTS, ...(r.data?.value || {}) })).catch(() => {});
  }, []);

  async function save() {
    if (cfg.caution_lien && !/^https:\/\//.test(cfg.caution_lien.trim())) { setMsg({ err: true, text: 'Le lien de paiement doit commencer par https://' }); return; }
    setBusy(true); setMsg(null);
    try { await axios.patch(API + '/settings/logement', { ...cfg, caution_lien: cfg.caution_lien.trim() }); setMsg({ err: false, text: 'Enregistré' }); }
    catch (err) { setMsg({ err: true, text: 'Erreur : ' + (err.response?.data?.error || err.message) }); }
    finally { setBusy(false); }
  }

  const pmss = parseFloat(cfg.pmss) || LOGEMENT_DEFAULTS.pmss;
  const bounds = TRANCHES.map(t => Math.round(t * pmss * 100) / 100);
  const label = i => i === 0 ? '< ' + bounds[0].toLocaleString('fr-FR') + ' €' : i === TRANCHES.length ? '≥ ' + bounds[i - 1].toLocaleString('fr-FR') + ' €' : bounds[i - 1].toLocaleString('fr-FR') + ' à ' + (bounds[i] - 0.01).toLocaleString('fr-FR') + ' €';
  const setArr = (k, i, v) => setCfg(c => { const a = [...c[k]]; a[i] = v.replace(',', '.'); return { ...c, [k]: a }; });
  const inp = { width: '100%', background: C.bg, border: '1px solid ' + C.border, borderRadius: '6px', padding: '6px 8px', color: C.text, fontSize: '12px', fontFamily: 'inherit', boxSizing: 'border-box' };
  const lbl = { display: 'block', fontSize: '10px', color: C.muted, letterSpacing: '0.08em', marginBottom: '4px', fontWeight: 500 };
  const card = { background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '18px', marginBottom: '16px' };

  return (
    <div>
      <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px', color: C.text }}>Logement des salariés</div>
      <div style={{ fontSize: '12px', color: C.muted, marginBottom: '18px', lineHeight: 1.6 }}>
        Pour les salariés logés (case « Logement » de la fiche ou des contrats), l'avantage en nature est calculé automatiquement dans l'export de paie
        selon le barème forfaitaire Urssaf : forfait du mois selon la rémunération et le nombre de pièces, ou par semaine commencée (¼ du forfait) pour un mois incomplet.
      </div>

      <div style={card}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: C.text, marginBottom: '6px' }}>Caution du logement</div>
        <div style={{ fontSize: '11px', color: C.muted, marginBottom: '12px' }}>Le salarié logé voit dans son espace un bouton « Payer la caution » jusqu'à ce que vous cochiez « Caution reçue » (Contrats de travail).</div>
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px' }}>
          <label style={lbl}>MONTANT (€)<input style={inp} inputMode="decimal" value={cfg.caution_montant} onChange={e => setCfg(c => ({ ...c, caution_montant: e.target.value }))} placeholder="Ex : 150" /></label>
          <label style={lbl}>LIEN DE PAIEMENT<input style={inp} value={cfg.caution_lien} onChange={e => setCfg(c => ({ ...c, caution_lien: e.target.value }))} placeholder="https://… (SumUp, Stripe, lien de paiement de votre banque…)" /></label>
        </div>
        <label style={{ ...lbl, marginTop: '10px' }}>MESSAGE AU SALARIÉ (FACULTATIF)
          <input style={inp} value={cfg.caution_texte} onChange={e => setCfg(c => ({ ...c, caution_texte: e.target.value }))} placeholder="Ex : caution restituée à la remise des clés en fin de saison" />
        </label>
      </div>

      <div style={card}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: C.text, marginBottom: '6px' }}>Barème de l'avantage en nature (par mois)</div>
        <div style={{ fontSize: '11px', color: C.muted, marginBottom: '12px' }}>Barème Urssaf 2026, à mettre à jour chaque 1er janvier. Les tranches dépendent du plafond mensuel de la sécurité sociale.</div>
        <label style={{ ...lbl, maxWidth: '220px' }}>PLAFOND MENSUEL SÉCURITÉ SOCIALE (€)<input style={inp} inputMode="decimal" value={cfg.pmss} onChange={e => setCfg(c => ({ ...c, pmss: e.target.value.replace(',', '.') }))} /></label>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px', fontSize: '12px' }}>
          <thead><tr style={{ color: C.muted, textAlign: 'left' }}><th style={{ padding: '6px' }}>Rémunération brute mensuelle</th><th style={{ padding: '6px', width: '130px' }}>1 pièce</th><th style={{ padding: '6px', width: '150px' }}>Par pièce (2 et +)</th></tr></thead>
          <tbody>
            {cfg.une_piece.map((v, i) => (
              <tr key={i} style={{ borderTop: '1px solid ' + C.border + '88' }}>
                <td style={{ padding: '5px 6px', color: C.text }}>{label(i)}</td>
                <td style={{ padding: '5px 6px' }}><input style={inp} inputMode="decimal" value={v} onChange={e => setArr('une_piece', i, e.target.value)} /></td>
                <td style={{ padding: '5px 6px' }}><input style={inp} inputMode="decimal" value={cfg.par_piece[i]} onChange={e => setArr('par_piece', i, e.target.value)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: '11px', color: C.muted, marginTop: '8px' }}>Mois incomplet : semaines commencées × ¼ du forfait mensuel (plafonné au forfait). Faites valider cette règle par votre cabinet de paie.</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={save} disabled={busy} style={{ background: C.purple, border: 'none', borderRadius: '8px', padding: '10px 24px', color: '#fff', fontSize: '13px', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? 'Enregistrement...' : '💾 Enregistrer'}</button>
        {msg && <span style={{ fontSize: '12px', color: msg.err ? C.red : C.green }}>{msg.text}</span>}
      </div>
    </div>
  );
}
