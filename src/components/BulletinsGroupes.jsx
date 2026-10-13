import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import supabase from '../supabase';
import { useTheme } from '../ThemeContext';
import { API } from '../config';
import { readPages, assignPages, groupPages, extractPages, loadPdf } from '../payslips';

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const prevMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const periodLabel = p => { const [y, m] = p.split('-'); return MOIS[parseInt(m, 10) - 1] + ' ' + y; };

// Documents > Bulletins de paie groupes : un PDF unique -> un bulletin par salarie dans son dossier
export default function BulletinsGroupes({ onClose, onDone, inline }) {
  const { colors: C } = useTheme();
  const [emps, setEmps] = useState([]);
  const [periode, setPeriode] = useState(prevMonth());
  const [fileName, setFileName] = useState('');
  const [assign, setAssign] = useState(null);   // [{ page, employeeId, how }]
  const [already, setAlready] = useState(new Set()); // salaries ayant deja un bulletin pour la periode
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const pdfRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    supabase.from('employees').select('id, first_name, last_name, nss, service, is_active').eq('is_temp', false).order('last_name')
      .then(({ data }) => setEmps(data || []));
  }, []);
  useEffect(() => {
    supabase.from('documents').select('employee_id').eq('type', 'bulletin_paie').eq('periode', periode)
      .then(({ data }) => setAlready(new Set((data || []).map(d => d.employee_id))));
  }, [periode]);

  async function analyse(file) {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name)) { setMsg({ err: true, text: 'Choisissez le fichier PDF des bulletins.' }); return; }
    setMsg(null); setAssign(null); setFileName(file.name); setBusy('Lecture du PDF...');
    try {
      const buf = await file.arrayBuffer();
      const [pages, pdf] = await Promise.all([readPages(buf), loadPdf(buf)]);
      pdfRef.current = pdf;
      // N° de securite sociale trouves dans le PDF -> salaries (la base compare sans renvoyer les numeros)
      const candidates = [...new Set(pages.flatMap(p => p.nss))];
      const nssMap = {};
      if (candidates.length) {
        const { data } = await supabase.rpc('match_nss', { p_candidates: candidates });
        (data || []).forEach(m => { nssMap[m.candidate] = m.employee_id; });
      }
      const a = assignPages(pages, emps, nssMap);
      setAssign(a);
      if (pages.every(p => p.empty)) setMsg({ err: true, text: 'Ce PDF ne contient pas de texte lisible (document scanné) : attribuez les pages à la main ci-dessous.' });
    } catch (err) { setMsg({ err: true, text: 'Lecture impossible : ' + err.message }); }
    finally { setBusy(''); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function deposit() {
    const groups = groupPages(assign);
    if (!groups.length) return;
    const dup = groups.filter(g => already.has(g.employeeId));
    if (dup.length && !window.confirm(dup.length + ' salarié(s) ont déjà un bulletin pour ' + periodLabel(periode) + '. Ajouter quand même ?')) return;
    setBusy('Dépôt...'); setMsg(null);
    let ok = 0;
    const title = 'Bulletin de paie ' + periodLabel(periode);
    try {
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        setBusy('Dépôt ' + (i + 1) + ' / ' + groups.length + '...');
        const bytes = await extractPages(pdfRef.current, g.pages);
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const path = g.employeeId + '/' + Date.now() + '-' + i + '.pdf';
        const { error: ue } = await supabase.storage.from('documents-rh').upload(path, blob, { contentType: 'application/pdf' });
        if (ue) throw ue;
        const { error: de } = await supabase.from('documents').insert({ employee_id: g.employeeId, type: 'bulletin_paie', title, file_path: path, file_name: 'bulletin-' + periode + '.pdf', file_size: blob.size, mime_type: 'application/pdf', periode });
        if (de) throw de;
        if (notify) axios.post(API + '/documents/notify', { employee_id: g.employeeId, type: 'bulletin_paie', title, periode }).catch(() => {});
        ok++;
      }
      setMsg({ err: false, text: ok + ' bulletin(s) rangé(s) dans les dossiers' + (notify ? ', salariés prévenus.' : '.') });
      setAssign(null); setFileName('');
      if (onDone) onDone();
    } catch (err) {
      setMsg({ err: true, text: 'Arrêt après ' + ok + ' bulletin(s) : ' + err.message });
    } finally { setBusy(''); }
  }

  const name = id => { const e = emps.find(x => x.id === id); return e ? e.last_name + ' ' + e.first_name : ''; };
  const groups = assign ? groupPages(assign) : [];
  const unassigned = assign ? assign.filter(a => !a.employeeId).length : 0;
  const HOW = { reconnu: { t: 'reconnu', c: C.green }, suite: { t: 'suite (2e page)', c: C.muted }, ambigu: { t: 'à vérifier', c: C.amber }, inconnu: { t: 'non reconnu', c: C.red }, manuel: { t: 'choisi', c: C.purple } };
  const inp = { background: C.bg, border: '1px solid ' + C.border, borderRadius: '6px', padding: '7px 9px', color: C.text, fontSize: '13px', fontFamily: 'inherit' };
  const btn = { background: C.card, border: '1px solid ' + C.border, borderRadius: '8px', padding: '8px 14px', color: C.text, cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' };

  return (
    <div style={inline ? { padding: '24px', display: 'flex', justifyContent: 'center' } : { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }} onClick={() => !inline && !busy && onClose()}>
      <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '14px', padding: '22px', width: '760px', maxWidth: '100%', maxHeight: inline ? 'none' : '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: C.text, marginBottom: '4px' }}>📑 Bulletins de paie groupés</div>
        <div style={{ fontSize: '12px', color: C.muted, marginBottom: '16px', lineHeight: 1.6 }}>
          Déposez le PDF unique reçu de la paie : chaque page est attribuée au salarié dont le nom (ou le n° de sécurité sociale) y figure ;
          une page sans nom est rattachée au bulletin précédent (bulletins de 2 pages). Vérifiez, puis tout est rangé dans les dossiers individuels.
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '14px' }}>
          <label style={{ fontSize: '11px', color: C.muted }}>PÉRIODE<br />
            <input type="month" style={{ ...inp, marginTop: '4px' }} value={periode} onChange={e => setPeriode(e.target.value)} />
          </label>
          <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => analyse(e.target.files[0])} />
          <button onClick={() => fileRef.current?.click()} disabled={!!busy || !emps.length} style={{ ...btn, background: C.purple, borderColor: C.purple, color: '#fff', fontWeight: 600 }}>
            {fileName ? '↻ Changer de PDF' : '📄 Choisir le PDF des bulletins'}
          </button>
          {fileName && <span style={{ fontSize: '12px', color: C.muted }}>{fileName}</span>}
        </div>

        {busy && <div style={{ fontSize: '13px', color: C.purple, marginBottom: '10px' }}>{busy}</div>}
        {msg && <div style={{ fontSize: '12px', color: msg.err ? C.red : C.green, marginBottom: '12px', lineHeight: 1.6 }}>{msg.text}</div>}

        {assign && (
          <>
            <div style={{ fontSize: '13px', color: C.text, marginBottom: '8px' }}>
              <strong>{assign.length} page(s)</strong> → <strong>{groups.length} bulletin(s)</strong>
              {unassigned > 0 && <span style={{ color: C.red }}> · {unassigned} page(s) non attribuée(s), qui ne seront pas déposées</span>}
            </div>
            <div style={{ border: '1px solid ' + C.border, borderRadius: '10px', overflow: 'hidden', marginBottom: '14px' }}>
              {assign.map((a, i) => {
                const h = HOW[a.how];
                const newGroup = i === 0 || assign[i - 1].employeeId !== a.employeeId;
                return (
                  <div key={a.page} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', borderTop: i && newGroup ? '2px solid ' + C.border : i ? '1px dashed ' + C.border : 'none', background: a.employeeId ? 'transparent' : C.redLight }}>
                    <span style={{ fontSize: '12px', color: C.muted, width: '60px' }}>Page {a.page + 1}</span>
                    <select value={a.employeeId} onChange={e => setAssign(prev => prev.map(x => x.page === a.page ? { ...x, employeeId: e.target.value, how: 'manuel' } : x))} style={{ ...inp, flex: 1, padding: '5px 8px', fontSize: '12px' }}>
                      <option value="">— Ne pas déposer —</option>
                      {emps.map(e => <option key={e.id} value={e.id}>{e.last_name} {e.first_name}{e.is_active ? '' : ' (inactif)'}</option>)}
                    </select>
                    <span style={{ fontSize: '11px', color: h.c, width: '110px' }}>{h.t}</span>
                    {a.employeeId && newGroup && already.has(a.employeeId) && <span style={{ fontSize: '11px', color: C.amber }}>déjà un bulletin</span>}
                  </div>
                );
              })}
            </div>
            <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px', color: C.text, marginBottom: '14px', cursor: 'pointer' }}>
              <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} style={{ accentColor: C.purple }} /> Prévenir chaque salarié (email et notification)
            </label>
          </>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          {!inline && <button onClick={onClose} disabled={!!busy} style={btn}>Fermer</button>}
          {assign && groups.length > 0 && (
            <button onClick={deposit} disabled={!!busy} style={{ ...btn, background: C.green, borderColor: C.green, color: '#fff', fontWeight: 600 }}>
              Ranger {groups.length} bulletin(s) · {periodLabel(periode)}
            </button>
          )}
        </div>
        {groups.length > 0 && <div style={{ fontSize: '11px', color: C.muted, marginTop: '10px', textAlign: 'right' }}>{groups.map(g => name(g.employeeId) + ' (' + g.pages.length + ' p.)').join(' · ')}</div>}
      </div>
    </div>
  );
}
