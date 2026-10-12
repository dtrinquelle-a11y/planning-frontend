import React, { useEffect, useState } from 'react';
import supabase from '../supabase';
import { useTheme } from '../ThemeContext';
import { FIELDS, CONDITIONS, buildValues, inspectTemplate, renderContract, templateError, downloadBlob, resolveKey } from '../contracts';

const LABELS = Object.fromEntries([...FIELDS, ...CONDITIONS].map(f => [f.key, f.label]));
// "salaire_horaire" -> "Salaire horaire"
const pretty = k => (k.charAt(0).toUpperCase() + k.slice(1).toLowerCase()).replace(/_/g, ' ');
const labelOf = k => LABELS[resolveKey(k)] || pretty(k);

// Dossiers RH > Editer un contrat : modele + fiche du salarie -> contrat Word complete
export default function ContratModal({ emp, responses, onClose, onSaved }) {
  const { colors: C } = useTheme();
  const [templates, setTemplates] = useState(null);
  const [tpl, setTpl] = useState(null);           // modele choisi
  const [buffer, setBuffer] = useState(null);     // contenu du .docx
  const [info, setInfo] = useState(null);         // { fields, blocks }
  const [values, setValues] = useState({});
  const [deposit, setDeposit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    supabase.from('contract_templates').select('*').order('name').then(({ data }) => {
      setTemplates(data || []);
      if (data && data.length === 1) choose(data[0]);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function choose(t) {
    setTpl(t); setInfo(null); setMsg(null);
    try {
      const [{ data: file, error }, { data: camp }] = await Promise.all([
        supabase.storage.from('modeles-contrats').download(t.file_path),
        supabase.from('app_settings').select('value').eq('key', 'camping_info').maybeSingle(),
      ]);
      if (error) throw error;
      const buf = await file.arrayBuffer();
      const found = inspectTemplate(buf);
      const known = buildValues(emp, responses, camp?.value);
      // Noms du modele (ex. «DATE_DE_NAISSANCE») rapproches des champs connus de la fiche
      const v = {};
      found.fields.forEach(k => {
        const key = resolveKey(k);
        v[k] = key === 'logement' ? known.logement_texte : key && key in known ? known[key] : (t.last_values?.[k] ?? '');
      });
      found.blocks.forEach(k => { const key = resolveKey(k); v[k] = key && key in known ? !!known[key] : !!t.last_values?.[k]; });
      setBuffer(buf); setInfo(found); setValues(v);
    } catch (err) { setMsg({ err: true, text: 'Modèle illisible : ' + templateError(err) }); }
  }

  const knownKeys = { has: k => !!resolveKey(k) }; // champ rempli depuis la fiche (sinon : a completer)

  async function generate() {
    setBusy(true); setMsg(null);
    try {
      const blob = renderContract(buffer, values);
      const safe = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const fileName = 'contrat-' + safe(tpl.name).toLowerCase() + '-' + safe(emp.last_name).toLowerCase() + '-' + safe(emp.first_name).toLowerCase() + '.docx';
      downloadBlob(blob, fileName);
      // Valeurs saisies a la main : reprises a la prochaine edition de ce modele
      const free = Object.fromEntries(Object.entries(values).filter(([k]) => !knownKeys.has(k)));
      if (Object.keys(free).length) supabase.from('contract_templates').update({ last_values: { ...(tpl.last_values || {}), ...free } }).eq('id', tpl.id).then(() => {});
      if (deposit) {
        const path = emp.id + '/contrats/' + Date.now() + '.docx';
        const { error: ue } = await supabase.storage.from('documents-rh').upload(path, blob, { contentType: blob.type });
        if (ue) throw ue;
        const { error: de } = await supabase.from('documents').insert({ employee_id: emp.id, type: 'contrat', title: tpl.name + ' - ' + emp.first_name + ' ' + emp.last_name, file_path: path, file_name: fileName, file_size: blob.size, mime_type: blob.type });
        if (de) throw de;
        if (onSaved) onSaved();
      }
      setMsg({ err: false, text: 'Contrat généré' + (deposit ? ' et déposé dans ses documents' : '') + '. Relisez-le dans Word avant de le faire signer.' });
    } catch (err) {
      setMsg({ err: true, text: 'Génération impossible : ' + templateError(err) });
    } finally { setBusy(false); }
  }

  const inp = { width: '100%', background: C.bg, border: '1px solid ' + C.border, borderRadius: '6px', padding: '7px 9px', color: C.text, fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' };
  const btn = { background: C.card, border: '1px solid ' + C.border, borderRadius: '8px', padding: '8px 14px', color: C.text, cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' };
  const missing = info ? info.fields.filter(k => !String(values[k] ?? '').trim()) : [];
  const ordered = info ? [...info.fields].sort((a, b) => (knownKeys.has(a) ? 1 : 0) - (knownKeys.has(b) ? 1 : 0)) : [];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }} onClick={() => !busy && onClose()}>
      <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '14px', padding: '22px', width: '640px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: C.text, marginBottom: '4px' }}>📄 Contrat de {emp.first_name} {emp.last_name}</div>
        <div style={{ fontSize: '12px', color: C.muted, marginBottom: '16px' }}>Les champs sont remplis avec la fiche du salarié ; vérifiez-les et complétez ceux qui manquent.</div>

        {templates === null ? <div style={{ color: C.muted, fontSize: '13px' }}>Chargement...</div>
          : templates.length === 0 ? (
            <div style={{ background: C.amberLight, borderRadius: '8px', padding: '12px', fontSize: '13px', color: C.text }}>
              Aucun modèle de contrat. Déposez d'abord votre modèle Word dans <strong>Paramétrage › 📄 Contrats</strong>.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {templates.map(t => (
                <button key={t.id} onClick={() => choose(t)}
                  style={{ ...btn, background: tpl?.id === t.id ? C.purpleLight : C.card, borderColor: tpl?.id === t.id ? C.purple : C.border, color: tpl?.id === t.id ? C.purple : C.text, fontWeight: tpl?.id === t.id ? 600 : 400 }}>{t.name}</button>
              ))}
            </div>
          )}

        {info && (
          <>
            {missing.length > 0 && (
              <div style={{ background: C.amberLight, borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: C.amber, marginBottom: '12px' }}>
                {missing.length} champ{missing.length > 1 ? 's' : ''} vide{missing.length > 1 ? 's' : ''} (encadré{missing.length > 1 ? 's' : ''} en orange) : il{missing.length > 1 ? 's' : ''} restera{missing.length > 1 ? 'ont' : ''} vide{missing.length > 1 ? 's' : ''} dans le contrat.
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px', marginBottom: '14px' }}>
              {ordered.map(k => {
                const empty = !String(values[k] ?? '').trim();
                return (
                  <label key={k} style={{ fontSize: '11px', color: knownKeys.has(k) ? C.muted : C.purple, fontWeight: 500 }}>
                    {labelOf(k)}{!knownKeys.has(k) && ' · à compléter'} <span style={{ color: C.border, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '10px' }}>{info.guillemets ? '«' + k + '»' : '{' + k + '}'}</span>
                    <input value={values[k] ?? ''} onChange={e => setValues(v => ({ ...v, [k]: e.target.value }))}
                      style={{ ...inp, marginTop: '3px', borderColor: empty ? C.amber : C.border }} />
                  </label>
                );
              })}
            </div>
            {info.blocks.length > 0 && (
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '11px', color: C.muted, fontWeight: 600, marginBottom: '6px' }}>PARAGRAPHES CONDITIONNELS</div>
                {info.blocks.map(k => (
                  <label key={k} style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', color: C.text, marginBottom: '4px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!values[k]} onChange={e => setValues(v => ({ ...v, [k]: e.target.checked }))} style={{ accentColor: C.purple }} />
                    {labelOf(k)}
                  </label>
                ))}
              </div>
            )}
            <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '12px', color: C.text, marginBottom: '14px', cursor: 'pointer', lineHeight: 1.5 }}>
              <input type="checkbox" checked={deposit} onChange={e => setDeposit(e.target.checked)} style={{ marginTop: '2px', accentColor: C.purple }} />
              <span>Déposer aussi dans ses documents (type « Contrat ») — <span style={{ color: C.muted }}>il sera visible par le salarié dans « Mes documents ». À réserver de préférence à la version définitive.</span></span>
            </label>
          </>
        )}

        {msg && <div style={{ fontSize: '12px', color: msg.err ? C.red : C.green, marginBottom: '12px', lineHeight: 1.6 }}>{msg.text}</div>}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={busy} style={btn}>Fermer</button>
          {info && <button onClick={generate} disabled={busy} style={{ ...btn, background: C.purple, borderColor: C.purple, color: '#fff', fontWeight: 600, opacity: busy ? 0.6 : 1 }}>{busy ? 'Génération...' : '↓ Générer le contrat (.docx)'}</button>}
        </div>
      </div>
    </div>
  );
}
