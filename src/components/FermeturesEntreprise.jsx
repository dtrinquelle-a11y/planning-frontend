import React, { useEffect, useState } from 'react';
import axios from 'axios';
import supabase from '../supabase';
import { useTheme } from '../ThemeContext';
import { API } from '../config';
import { frDate } from '../absences';

const days = (s, e) => Math.round((new Date(e + 'T00:00:00') - new Date(s + 'T00:00:00')) / 86400000) + 1;
const iso = d => (d ? String(d).slice(0, 10) : null);

// Parametrage > Conges payes : fermetures de l'entreprise (Noel...) ou les conges payes sont imposes.
// "Appliquer" pose un conge paye deja accepte a chaque salarie concerne ; "Retirer" les annule.
export default function FermeturesEntreprise() {
  const { colors: C } = useTheme();
  const [list, setList] = useState([]);
  const [counts, setCounts] = useState({}); // closure_id -> nb de conges poses (acceptes)
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  async function load() {
    const r = await axios.get(API + '/settings/cp_fermetures').catch(() => ({ data: {} }));
    const value = Array.isArray(r.data?.value) ? r.data.value : [];
    setList(value);
    const { data } = await supabase.from('absence_requests').select('closure_id').not('closure_id', 'is', null).eq('status', 'acceptee');
    const c = {};
    (data || []).forEach(a => { c[a.closure_id] = (c[a.closure_id] || 0) + 1; });
    setCounts(c);
  }
  useEffect(() => { load(); }, []);

  async function saveList(next) {
    await axios.patch(API + '/settings/cp_fermetures', next);
    setList(next);
  }

  async function addClosure() {
    const f = form;
    if (!f.start || !f.end || f.end < f.start) { setMsg({ err: true, text: 'Indiquez une date de début et une date de fin (après le début).' }); return; }
    const c = { id: crypto.randomUUID(), start: f.start, end: f.end, label: f.label.trim() || "Fermeture de l'entreprise" };
    try {
      await saveList([...list, c].sort((a, b) => a.start.localeCompare(b.start)));
      setForm(null); setMsg(null);
      await apply(c);
    } catch (err) { setMsg({ err: true, text: 'Erreur : ' + err.message }); }
  }

  // Pose les conges a tous les salaries actifs dont le contrat couvre (en partie) la fermeture
  async function apply(c) {
    setBusy(c.id); setMsg(null);
    try {
      const [{ data: emps }, { data: abs }] = await Promise.all([
        supabase.from('employees').select('id, first_name, last_name, hire_date, contract_end_date').eq('is_active', true).eq('is_temp', false),
        supabase.from('absence_requests').select('employee_id, closure_id, type, start_date, end_date, status')
          .in('status', ['en_attente', 'acceptee']).lte('start_date', c.end).gte('end_date', c.start),
      ]);
      const targets = [], already = [], busyEmps = [];
      (emps || []).forEach(e => {
        const start = iso(e.hire_date) && iso(e.hire_date) > c.start ? iso(e.hire_date) : c.start;
        const end = iso(e.contract_end_date) && iso(e.contract_end_date) < c.end ? iso(e.contract_end_date) : c.end;
        if (start > end) return; // contrat en dehors de la fermeture
        const mine = (abs || []).filter(a => a.employee_id === e.id);
        if (mine.some(a => a.closure_id === c.id)) { already.push(e); return; }
        if (mine.length) { busyEmps.push(e); return; } // deja une absence sur la periode : a traiter a la main
        targets.push({ e, start, end });
      });
      if (!targets.length) {
        setMsg({ err: false, text: 'Rien à poser : ' + (already.length ? already.length + ' salarié(s) ont déjà ces congés' : 'aucun salarié concerné') + (busyEmps.length ? ' · déjà absents sur la période : ' + busyEmps.map(e => e.first_name).join(', ') : '') + '.' });
        return;
      }
      const ok = window.confirm('« ' + c.label + ' » du ' + frDate(c.start) + ' au ' + frDate(c.end) + '\n\n'
        + 'Poser des congés payés (acceptés) à ' + targets.length + ' salarié(s) ?'
        + (busyEmps.length ? '\n\nIgnorés car déjà absents sur la période (à vérifier) : ' + busyEmps.map(e => e.first_name + ' ' + e.last_name).join(', ') : '')
        + (already.length ? '\n\nDéjà posés pour ' + already.length + ' salarié(s).' : ''));
      if (!ok) return;
      const { data: session } = await supabase.auth.getSession();
      const now = new Date().toISOString();
      const { error } = await supabase.from('absence_requests').insert(targets.map(t => ({
        employee_id: t.e.id, type: 'conge_paye', start_date: t.start, end_date: t.end, status: 'acceptee',
        comment: c.label, manager_comment: "Fermeture de l'entreprise : " + c.label,
        decided_by: session.session?.user?.id || null, decided_at: now, closure_id: c.id,
      })));
      if (error) throw error;
      await load();
      window.dispatchEvent(new Event('badges-refresh'));
      if (window.confirm(targets.length + ' congé(s) posé(s).\n\nPrévenir maintenant les salariés par email ?')) {
        const r = await axios.post(API + '/absences/closure-notify', { closure_id: c.id });
        setMsg({ err: false, text: targets.length + ' congé(s) posé(s) · ' + r.data.sent + ' email(s) envoyé(s)' + (busyEmps.length ? ' · à vérifier : ' + busyEmps.map(e => e.first_name).join(', ') : '') });
      } else {
        setMsg({ err: false, text: targets.length + ' congé(s) posé(s)' + (busyEmps.length ? ' · à vérifier : ' + busyEmps.map(e => e.first_name).join(', ') : '') });
      }
    } catch (err) {
      setMsg({ err: true, text: 'Erreur : ' + (err.response?.data?.error || err.message) });
    } finally { setBusy(null); }
  }

  // Annule les conges poses par cette fermeture (trace conservee : statut "annulee")
  async function removeLeaves(c) {
    if (!window.confirm('Retirer les ' + (counts[c.id] || 0) + ' congé(s) posé(s) pour « ' + c.label + ' » ?\nIls passeront en « Annulée » (l\'historique est conservé).')) return;
    setBusy(c.id);
    const { error } = await supabase.from('absence_requests').update({ status: 'annulee', manager_comment: "Fermeture de l'entreprise annulée", decided_at: new Date().toISOString() })
      .eq('closure_id', c.id).eq('status', 'acceptee');
    setBusy(null);
    if (error) { setMsg({ err: true, text: 'Erreur : ' + error.message }); return; }
    setMsg({ err: false, text: 'Congés retirés.' });
    load();
  }

  async function deleteClosure(c) {
    if (counts[c.id]) { setMsg({ err: true, text: 'Retirez d\'abord les congés posés pour cette fermeture.' }); return; }
    if (!window.confirm('Supprimer la fermeture « ' + c.label + ' » ?')) return;
    await saveList(list.filter(x => x.id !== c.id));
  }

  const inp = { width: '100%', background: C.bg, border: '1px solid ' + C.border, borderRadius: '6px', padding: '8px 10px', color: C.text, fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' };
  const lbl = { display: 'block', fontSize: '10px', color: C.muted, letterSpacing: '0.08em', marginBottom: '4px', fontWeight: 500 };
  const btn = { background: C.card, border: '1px solid ' + C.border, borderRadius: '6px', padding: '6px 12px', color: C.text, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' };
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ marginTop: '36px', paddingTop: '24px', borderTop: '1px solid ' + C.border }}>
      <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px', color: C.text }}>Fermetures de l'entreprise (congés imposés)</div>
      <div style={{ fontSize: '12px', color: C.muted, marginBottom: '18px', lineHeight: 1.6 }}>
        Pendant une fermeture (Noël…), les congés payés sont posés d'office et déjà acceptés pour tous les salariés actifs dont le contrat couvre la période.
        Ils apparaissent dans le planning et dans l'espace de chaque salarié. Un salarié déjà absent sur la période est signalé pour que vous traitiez son cas.
        Pour un salarié embauché après coup, cliquez de nouveau sur « Appliquer » : seuls les congés manquants sont ajoutés.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {list.length === 0 && !form && (
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '20px', textAlign: 'center', color: C.muted, fontSize: '12px' }}>Aucune fermeture programmée.</div>
        )}
        {list.map(c => {
          const n = counts[c.id] || 0;
          const past = c.end < today;
          return (
            <div key={c.id} style={{ background: C.card, border: '1px solid ' + C.border, borderLeft: '4px solid #2563EB', borderRadius: '10px', padding: '14px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', opacity: past ? 0.6 : 1 }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: C.text }}>🏠 {c.label}</div>
                <div style={{ fontSize: '12px', color: C.muted }}>Du {frDate(c.start)} au {frDate(c.end)} · {days(c.start, c.end)} jours{past ? ' · passée' : ''}</div>
                <div style={{ fontSize: '11px', color: n ? C.green : C.amber, marginTop: '2px' }}>{n ? '✓ Congés posés pour ' + n + ' salarié(s)' : 'Congés pas encore posés'}</div>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button onClick={() => apply(c)} disabled={busy === c.id} style={{ ...btn, background: C.purple, borderColor: C.purple, color: '#fff', fontWeight: 600, opacity: busy === c.id ? 0.6 : 1 }}>{busy === c.id ? '...' : n ? 'Réappliquer' : 'Appliquer'}</button>
                {n > 0 && <button onClick={() => removeLeaves(c)} disabled={busy === c.id} style={{ ...btn, color: C.red }}>Retirer les congés</button>}
                <button onClick={() => deleteClosure(c)} title="Supprimer la fermeture" style={{ ...btn, color: C.muted }}>✕</button>
              </div>
            </div>
          );
        })}
        {form && (
          <div style={{ background: C.card, border: '1px solid ' + C.purple, borderRadius: '10px', padding: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr', gap: '10px', alignItems: 'end' }}>
            <div><label style={lbl}>DU</label><input type="date" style={inp} value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))} /></div>
            <div><label style={lbl}>AU (INCLUS)</label><input type="date" style={inp} value={form.end} min={form.start || undefined} onChange={e => setForm(f => ({ ...f, end: e.target.value }))} /></div>
            <div><label style={lbl}>MOTIF</label><input style={inp} placeholder="Ex : Fermeture de Noël" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} /></div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px' }}>
              <button onClick={addClosure} style={{ ...btn, background: C.purple, borderColor: C.purple, color: '#fff', fontWeight: 600 }}>Enregistrer et poser les congés</button>
              <button onClick={() => setForm(null)} style={btn}>Annuler</button>
            </div>
          </div>
        )}
      </div>
      {!form && (
        <button onClick={() => setForm({ start: '', end: '', label: '' })}
          style={{ marginTop: '12px', background: C.card, border: '1px dashed ' + C.border, borderRadius: '8px', padding: '9px 16px', color: C.text, fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer' }}>
          + Ajouter une fermeture
        </button>
      )}
      {msg && <div style={{ marginTop: '12px', fontSize: '12px', color: msg.err ? C.red : C.green, lineHeight: 1.6 }}>{msg.text}</div>}
    </div>
  );
}
