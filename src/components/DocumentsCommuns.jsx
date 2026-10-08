import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import supabase from '../supabase';
import { useTheme } from '../ThemeContext';
import { API } from '../config';
import { RENEWALS, docStatus, STATUS_INFO, youtubeId, frDateTime, frDay, openCommonFile } from '../signatures';

const EMPTY = { title: '', description: '', kind: 'fichier', video_url: '', renewal: 'annuel', file: null };
const todayIso = () => new Date().toISOString().slice(0, 10);

// Page manager : documents communs a lire et signer par tous les salaries (Document Unique, reglement, video...)
export default function DocumentsCommuns() {
  const { colors: C } = useTheme();
  const [docs, setDocs] = useState([]);
  const [sigs, setSigs] = useState([]);
  const [emps, setEmps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState(null);       // { mode: 'new' | 'edit' | 'version', doc?, ...champs }
  const [detail, setDetail] = useState(null);   // id du document dont on affiche le suivi
  const [paper, setPaper] = useState(null);     // { doc, emp, date } : signature papier a enregistrer
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const fileRef = useRef(null);
  const toastTimer = useRef(null);

  function showToast(msg, color) { setToast({ msg, color: color || C.green }); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 3500); }

  async function load() {
    setLoading(true);
    const [d, s, e] = await Promise.all([
      supabase.from('mandatory_docs').select('*').order('sort_order').order('created_at'),
      supabase.from('mandatory_doc_signatures').select('*').order('signed_at', { ascending: false }),
      supabase.from('employees').select('id, first_name, last_name, service, email, is_active, is_temp, contract_end_date').eq('is_active', true).eq('is_temp', false).order('last_name'),
    ]);
    setDocs(d.data || []); setSigs(s.data || []);
    // Salaries concernes : actifs, hors equipiers temporaires, contrat non termine
    setEmps((e.data || []).filter(x => !x.contract_end_date || String(x.contract_end_date).slice(0, 10) >= todayIso()));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const sigsOf = empId => sigs.filter(s => s.employee_id === empId);
  const progress = doc => emps.filter(e => docStatus(doc, sigsOf(e.id)).state === 'signe').length;

  async function uploadFile(docId, file) {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    const path = docId + '/' + Date.now() + '.' + ext;
    const { error } = await supabase.storage.from('documents-communs').upload(path, file, { contentType: file.type || undefined });
    if (error) throw error;
    return { file_path: path, file_name: file.name, mime_type: file.type || null, file_size: file.size };
  }

  async function save() {
    const f = form;
    if (f.mode !== 'version' && !f.title.trim()) { showToast('Indiquez un titre', C.red); return; }
    if (f.mode !== 'edit') {
      if (f.kind === 'fichier' && !f.file) { showToast('Choisissez le fichier', C.red); return; }
      if (f.kind === 'video' && !youtubeId(f.video_url) && !/^https?:\/\//.test(f.video_url.trim())) { showToast('Collez le lien de la vidéo YouTube', C.red); return; }
      if (f.file && f.file.size > 50 * 1024 * 1024) { showToast('Fichier trop lourd (50 Mo maximum)', C.red); return; }
    }
    setBusy(true);
    try {
      if (f.mode === 'new') {
        const id = crypto.randomUUID();
        const media = f.kind === 'fichier' ? await uploadFile(id, f.file) : { video_url: f.video_url.trim() };
        const { error } = await supabase.from('mandatory_docs').insert({ id, title: f.title.trim(), description: f.description.trim() || null, kind: f.kind, renewal: f.renewal, sort_order: docs.length, ...media });
        if (error) throw error;
        setForm(null); await load();
        if (emps.length && window.confirm('Document ajouté.\n\nPrévenir maintenant par email les ' + emps.length + ' salariés concernés ?')) await remind({ id, title: f.title.trim() }, true);
        else showToast('Document ajouté');
      } else if (f.mode === 'edit') {
        const { error } = await supabase.from('mandatory_docs').update({ title: f.title.trim(), description: f.description.trim() || null, renewal: f.renewal }).eq('id', f.doc.id);
        if (error) throw error;
        setForm(null); showToast('Modifications enregistrées'); await load();
      } else {
        // Nouvelle version : l'ancienne est conservee (preuve de ce qui a ete signe) et tout le monde doit signer a nouveau
        const d = f.doc;
        const media = d.kind === 'fichier' ? await uploadFile(d.id, f.file) : { video_url: f.video_url.trim() };
        const prev = { version: d.version, version_date: d.version_date, file_path: d.file_path, file_name: d.file_name, video_url: d.video_url };
        const { error } = await supabase.from('mandatory_docs').update({ ...media, version: d.version + 1, version_date: new Date().toISOString(), previous_versions: [...(d.previous_versions || []), prev] }).eq('id', d.id);
        if (error) throw error;
        setForm(null); await load();
        if (emps.length && window.confirm('Nouvelle version enregistrée : tous les salariés doivent la signer de nouveau.\n\nLes prévenir maintenant par email ?')) await remind(d, true);
        else showToast('Nouvelle version enregistrée');
      }
    } catch (err) { showToast('Erreur : ' + err.message, C.red); }
    finally { setBusy(false); }
  }

  async function toggleArchive(doc) {
    if (doc.is_active && !window.confirm('Archiver « ' + doc.title + ' » ?\nIl ne sera plus demandé aux salariés. Les signatures déjà faites sont conservées.')) return;
    const { error } = await supabase.from('mandatory_docs').update({ is_active: !doc.is_active }).eq('id', doc.id);
    if (error) { showToast('Erreur : ' + error.message, C.red); return; }
    showToast(doc.is_active ? 'Document archivé' : 'Document réactivé'); load();
  }

  async function remind(doc, skipConfirm) {
    const missing = doc.id ? emps.filter(e => docStatus(docs.find(x => x.id === doc.id) || doc, sigsOf(e.id)).state !== 'signe').length : null;
    if (!skipConfirm && !window.confirm('Envoyer un email de rappel aux salariés qui n\'ont pas encore signé' + (missing != null ? ' (' + missing + ')' : '') + ' ?')) return;
    try {
      const r = await axios.post(API + '/mandatory-docs/remind', { doc_id: doc.id || null });
      showToast(r.data.sent + ' email(s) envoyé(s)' + (r.data.no_email ? ' · ' + r.data.no_email + ' salarié(s) sans email' : ''));
    } catch (err) { showToast('Erreur : ' + (err.response?.data?.error || err.message), C.red); }
  }

  async function savePaper() {
    const p = paper;
    if (!p.date || p.date > todayIso()) { showToast('Date invalide', C.red); return; }
    setBusy(true);
    const { error } = await supabase.from('mandatory_doc_signatures').insert({ doc_id: p.doc.id, employee_id: p.emp.id, signed_at: p.date + 'T12:00:00' });
    setBusy(false);
    if (error) { showToast('Erreur : ' + error.message, C.red); return; }
    setPaper(null); showToast('Signature papier enregistrée'); load();
  }

  // Registre des signatures (CSV pour Excel) : toutes les signatures conservees, toutes versions
  function exportCsv(doc) {
    const list = doc ? docs.filter(d => d.id === doc.id) : docs;
    const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const lines = [['Document', 'Version', 'Salarié', 'Service', 'Date de signature', 'Mode', 'Statut actuel'].map(esc).join(';')];
    list.forEach(d => {
      emps.forEach(e => {
        const st = docStatus(d, sigsOf(e.id));
        const mine = sigs.filter(s => s.doc_id === d.id && s.employee_id === e.id);
        if (!mine.length) lines.push([d.title, '', e.last_name + ' ' + e.first_name, e.service, '', '', STATUS_INFO[st.state].label].map(esc).join(';'));
        mine.forEach(s => lines.push([d.title, 'v' + s.version, e.last_name + ' ' + e.first_name, e.service, frDateTime(s.signed_at), s.method === 'papier' ? 'Papier' : 'En ligne', STATUS_INFO[st.state].label].map(esc).join(';')));
      });
    });
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'registre-signatures' + (doc ? '-' + doc.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') : '') + '_' + todayIso() + '.csv';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  const inp = { width: '100%', background: C.bg, border: '1px solid ' + C.border, borderRadius: '6px', padding: '8px 10px', color: C.text, fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' };
  const lbl = { display: 'block', fontSize: '10px', color: C.muted, letterSpacing: '0.08em', marginBottom: '4px', fontWeight: 500 };
  const btn = { background: C.card, border: '1px solid ' + C.border, borderRadius: '6px', padding: '5px 10px', color: C.text, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' };
  const shown = docs.filter(d => showArchived || d.is_active);

  return (
    <div style={{ padding: '20px 24px', maxWidth: '980px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div style={{ maxWidth: '620px' }}>
          <div style={{ fontSize: '16px', fontWeight: 600, color: C.text, marginBottom: '4px' }}>Documents à signer par tous</div>
          <div style={{ fontSize: '12px', color: C.muted, lineHeight: 1.6 }}>
            Document Unique, règlement intérieur, consignes, vidéo de sécurité… Chaque salarié actif les retrouve dans son espace (onglet « À signer »)
            et atteste les avoir lus. Date, heure et compte sont enregistrés comme preuve.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {docs.length > 0 && <button onClick={() => exportCsv(null)} style={btn}>↓ Registre complet (CSV)</button>}
          <button onClick={() => setForm({ mode: 'new', ...EMPTY })}
            style={{ background: C.purple, border: 'none', borderRadius: '8px', padding: '8px 16px', color: '#fff', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer' }}>+ Ajouter un document</button>
        </div>
      </div>

      {loading ? <div style={{ color: C.muted, fontSize: '12px' }}>Chargement...</div> : shown.length === 0 ? (
        <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '28px', textAlign: 'center', color: C.muted, fontSize: '12px', lineHeight: 1.7 }}>
          Aucun document pour le moment.<br />Ajoutez par exemple le Document Unique (PDF), le règlement intérieur ou une vidéo YouTube de formation.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {shown.map(doc => {
            const done = progress(doc); const total = emps.length; const pct = total ? Math.round(done / total * 100) : 0;
            const open = detail === doc.id;
            return (
              <div key={doc.id} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '12px 14px', opacity: doc.is_active ? 1 : 0.6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '20px' }}>{doc.kind === 'video' ? '🎬' : '📄'}</span>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: C.text }}>{doc.title}{!doc.is_active && <span style={{ fontWeight: 400, color: C.muted }}> · archivé</span>}</div>
                    <div style={{ fontSize: '11px', color: C.muted }}>
                      {RENEWALS.find(r => r.id === doc.renewal)?.label} · version {doc.version} du {frDay(doc.version_date)}
                      {doc.kind === 'fichier' ? ' · ' + doc.file_name : ''}
                    </div>
                  </div>
                  {doc.is_active && (
                    <div style={{ minWidth: '130px' }}>
                      <div style={{ fontSize: '11px', color: done === total ? C.green : C.text, fontWeight: 600, marginBottom: '3px' }}>{done} / {total} signé{done > 1 ? 's' : ''}</div>
                      <div style={{ height: '6px', background: C.border, borderRadius: '3px', overflow: 'hidden' }}><div style={{ height: '6px', width: pct + '%', background: done === total ? C.green : C.purple }} /></div>
                    </div>
                  )}
                  <button onClick={() => setDetail(open ? null : doc.id)} style={{ ...btn, background: open ? C.purpleLight : C.card, color: open ? C.purple : C.text }}>{open ? 'Fermer' : 'Suivi'}</button>
                </div>

                {open && (
                  <div style={{ marginTop: '12px', borderTop: '1px solid ' + C.border, paddingTop: '12px' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                      <button onClick={() => doc.kind === 'video' ? window.open(doc.video_url, '_blank') : openCommonFile(doc)} style={btn}>👁 Voir</button>
                      <button onClick={() => setForm({ mode: 'edit', doc, ...EMPTY, title: doc.title, description: doc.description || '', renewal: doc.renewal })} style={btn}>✏️ Modifier</button>
                      <button onClick={() => setForm({ mode: 'version', doc, ...EMPTY, kind: doc.kind, video_url: '' })} style={btn}>🔄 Nouvelle version</button>
                      {doc.is_active && done < total && <button onClick={() => remind(doc)} style={btn}>✉️ Relancer les non-signataires</button>}
                      <button onClick={() => exportCsv(doc)} style={btn}>↓ Registre (CSV)</button>
                      <button onClick={() => toggleArchive(doc)} style={{ ...btn, color: doc.is_active ? C.red : C.green }}>{doc.is_active ? 'Archiver' : 'Réactiver'}</button>
                    </div>
                    {doc.description && <div style={{ fontSize: '12px', color: C.muted, marginBottom: '10px', whiteSpace: 'pre-wrap' }}>{doc.description}</div>}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {emps.map(e => {
                        const st = docStatus(doc, sigsOf(e.id)); const info = STATUS_INFO[st.state];
                        return (
                          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', background: C.bg, borderRadius: '6px', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: '160px', fontSize: '12px', color: C.text }}>{e.first_name} {e.last_name} <span style={{ color: C.muted, fontSize: '11px' }}>· {e.service}</span></div>
                            <div style={{ fontSize: '11px', color: C.muted }}>
                              {st.last ? (st.last.method === 'papier' ? 'Papier, le ' + frDay(st.last.signed_at) : 'Le ' + frDateTime(st.last.signed_at)) + (st.last.version !== doc.version ? ' (v' + st.last.version + ')' : '') : ''}
                            </div>
                            <span style={{ background: info.bg, color: info.color, padding: '1px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600 }}>{info.label}</span>
                            {st.state !== 'signe' && doc.is_active && <button onClick={() => setPaper({ doc, emp: e, date: todayIso() })} style={{ ...btn, padding: '3px 8px', fontSize: '10px' }}>Signé sur papier</button>}
                          </div>
                        );
                      })}
                      {!emps.length && <div style={{ fontSize: '12px', color: C.muted }}>Aucun salarié actif.</div>}
                    </div>
                    {(doc.previous_versions || []).length > 0 && (
                      <div style={{ fontSize: '11px', color: C.muted, marginTop: '10px' }}>
                        Versions précédentes : {doc.previous_versions.map(v => 'v' + v.version + ' du ' + frDay(v.version_date)).join(' · ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {docs.some(d => !d.is_active) && (
        <label style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', fontSize: '11px', color: C.muted, marginTop: '12px', cursor: 'pointer' }}>
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Afficher les documents archivés
        </label>
      )}

      {/* Ajout / modification / nouvelle version */}
      {form && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }} onClick={() => !busy && setForm(null)}>
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '20px', width: '460px', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: C.text, marginBottom: '14px' }}>
              {form.mode === 'new' ? 'Ajouter un document à signer' : form.mode === 'edit' ? 'Modifier « ' + form.doc.title + ' »' : 'Nouvelle version de « ' + form.doc.title + ' »'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {form.mode !== 'version' && <>
                <div><label style={lbl}>TITRE</label><input style={inp} placeholder="Ex : Document Unique 2027" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
                <div><label style={lbl}>MESSAGE AUX SALARIÉS (FACULTATIF)</label><textarea style={{ ...inp, minHeight: '60px', resize: 'vertical' }} placeholder="Ex : à lire attentivement avant votre première journée" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
                <div>
                  <label style={lbl}>SIGNATURE</label>
                  {RENEWALS.map(r => (
                    <label key={r.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '12px', color: C.text, marginBottom: '6px', cursor: 'pointer' }}>
                      <input type="radio" checked={form.renewal === r.id} onChange={() => setForm(f => ({ ...f, renewal: r.id }))} style={{ marginTop: '2px', accentColor: C.purple }} />
                      <span>{r.label} <span style={{ color: C.muted }}>— {r.hint}</span></span>
                    </label>
                  ))}
                </div>
              </>}
              {form.mode === 'new' && (
                <div>
                  <label style={lbl}>TYPE</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[{ id: 'fichier', l: '📄 Fichier (PDF, PowerPoint…)' }, { id: 'video', l: '🎬 Vidéo YouTube' }].map(k => (
                      <button key={k.id} onClick={() => setForm(f => ({ ...f, kind: k.id }))} style={{ ...btn, flex: 1, padding: '8px', background: form.kind === k.id ? C.purpleLight : C.card, color: form.kind === k.id ? C.purple : C.text, borderColor: form.kind === k.id ? C.purple : C.border }}>{k.l}</button>
                    ))}
                  </div>
                </div>
              )}
              {form.mode === 'version' && <div style={{ fontSize: '12px', color: C.amber, background: C.amberLight, borderRadius: '6px', padding: '8px 10px' }}>Tous les salariés devront signer cette nouvelle version. L'ancienne version et ses signatures sont conservées.</div>}
              {form.mode !== 'edit' && (form.kind === 'fichier' ? (
                <div>
                  <label style={lbl}>FICHIER (50 MO MAXIMUM)</label>
                  <input ref={fileRef} type="file" accept=".pdf,.ppt,.pptx,.doc,.docx,.jpg,.jpeg,.png,.mp4" onChange={e => setForm(f => ({ ...f, file: e.target.files[0] || null }))} style={{ fontSize: '12px', color: C.text }} />
                  <div style={{ fontSize: '11px', color: C.muted, marginTop: '6px', lineHeight: 1.5 }}>Conseil : enregistrez les PowerPoint en PDF (Fichier › Enregistrer sous › PDF) pour qu'ils s'ouvrent directement sur téléphone.</div>
                </div>
              ) : (
                <div>
                  <label style={lbl}>LIEN DE LA VIDÉO YOUTUBE</label>
                  <input style={inp} placeholder="https://www.youtube.com/watch?v=…" value={form.video_url} onChange={e => setForm(f => ({ ...f, video_url: e.target.value }))} />
                  <div style={{ fontSize: '11px', color: youtubeId(form.video_url) ? C.green : C.muted, marginTop: '6px' }}>
                    {youtubeId(form.video_url) ? '✓ Vidéo reconnue : le salarié devra la regarder jusqu\'au bout pour signer.' : 'La vidéo peut être « non répertoriée » sur YouTube.'}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '18px' }}>
              <button onClick={() => setForm(null)} disabled={busy} style={btn}>Annuler</button>
              <button onClick={save} disabled={busy} style={{ background: C.purple, border: 'none', borderRadius: '6px', padding: '7px 16px', color: '#fff', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600, opacity: busy ? 0.6 : 1 }}>{busy ? 'Enregistrement...' : 'Enregistrer'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Signature papier */}
      {paper && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }} onClick={() => !busy && setPaper(null)}>
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '20px', width: '380px' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: C.text, marginBottom: '6px' }}>Signature sur papier</div>
            <div style={{ fontSize: '12px', color: C.muted, marginBottom: '14px', lineHeight: 1.6 }}>
              {paper.emp.first_name} {paper.emp.last_name} a signé « {paper.doc.title} » sur papier. Conservez l'original signé.
            </div>
            <label style={lbl}>DATE DE SIGNATURE</label>
            <input type="date" style={inp} value={paper.date} max={todayIso()} onChange={e => setPaper(p => ({ ...p, date: e.target.value }))} />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button onClick={() => setPaper(null)} disabled={busy} style={btn}>Annuler</button>
              <button onClick={savePaper} disabled={busy} style={{ background: C.green, border: 'none', borderRadius: '6px', padding: '7px 16px', color: '#fff', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600 }}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: C.card, border: '1px solid ' + toast.color, borderRadius: '8px', padding: '10px 16px', fontSize: '12px', color: toast.color, zIndex: 200, boxShadow: '0 4px 12px ' + C.shadow }}>{toast.msg}</div>}
    </div>
  );
}
