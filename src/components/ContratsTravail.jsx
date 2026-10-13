import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import supabase from '../supabase';
import { useTheme } from '../ThemeContext';
import { API } from '../config';
import { FIELDS, CONDITIONS, buildValues, inspectTemplate, renderContract, templateError, downloadBlob, resolveKey, normalize } from '../contracts';
import { GRID, CATEGORIES, SALARY_DEFAULTS, minimumFor, montantEnLettres, eur } from '../ccHpa';

const LABELS = Object.fromEntries([...FIELDS, ...CONDITIONS].map(f => [f.key, f.label]));
const pretty = k => (k.charAt(0).toUpperCase() + k.slice(1).toLowerCase()).replace(/_/g, ' ');
const labelOf = k => LABELS[resolveKey(k)] || pretty(k);
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const iso = d => (d ? String(d).slice(0, 10) : null);
// "04/05/2001" -> "2001-05-04"
const frToIso = s => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s).trim()); return m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : null; };
const decimal = s => { const n = parseFloat(String(s).replace(/[\s ]/g, '').replace(',', '.')); return isNaN(n) ? null : n; };

// Champ saisi ici -> colonne de la fiche du salarie (enregistre a la generation pour ne pas avoir a le ressaisir)
const TO_FICHE = {
  civilite: v => (/^mme|^madame/i.test(v) ? { civilite: 'Madame' } : /^m\.?$|^monsieur/i.test(v) ? { civilite: 'Monsieur' } : null),
  poste: v => ({ role: v }),
  periode_essai: v => ({ periode_essai: v }),
  taches: v => ({ taches: v }),
  date_debut: v => (frToIso(v) ? { hire_date: frToIso(v) } : null),
  date_fin: v => (frToIso(v) ? { contract_end_date: frToIso(v) } : null),
  heures_hebdo: v => { const n = decimal(v); return n > 0 && n <= 48 ? { contract_hours: n } : null; },
  adresse: v => ({ address: v }),
  telephone: v => ({ phone: v }),
  date_naissance: v => (frToIso(v) ? { birth_date: frToIso(v) } : null),
  numero_secu: v => ({ nss: v }),
};
// Champs geres par la ligne de classification (emploi, coefficient, salaire calcule, logement)
const CLASSIF = new Set(['categorie', 'coefficient', 'emploi_repere', 'salaire_mensuel', 'salaire_lettres', 'salaire_horaire', 'logement', 'logement_details']);
// Valeurs par defaut a verifier (affichees et modifiables)
const DEFAULTS = new Set(['heure_arrivee', 'heure_depart', 'periode_essai']);
const optional = (key, known) => key === 'date_fin' && !known.cdd;

// Contrat signe en cours de validite : signe pour la date de debut actuelle
const isSigned = e => !!e.contrat_signe_at && iso(e.contrat_signe_debut) === iso(e.hire_date);

// Emplois de la grille les plus proches du poste saisi (mots communs)
function suggestions(poste) {
  const words = normalize(poste).split('_').filter(w => w.length > 3);
  if (!words.length) return [];
  return GRID.map(g => ({ g, score: words.filter(w => normalize(g.emploi).includes(w.slice(0, 6))).length }))
    .filter(x => x.score > 0).sort((a, b) => b.score - a.score || a.g.cat - b.g.cat).map(x => x.g);
}
const coefOptions = row => { const out = []; for (let c = row.min; c <= row.max; c += 5) out.push(c); return out; };

let DEJA = new Set();
try { DEJA = new Set(JSON.parse(localStorage.getItem('planning-hpa:contrat-deja') || '[]')); } catch {}

