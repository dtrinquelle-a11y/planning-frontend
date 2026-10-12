import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import supabase from '../supabase';
import { useTheme } from '../ThemeContext';
import { API } from '../config';
import { FIELDS, CONDITIONS, buildValues, inspectTemplate, renderContract, templateError, downloadBlob, resolveKey } from '../contracts';

const LABELS = Object.fromEntries([...FIELDS, ...CONDITIONS].map(f => [f.key, f.label]));
const pretty = k => (k.charAt(0).toUpperCase() + k.slice(1).toLowerCase()).replace(/_/g, ' ');
const labelOf = k => LABELS[resolveKey(k)] || pretty(k);
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const iso = d => (d ? String(d).slice(0, 10) : null);
// "04/05/2001" -> "2001-05-04"
const frToIso = s => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s).trim()); return m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : null; };
const decimal = s => { const n = parseFloat(String(s).replace(/\s/g, '').replace(',', '.')); return isNaN(n) ? null : n; };

// Champ saisi ici -> colonne de la fiche du salarie (enregistre a la generation pour ne pas avoir a le ressaisir)
const TO_FICHE = {
  civilite: v => (/^mme|^madame/i.test(v) ? { civilite: 'Madame' } : /^m\.?$|^monsieur/i.test(v) ? { civilite: 'Monsieur' } : null),
  poste: v => ({ role: v }),
  periode_essai: v => ({ periode_essai: v }),
  taches: v => ({ taches: v }),
  categorie: v => ({ categorie: v }),
  coefficient: v => { const n = parseInt(v, 10); return n >= 100 && n <= 700 ? { coefficient: n } : null; },
  salaire_horaire: v => { const n = decimal(v); return n > 0 ? { salaire_horaire: n } : null; },
  date_debut: v => (frToIso(v) ? { hire_date: frToIso(v) } : null),
  date_fin: v => (frToIso(v) ? { contract_end_date: frToIso(v) } : null),
  heures_hebdo: v => { const n = decimal(v); return n > 0 && n <= 48 ? { contract_hours: n } : null; },
  adresse: v => ({ address: v }),
  telephone: v => ({ phone: v }),
  date_naissance: v => (frToIso(v) ? { birth_date: frToIso(v) } : null),
  numero_secu: v => ({ nss: v }),
  emploi_repere: v => ({ emploi_repere: v }),
};
// Champs qui peuvent legitimement rester vides
const optional = (key, known) => key === 'logement' || key === 'logement_details' || (key === 'date_fin' && !known.cdd);

// Contrat signe en cours de validite : signe pour la date de debut actuelle
const isSigned = e => !!e.contrat_signe_at && iso(e.contrat_signe_debut) === iso(e.hire_date);