// Dossiers RH > Contrats de travail : salaries sans contrat signe, champs manquants, contrat en 1 clic, depot du contrat signe
export default function ContratsTravail() {
  const { colors: C } = useTheme();
  const [emps, setEmps] = useState(null);
  const [responses, setResponses] = useState({});    // employee_id -> reponses d'onboarding
  const [camping, setCamping] = useState(null);
  const [cfg, setCfg] = useState(SALARY_DEFAULTS);   // valeurs de salaire CC HPA (Parametrage)
  const [templates, setTemplates] = useState([]);
  const [tplData, setTplData] = useState({});        // template_id -> { buffer, info } (charge une fois)
  const [choice, setChoice] = useState({});          // employee_id -> template_id
  const [edits, setEdits] = useState({});            // employee_id -> { champ: valeur, __emploi, __coef, __logement }
  const [already, setAlready] = useState(DEJA);      // "j'ai deja le contrat" : seule la case de depot reste
  const [busy, setBusy] = useState(null);
  const [showSigned, setShowSigned] = useState(false);
  const [expanded, setExpanded] = useState(new Set()); // lignes depliees (repliees par defaut)
  const toggleRow = id => setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [toast, setToast] = useState(null);
  const fileRef = useRef(null);
  const uploadFor = useRef(null);

  function showToast(text, color) { setToast({ text, color: color || C.green }); setTimeout(() => setToast(null), 3500); }

  async function load() {
    const [e, r, c, t, cc] = await Promise.all([
      supabase.from('employees').select('*').eq('is_temp', false).order('last_name'),
      supabase.from('onboarding_responses').select('employee_id, value, onboarding_fields(label, field_type)'),
      supabase.from('app_settings').select('value').eq('key', 'camping_info').maybeSingle(),
      supabase.from('contract_templates').select('*').order('name'),
      supabase.from('app_settings').select('value').eq('key', 'cc_hpa').maybeSingle(),
    ]);
    // Salaries actifs, et dossiers d'onboarding termines en attente de validation
    setEmps((e.data || []).filter(x => x.is_active || x.onboarding_completed));
    const byEmp = {};
    (r.data || []).forEach(x => (byEmp[x.employee_id] = byEmp[x.employee_id] || []).push(x));
    setResponses(byEmp);
    setCamping(c.data?.value || null);
    setTemplates(t.data || []);
    setCfg({ ...SALARY_DEFAULTS, ...Object.fromEntries(Object.entries(cc.data?.value || {}).filter(([k, v]) => k in SALARY_DEFAULTS && v !== '' && v != null)) });
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

  // Fiche du salarie avec les choix faits ici (emploi, coefficient, logement, champs saisis)
  function effective(emp) {
    const own = edits[emp.id] || {};
    const e = { ...emp };
    if (own.__emploi !== undefined) { e.emploi_repere = own.__emploi || null; const g = GRID.find(x => x.emploi === own.__emploi); if (g) e.categorie = String(g.cat); }
    if (own.__coef !== undefined) e.coefficient = parseInt(own.__coef, 10) || null;
    if (own.__logement !== undefined) e.logement = own.__logement;
    Object.entries(own).forEach(([k, v]) => { const key = resolveKey(k); if (key && TO_FICHE[key] && String(v).trim()) Object.assign(e, TO_FICHE[key](String(v).trim()) || {}); });
    return e;
  }

  // Valeurs du contrat d'un salarie pour un modele
  function valuesFor(emp, tplId, loaded) {
    const entry = loaded || tplData[tplId];
    if (!entry) return null;
    const t = templates.find(x => x.id === tplId);
    const e = effective(emp);
    const known = buildValues(e, responses[emp.id], camping, cfg);
    const own = edits[emp.id] || {};
    const v = {}, missing = [];
    entry.info.fields.forEach(k => {
      const key = resolveKey(k);
      let val = key === 'logement' ? known.logement_texte : key && key in known ? known[key] : (t.last_values?.[k] ?? '');
      if (k in own) val = own[k];
      v[k] = val;
      if (!String(val ?? '').trim() && !(key && (optional(key, known) || CLASSIF.has(key)))) missing.push(k);
    });
    // Salaire en lettres : suit le salaire mensuel du contrat (meme s'il a ete modifie a la main)
    const salaryField = entry.info.fields.find(k => resolveKey(k) === 'salaire_mensuel');
    if (salaryField && salaryField in own) {
      const n = decimal(own[salaryField]);
      entry.info.fields.filter(k => resolveKey(k) === 'salaire_lettres' && !(k in own)).forEach(k => { v[k] = n ? montantEnLettres(n) : ''; });
    }
    entry.info.blocks.forEach(k => { const key = resolveKey(k); v[k] = key && key in known ? !!known[key] : !!t.last_values?.[k]; });
    const has = key => entry.info.fields.some(k => resolveKey(k) === key) || entry.info.blocks.some(k => resolveKey(k) === key);
    return { values: v, missing, known, e, has, salaryField };
  }

  const setEdit = (empId, k, val) => setEdits(prev => ({ ...prev, [empId]: { ...(prev[empId] || {}), [k]: val } }));

  async function generate(emp) {
    const tplId = choice[emp.id];
    setBusy(emp.id + ':gen');
    try {
      const entry = await ensureTemplate(tplId);
      const t = templates.find(x => x.id === tplId);
      const r = valuesFor(emp, tplId, entry);
      const classifMissing = r.has('coefficient') && !r.e.coefficient ? ['Coefficient'] : [];
      const all = [...r.missing.map(labelOf), ...classifMissing];
      if (all.length && !window.confirm(all.length + ' champ(s) vide(s) : ' + all.join(', ') + '.\n\nGénérer quand même le contrat ?')) return;
      const blob = renderContract(entry.buffer, r.values);
      const safe = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
      downloadBlob(blob, 'contrat-' + safe(emp.last_name) + '-' + safe(emp.first_name) + '.docx');
      try { localStorage.setItem('planning-hpa:modele-contrat', tplId); } catch {}

      // Choix et saisies faits ici : enregistres dans la fiche (champs connus) ou retenus pour ce modele (autres champs)
      const own = edits[emp.id] || {};
      const patch = { contrat_genere_at: new Date().toISOString() };
      if (own.__emploi !== undefined) { patch.emploi_repere = r.e.emploi_repere; patch.categorie = r.e.categorie || null; }
      if (own.__coef !== undefined) patch.coefficient = r.e.coefficient;
      if (own.__logement !== undefined) patch.logement = !!own.__logement;
      const free = {};
      Object.entries(own).forEach(([k, val]) => {
        if (k.startsWith('__') || !String(val).trim()) return;
        const key = resolveKey(k);
        if (key && TO_FICHE[key]) Object.assign(patch, TO_FICHE[key](String(val).trim()) || {});
        else if (key === 'salaire_mensuel') { const n = decimal(val); const h = parseFloat(r.e.contract_hours) || 35; if (n) patch.salaire_horaire = Math.round(n / (h * 52 / 12) * 100) / 100; }
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

  function toggleAlready(id, on) {
    const n = new Set(already); if (on) n.add(id); else n.delete(id);
    setAlready(n);
    try { localStorage.setItem('planning-hpa:contrat-deja', JSON.stringify([...n])); } catch {}
  }

  // Depot du contrat signe : range dans le dossier du salarie (type Contrat), visible et notifie
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
      toggleAlready(emp.id, false);
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

  const inp = { width: '100%', background: C.bg, border: '1px solid ' + C.border, borderRadius: '6px', padding: '6px 8px', color: C.text, fontSize: '12px', fontFamily: 'inherit', boxSizing: 'border-box', marginTop: '3px' };
  const btn = { background: C.card, border: '1px solid ' + C.border, borderRadius: '8px', padding: '8px 12px', color: C.text, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600, whiteSpace: 'nowrap' };
  const lbl = { fontSize: '11px', color: C.muted, fontWeight: 500 };

  if (!emps) return <div style={{ padding: '30px', color: C.muted, fontSize: '13px' }}>Chargement...</div>;
  const list = emps.filter(e => showSigned || !isSigned(e))
    .sort((a, b) => (iso(a.hire_date) || '9999').localeCompare(iso(b.hire_date) || '9999') || (a.last_name || '').localeCompare(b.last_name || ''));
  const signedCount = emps.filter(isSigned).length;

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1150px' }}>
      <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" style={{ display: 'none' }} onChange={e => uploadSigned(e.target.files[0])} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div style={{ maxWidth: '660px' }}>
          <div style={{ fontSize: '16px', fontWeight: 600, color: C.text, marginBottom: '4px' }}>Contrats de travail</div>
          <div style={{ fontSize: '12px', color: C.muted, lineHeight: 1.6 }}>
            Salariés sans contrat signé pour leur contrat en cours. Choisissez l'emploi et le coefficient (le salaire est calculé selon la CC HPA),
            complétez les cases orange, générez le contrat Word en un clic, puis déposez le contrat signé : il est rangé dans son dossier et le salarié est prévenu.
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
            const deja = already.has(emp.id);
            const own = edits[emp.id] || {};
            const e = r ? r.e : emp;
            const row = GRID.find(g => g.emploi === e.emploi_repere) || null;
            const sugg = suggestions(e.role);
            const coef = parseInt(e.coefficient, 10) || null;
            const open = !signed && !deja && r;
            const isOpen = open && expanded.has(emp.id);
            const shownSalary = r ? (r.salaryField && r.salaryField in own ? own[r.salaryField] : r.known.salaire_mensuel) : '';
            const defaultKeys = r ? Object.keys(r.values).filter(k => DEFAULTS.has(resolveKey(k)) && !r.missing.includes(k)) : [];
            const boxes = r ? [...new Set([...r.missing, ...Object.keys(own).filter(k => !k.startsWith('__') && !CLASSIF.has(resolveKey(k)) && !DEFAULTS.has(resolveKey(k)))])] : [];
            const todo = r ? r.missing.length + (r.has('coefficient') && !coef ? 1 : 0) : 0;
            return (
              <div key={emp.id} style={{ background: C.card, border: '1px solid ' + C.border, borderLeft: '4px solid ' + (signed ? C.green : deja ? C.muted : todo ? C.amber : C.purple), borderRadius: '12px', padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  {/* Fleche : deplie / replie le detail */}
                  <button onClick={() => open && toggleRow(emp.id)} disabled={!open} aria-label={isOpen ? 'Replier' : 'Déplier'}
                    style={{ width: '28px', height: '28px', borderRadius: '8px', border: '1px solid ' + C.border, background: isOpen ? C.purpleLight : C.bg, color: open ? C.purple : C.border, cursor: open ? 'pointer' : 'default', fontSize: '12px', flexShrink: 0, transition: 'transform .15s', transform: isOpen ? 'rotate(90deg)' : 'none' }}>▶</button>
                  <div onClick={() => open && toggleRow(emp.id)} style={{ flex: 1, minWidth: '200px', cursor: open ? 'pointer' : 'default' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: C.text }}>
                      {emp.first_name} {emp.last_name}{!emp.is_active && <span style={{ fontSize: '11px', color: C.amber, fontWeight: 500 }}> · compte à valider</span>}
                      <span style={{ fontSize: '12px', fontWeight: 400, color: C.muted }}> · {emp.role || 'Poste ?'}{emp.hire_date ? ' · ' + fr(emp.hire_date) : ''}{emp.contract_end_date ? ' → ' + fr(emp.contract_end_date) : ''}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: signed ? C.green : C.muted }}>
                      {signed ? '✓ Contrat signé déposé le ' + fr(emp.contrat_signe_at) : deja ? 'Contrat déjà établi : déposez-le une fois signé' : emp.contrat_genere_at ? 'Contrat généré le ' + fr(emp.contrat_genere_at) + ' · en attente de signature' : 'Contrat pas encore généré'}
                    </div>
                  </div>
                  {open && (
                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '999px', background: todo ? C.amberLight : C.greenLight, color: todo ? C.amber : C.green }}>
                      {todo ? todo + ' à compléter' : '✓ Complet'}
                    </span>
                  )}
                  {open && (
                    <button onClick={() => generate(emp)} disabled={busy === emp.id + ':gen'} style={{ ...btn, background: C.purple, borderColor: C.purple, color: '#fff', opacity: busy === emp.id + ':gen' ? 0.6 : 1 }}>
                      {busy === emp.id + ':gen' ? '...' : '⬇ Contrat .docx'}
                    </button>
                  )}
                  {signed ? <button onClick={() => openSigned(emp)} style={btn}>📄 Voir le contrat signé</button> : (
                    <>
                      <label style={{ fontSize: '12px', color: C.text, display: 'flex', gap: '5px', alignItems: 'center', cursor: 'pointer', whiteSpace: 'nowrap' }} title="Masque les champs : il ne reste qu'à déposer le contrat signé">
                        <input type="checkbox" checked={deja} onChange={ev => toggleAlready(emp.id, ev.target.checked)} style={{ accentColor: C.purple }} /> J'ai déjà le contrat
                      </label>
                      <button onClick={() => { uploadFor.current = emp; fileRef.current?.click(); }} disabled={busy === emp.id + ':up'} style={{ ...btn, color: C.green, borderColor: C.green + '88' }}>
                        {busy === emp.id + ':up' ? 'Dépôt...' : '📎 Déposer le contrat signé'}
                      </button>
                    </>
                  )}
                </div>

                {isOpen && (
                  <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid ' + C.border }}>
                    {templates.length > 1 && (
                      <label style={{ ...lbl, display: 'block', marginBottom: '10px', maxWidth: '360px' }}>MODÈLE DE CONTRAT
                        <select value={tplId || ''} onChange={ev => { const id = ev.target.value; setChoice(c => ({ ...c, [emp.id]: id })); ensureTemplate(id).catch(err => showToast('Modèle illisible : ' + templateError(err), C.red)); }} style={inp}>
                          {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </label>
                    )}
                    {/* Classification CC HPA : emploi -> categorie, coefficient -> salaire */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 2fr) minmax(150px, 1fr) minmax(170px, 1fr) auto', gap: '10px', alignItems: 'end' }}>
                      <label style={lbl}>EMPLOI DE LA GRILLE → CATÉGORIE
                        <select style={{ ...inp, borderColor: row ? C.border : C.amber }} value={e.emploi_repere || ''}
                          onChange={ev => { const g = GRID.find(x => x.emploi === ev.target.value); setEdits(prev => ({ ...prev, [emp.id]: { ...(prev[emp.id] || {}), __emploi: ev.target.value, __coef: g && (!coef || coef < g.min || coef > g.max) ? String(g.min) : (prev[emp.id] || {}).__coef } })); }}>
                          <option value="">— Choisir —</option>
                          {sugg.length > 0 && (
                            <optgroup label={'Suggérés pour « ' + e.role + ' »'}>
                              {sugg.map(g => <option key={'s' + g.emploi} value={g.emploi}>{g.emploi} · cat. {g.cat} ({g.min}–{g.max})</option>)}
                            </optgroup>
                          )}
                          {Object.entries(CATEGORIES).map(([cat, label]) => (
                            <optgroup key={cat} label={'Catégorie ' + cat + ' – ' + label}>
                              {GRID.filter(g => String(g.cat) === cat).map(g => <option key={g.emploi} value={g.emploi}>{g.emploi} ({g.min}–{g.max})</option>)}
                            </optgroup>
                          ))}
                        </select>
                      </label>
                      <label style={lbl}>COEFFICIENT
                        {row ? (
                          <select style={{ ...inp, borderColor: coef ? C.border : C.amber }} value={coef || ''} onChange={ev => setEdit(emp.id, '__coef', ev.target.value)}>
                            {!coef && <option value="">—</option>}
                            {coefOptions(row).map(c => <option key={c} value={c}>{c} · {eur(minimumFor(c, cfg).monthly)}</option>)}
                          </select>
                        ) : (
                          <input style={{ ...inp, borderColor: coef ? C.border : C.amber }} type="number" min="100" max="700" step="5" value={coef || ''} placeholder="Choisir l'emploi" onChange={ev => setEdit(emp.id, '__coef', ev.target.value)} />
                        )}
                      </label>
                      <label style={lbl}>SALAIRE BRUT MENSUEL (€)
                        <input style={inp} value={shownSalary || ''} placeholder="calculé"
                          onChange={ev => r.salaryField && setEdit(emp.id, r.salaryField, ev.target.value)} disabled={!r.salaryField} title={r.salaryField ? 'Calculé à partir du coefficient ; modifiable' : 'Ce modèle ne contient pas de champ salaire'} />
                      </label>
                      <label style={{ ...lbl, display: 'flex', gap: '6px', alignItems: 'center', color: C.text, fontSize: '12px', cursor: 'pointer', paddingBottom: '8px' }}>
                        <input type="checkbox" checked={!!e.logement} onChange={ev => setEdit(emp.id, '__logement', ev.target.checked)} style={{ accentColor: C.purple }} /> Logement
                      </label>
                    </div>
                    <div style={{ fontSize: '11px', color: C.muted, marginTop: '5px', lineHeight: 1.6 }}>
                      {row ? 'Catégorie ' + row.cat + ' · ' + CATEGORIES[row.cat] + ' · ' : ''}
                      {shownSalary ? 'En lettres : ' + (r.salaryField && r.salaryField in own ? montantEnLettres(decimal(own[r.salaryField])) : r.known.salaire_lettres) + (parseFloat(e.contract_hours) && parseFloat(e.contract_hours) !== 35 ? ' (pour ' + e.contract_hours + ' h / semaine)' : '') : "Choisissez l'emploi puis le coefficient : le salaire minimum conventionnel est calculé."}
                      {e.logement && !r.has('logement') && <span style={{ color: C.amber }}> · Ajoutez le champ «LOGEMENT» dans le modèle pour faire figurer le paragraphe du logement.</span>}
                    </div>

                    {/* Valeurs par defaut, modifiables */}
                    {defaultKeys.length > 0 && (
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
                        {defaultKeys.map(k => (
                          <label key={k} style={{ ...lbl, width: '150px' }}>{labelOf(k).replace(/ \(.*\)$/, '')}
                            <input style={inp} value={k in own ? own[k] : r.values[k]} onChange={ev => setEdit(emp.id, k, ev.target.value)} />
                          </label>
                        ))}
                      </div>
                    )}

                    {/* Champs manquants */}
                    {boxes.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px', marginTop: '10px' }}>
                        {boxes.map(k => {
                          const key = resolveKey(k);
                          const long = key === 'taches';
                          const val = own[k] ?? '';
                          const set = v => setEdit(emp.id, k, v);
                          const st = { ...inp, borderColor: String(val).trim() ? C.border : C.amber };
                          return (
                            <label key={k} style={{ ...lbl, color: key ? C.muted : C.purple, gridColumn: long ? '1 / -1' : 'auto' }}>
                              {labelOf(k)}
                              {key === 'civilite' ? (
                                <select style={st} value={val} onChange={ev => set(ev.target.value)}><option value="">—</option><option>Madame</option><option>Monsieur</option></select>
                              ) : long ? (
                                <textarea style={{ ...st, minHeight: '50px', resize: 'vertical' }} value={val} onChange={ev => set(ev.target.value)} placeholder="Une tâche par ligne" />
                              ) : (
                                <input style={st} value={val} onChange={ev => set(ev.target.value)} placeholder={/date/.test(key || '') ? 'JJ/MM/AAAA' : ''} />
                              )}
                            </label>
                          );
                        })}
                      </div>
                    )}
                    <div style={{ fontSize: '10px', color: C.muted, marginTop: '8px' }}>Les choix et saisies sont enregistrés dans la fiche du salarié à la génération du contrat.</div>
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