// Dossiers RH > Contrats de travail : salaries sans contrat signe, champs manquants, contrat en 1 clic, depot du contrat signe
export default function ContratsTravail() {
  const { colors: C } = useTheme();
  const [emps, setEmps] = useState(null);
  const [responses, setResponses] = useState({});    // employee_id -> reponses d'onboarding
  const [camping, setCamping] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [tplData, setTplData] = useState({});        // template_id -> { buffer, info } (charge une fois)
  const [choice, setChoice] = useState({});          // employee_id -> template_id
  const [edits, setEdits] = useState({});            // employee_id -> { champ: valeur saisie }
  const [busy, setBusy] = useState(null);
  const [showSigned, setShowSigned] = useState(false);
  const [toast, setToast] = useState(null);
  const fileRef = useRef(null);
  const uploadFor = useRef(null);

  function showToast(text, color) { setToast({ text, color: color || C.green }); setTimeout(() => setToast(null), 3500); }

  async function load() {
    const [e, r, c, t] = await Promise.all([
      supabase.from('employees').select('*').eq('is_temp', false).order('last_name'),
      supabase.from('onboarding_responses').select('employee_id, value, onboarding_fields(label, field_type)'),
      supabase.from('app_settings').select('value').eq('key', 'camping_info').maybeSingle(),
      supabase.from('contract_templates').select('*').order('name'),
    ]);
    // Salaries actifs, et dossiers d'onboarding termines en attente de validation
    setEmps((e.data || []).filter(x => x.is_active || x.onboarding_completed));
    const byEmp = {};
    (r.data || []).forEach(x => (byEmp[x.employee_id] = byEmp[x.employee_id] || []).push(x));
    setResponses(byEmp);
    setCamping(c.data?.value || null);
    setTemplates(t.data || []);
  }
  useEffect(() => { load(); }, []);

  // Modele : charge et analyse une seule fois
  async function ensureTemplate(id) {
    if (!id || tplData[id]) return tplData[id];
    const t = templates.find(x => x.id === id);
    const { data, error } = await supabase.storage.from('modeles-contrats').download(t.file_path);
    if (error) throw error;
    const buffer = await data.arrayBuffer();
    const entry = { buffer, info: inspectTemplate(buffer) };
    setTplData(prev => ({ ...prev, [id]: entry }));
    return entry;
  }
  useEffect(() => {
    // Modele propose par defaut : le dernier utilise (sinon le premier)
    if (!templates.length || !emps) return;
    let last = null; try { last = localStorage.getItem('planning-hpa:modele-contrat'); } catch {}
    const def = templates.find(t => t.id === last)?.id || templates[0].id;
    setChoice(prev => { const n = { ...prev }; emps.forEach(e => { if (!n[e.id]) n[e.id] = def; }); return n; });
    ensureTemplate(def).catch(err => showToast('Modèle illisible : ' + templateError(err), C.red));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, emps]);

  // Valeurs du contrat d'un salarie pour un modele : fiche + derniere saisie du modele + modifications faites ici
  function valuesFor(emp, tplId, loaded) {
    const entry = loaded || tplData[tplId];
    if (!entry) return null;
    const t = templates.find(x => x.id === tplId);
    const known = buildValues(emp, responses[emp.id], camping);
    const own = edits[emp.id] || {};
    const v = {}, missing = [];
    entry.info.fields.forEach(k => {
      const key = resolveKey(k);
      let val = key === 'logement' ? known.logement_texte : key && key in known ? known[key] : (t.last_values?.[k] ?? '');
      if (k in own) val = own[k];
      v[k] = val;
      if (!String(val ?? '').trim() && !(key && optional(key, known))) missing.push(k);
    });
    entry.info.blocks.forEach(k => { const key = resolveKey(k); v[k] = key && key in known ? !!known[key] : !!t.last_values?.[k]; });
    return { values: v, missing, known };
  }

  async function generate(emp) {
    const tplId = choice[emp.id];
    setBusy(emp.id + ':gen');
    try {
      const entry = await ensureTemplate(tplId);
      const t = templates.find(x => x.id === tplId);
      const r = valuesFor(emp, tplId, entry);
      if (r.missing.length && !window.confirm(r.missing.length + ' champ(s) vide(s) : ' + r.missing.map(labelOf).join(', ') + '.\n\nGénérer quand même le contrat ?')) return;
      const blob = renderContract(entry.buffer, r.values);
      const safe = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
      downloadBlob(blob, 'contrat-' + safe(emp.last_name) + '-' + safe(emp.first_name) + '.docx');
      try { localStorage.setItem('planning-hpa:modele-contrat', tplId); } catch {}

      // Saisies faites ici : enregistrees dans la fiche (champs connus) ou reprises pour ce modele (autres champs)
      const own = edits[emp.id] || {};
      const patch = { contrat_genere_at: new Date().toISOString() };
      const free = {};
      Object.entries(own).forEach(([k, val]) => {
        if (!String(val).trim()) return;
        const key = resolveKey(k);
        if (key && TO_FICHE[key]) Object.assign(patch, TO_FICHE[key](String(val).trim()) || {});
        else if (!key) free[k] = val;
      });
      const { data, error } = await supabase.from('employees').update(patch).eq('id', emp.id).select().single();
      if (error) throw error;
      if (Object.keys(free).length) {
        const lv = { ...(t.last_values || {}), ...free };
        await supabase.from('contract_templates').update({ last_values: lv }).eq('id', tplId);
        setTemplates(prev => prev.map(x => x.id === tplId ? { ...x, last_values: lv } : x));
      }
      setEmps(prev => prev.map(x => x.id === emp.id ? data : x));
      setEdits(prev => { const n = { ...prev }; delete n[emp.id]; return n; });
      showToast('Contrat de ' + emp.first_name + ' généré');
    } catch (err) {
      showToast('Génération impossible : ' + templateError(err), C.red);
    } finally { setBusy(null); }
  }

  // Depot du contrat signe : rangé dans le dossier du salarie (type Contrat), visible et notifie
  async function uploadSigned(file) {
    const emp = uploadFor.current;
    if (fileRef.current) fileRef.current.value = '';
    if (!file || !emp) return;
    if (file.size > 10 * 1024 * 1024) { showToast('Fichier trop lourd (10 Mo maximum)', C.red); return; }
    setBusy(emp.id + ':up');
    try {
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
      const path = emp.id + '/contrats/signe-' + Date.now() + '.' + ext;
      const { error: ue } = await supabase.storage.from('documents-rh').upload(path, file, { contentType: file.type || undefined });
      if (ue) throw ue;
      const title = 'Contrat de travail signé' + (emp.hire_date ? ' - ' + fr(emp.hire_date) + (emp.contract_end_date ? ' au ' + fr(emp.contract_end_date) : '') : '');
      const { data: doc, error: de } = await supabase.from('documents').insert({ employee_id: emp.id, type: 'contrat', title, file_path: path, file_name: file.name, file_size: file.size, mime_type: file.type || null }).select().single();
      if (de) throw de;
      const { data, error } = await supabase.from('employees').update({ contrat_signe_at: new Date().toISOString(), contrat_signe_debut: iso(emp.hire_date), contrat_signe_doc: doc.id }).eq('id', emp.id).select().single();
      if (error) throw error;
      axios.post(API + '/documents/notify', { employee_id: emp.id, type: 'contrat', title }).catch(() => {});
      setEmps(prev => prev.map(x => x.id === emp.id ? data : x));
      showToast('Contrat signé de ' + emp.first_name + ' rangé dans son dossier · salarié prévenu');
    } catch (err) {
      showToast('Dépôt impossible : ' + err.message, C.red);
    } finally { setBusy(null); }
  }

  async function openSigned(emp) {
    const { data: doc } = await supabase.from('documents').select('file_path').eq('id', emp.contrat_signe_doc).maybeSingle();
    if (!doc) { showToast('Document introuvable', C.red); return; }
    const { data } = await supabase.storage.from('documents-rh').createSignedUrl(doc.file_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  const inp = { width: '100%', background: C.bg, border: '1px solid ' + C.amber, borderRadius: '6px', padding: '6px 8px', color: C.text, fontSize: '12px', fontFamily: 'inherit', boxSizing: 'border-box', marginTop: '3px' };
  const btn = { background: C.card, border: '1px solid ' + C.border, borderRadius: '8px', padding: '8px 12px', color: C.text, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600, whiteSpace: 'nowrap' };

  if (!emps) return <div style={{ padding: '30px', color: C.muted, fontSize: '13px' }}>Chargement...</div>;
  const list = emps.filter(e => showSigned || !isSigned(e))
    .sort((a, b) => (iso(a.hire_date) || '9999').localeCompare(iso(b.hire_date) || '9999') || (a.last_name || '').localeCompare(b.last_name || ''));
  const signedCount = emps.filter(isSigned).length;

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1100px' }}>
      <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" style={{ display: 'none' }} onChange={e => uploadSigned(e.target.files[0])} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div style={{ maxWidth: '640px' }}>
          <div style={{ fontSize: '16px', fontWeight: 600, color: C.text, marginBottom: '4px' }}>Contrats de travail</div>
          <div style={{ fontSize: '12px', color: C.muted, lineHeight: 1.6 }}>
            Salariés sans contrat signé pour leur contrat en cours. Complétez les cases orange, générez le contrat Word en un clic,
            puis déposez le contrat signé : il est rangé dans son dossier (Mes documents) et le salarié est prévenu.
          </div>
        </div>
        <label style={{ fontSize: '12px', color: C.muted, display: 'flex', gap: '6px', alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={showSigned} onChange={e => setShowSigned(e.target.checked)} /> Afficher aussi les contrats signés ({signedCount})
        </label>
      </div>

      {!templates.length && (
        <div style={{ background: C.amberLight, borderRadius: '10px', padding: '14px', fontSize: '13px', color: C.text, marginBottom: '14px' }}>
          Aucun modèle de contrat : déposez d'abord votre modèle Word dans <strong>Paramétrage › 📄 Contrats</strong>.
        </div>
      )}
      {list.length === 0 ? (
        <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '30px', textAlign: 'center', color: C.green, fontSize: '14px' }}>✓ Tous les contrats sont signés.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {list.map(emp => {
            const tplId = choice[emp.id];
            const r = tplId ? valuesFor(emp, tplId) : null;
            const signed = isSigned(emp);
            return (
              <div key={emp.id} style={{ background: C.card, border: '1px solid ' + C.border, borderLeft: '4px solid ' + (signed ? C.green : r && r.missing.length ? C.amber : C.purple), borderRadius: '12px', padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: C.text }}>{emp.first_name} {emp.last_name}{!emp.is_active && <span style={{ fontSize: '11px', color: C.amber, fontWeight: 500 }}> · compte à valider</span>}</div>
                    <div style={{ fontSize: '12px', color: C.muted }}>
                      {emp.role || 'Poste ?'} · {emp.service} · {emp.contract_type}{emp.hire_date ? ' · du ' + fr(emp.hire_date) : ''}{emp.contract_end_date ? ' au ' + fr(emp.contract_end_date) : ''}
                    </div>
                    <div style={{ fontSize: '11px', marginTop: '3px', color: signed ? C.green : C.muted }}>
                      {signed ? '✓ Contrat signé déposé le ' + fr(emp.contrat_signe_at) : emp.contrat_genere_at ? 'Contrat généré le ' + fr(emp.contrat_genere_at) + ' · en attente de signature' : 'Contrat pas encore généré'}
                    </div>
                  </div>
                  {!signed && templates.length > 0 && (
                    <select value={tplId || ''} onChange={e => { const id = e.target.value; setChoice(c => ({ ...c, [emp.id]: id })); ensureTemplate(id).catch(err => showToast('Modèle illisible : ' + templateError(err), C.red)); }}
                      style={{ ...btn, fontWeight: 400, maxWidth: '200px' }} title="Modèle de contrat">
                      {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  )}
                  {!signed && r && (
                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '999px', background: r.missing.length ? C.amberLight : C.greenLight, color: r.missing.length ? C.amber : C.green }}>
                      {r.missing.length ? r.missing.length + ' champ' + (r.missing.length > 1 ? 's' : '') + ' à compléter' : '✓ Complet'}
                    </span>
                  )}
                  {!signed && templates.length > 0 && (
                    <button onClick={() => generate(emp)} disabled={!r || busy === emp.id + ':gen'} style={{ ...btn, background: C.purple, borderColor: C.purple, color: '#fff', opacity: !r || busy === emp.id + ':gen' ? 0.6 : 1 }}>
                      {busy === emp.id + ':gen' ? '...' : '⬇ Contrat .docx'}
                    </button>
                  )}
                  {signed
                    ? <button onClick={() => openSigned(emp)} style={btn}>📄 Voir le contrat signé</button>
                    : <button onClick={() => { uploadFor.current = emp; fileRef.current?.click(); }} disabled={busy === emp.id + ':up'} style={{ ...btn, color: C.green, borderColor: C.green + '88' }}>
                        {busy === emp.id + ':up' ? 'Dépôt...' : '📎 Déposer le contrat signé'}
                      </button>}
                </div>

                {/* Cases des champs manquants */}
                {!signed && r && (r.missing.length > 0 || Object.keys(edits[emp.id] || {}).length > 0) && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid ' + C.border }}>
                    {r.missing.concat(Object.keys(edits[emp.id] || {}).filter(k => !r.missing.includes(k))).map(k => {
                      const key = resolveKey(k);
                      const long = key === 'taches';
                      const val = (edits[emp.id] || {})[k] ?? '';
                      const set = v => setEdits(prev => ({ ...prev, [emp.id]: { ...(prev[emp.id] || {}), [k]: v } }));
                      return (
                        <label key={k} style={{ fontSize: '11px', color: key ? C.muted : C.purple, fontWeight: 500, gridColumn: long ? '1 / -1' : 'auto' }}>
                          {labelOf(k)}
                          {key === 'civilite' ? (
                            <select style={inp} value={val} onChange={e => set(e.target.value)}><option value="">—</option><option>Madame</option><option>Monsieur</option></select>
                          ) : long ? (
                            <textarea style={{ ...inp, minHeight: '50px', resize: 'vertical' }} value={val} onChange={e => set(e.target.value)} placeholder="Une tâche par ligne" />
                          ) : (
                            <input style={{ ...inp, borderColor: String(val).trim() ? C.border : C.amber }} value={val} onChange={e => set(e.target.value)}
                              placeholder={/date/.test(key || '') ? 'JJ/MM/AAAA' : ''} />
                          )}
                        </label>
                      );
                    })}
                    <div style={{ gridColumn: '1 / -1', fontSize: '10px', color: C.muted }}>Ces informations sont enregistrées dans la fiche du salarié à la génération du contrat (les autres champs du modèle sont repris pour les contrats suivants).</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {toast && <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: C.card, border: '1px solid ' + toast.color, borderRadius: '8px', padding: '10px 16px', fontSize: '12px', color: toast.color, zIndex: 200, boxShadow: '0 4px 12px ' + C.shadow }}>{toast.text}</div>}
    </div>
  );
}
