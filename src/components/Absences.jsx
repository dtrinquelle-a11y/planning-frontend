import React, { useEffect, useState } from 'react';
import axios from 'axios';
import supabase from '../supabase';
import { useTheme } from '../ThemeContext';
import { ABSENCE_STATUS, absenceType, absencePeriod, absenceDays, frDate } from '../absences';

const API = 'https://mon-planning-production.up.railway.app/api';

// Page manager : demandes d'absence a traiter et historique
export default function Absences() {
  const { colors: C } = useTheme();
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState('en_attente');
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState({});   // commentaire manager par demande
  const [conflicts, setConflicts] = useState({}); // nb de creneaux planifies pendant l'absence
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => { load(); }, []);

  function showToast(msg, color) { setToast({ msg, color: color || C.green }); setTimeout(() => setToast(null), 3000); }

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('absence_requests')
      .select('*, employees(first_name, last_name, service)')
      .order('start_date', { ascending: false });
    const list = data || [];
    setRequests(list);
    setLoading(false);
    // Creneaux deja planifies pendant les absences en attente ou acceptees
    const toCheck = list.filter(a => a.status === 'en_attente' || a.status === 'acceptee');
    const counts = {};
    await Promise.all(toCheck.map(async a => {
      const { count } = await supabase.from('schedules').select('id', { count: 'exact', head: true })
        .eq('employee_id', a.employee_id).gte('work_date', a.start_date).lte('work_date', a.end_date).neq('shift_type', 'repos');
      counts[a.id] = count || 0;
    }));
    setConflicts(counts);
  }

  async function decide(a, status) {
    setBusy(a.id);
    try {
      const { data: session } = await supabase.auth.getSession();
      const { error } = await supabase.from('absence_requests').update({
        status, manager_comment: (comments[a.id] || '').trim() || null,
        decided_by: session.session?.user?.id || null, decided_at: new Date().toISOString(),
      }).eq('id', a.id);
      if (error) throw error;
      axios.post(API + '/absences/notify', { request_id: a.id, event: 'decided' }).catch(() => {});
      showToast(status === 'acceptee' ? 'Demande acceptée · salarié prévenu' : 'Demande refusée · salarié prévenu');
      await load();
    } catch (err) {
      showToast('Erreur : ' + err.message, C.red);
    } finally { setBusy(null); }
  }

  const pendingCount = requests.filter(a => a.status === 'en_attente').length;
  const today = new Date().toISOString().slice(0, 10);
  const shown = requests.filter(a =>
    filter === 'en_attente' ? a.status === 'en_attente'
    : filter === 'a_venir' ? a.status === 'acceptee' && String(a.end_date) >= today
    : true);
  const inp = { width: '100%', background: C.bg, border: '1px solid ' + C.border, borderRadius: '6px', padding: '6px 10px', color: C.text, fontSize: '12px', fontFamily: 'inherit', boxSizing: 'border-box' };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Mono','Courier New',monospace", padding: '24px' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ fontSize: '11px', color: C.muted, letterSpacing: '0.1em', marginBottom: '4px' }}>ÉQUIPE</div>
        <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '18px' }}>Absences et congés</div>

        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {[{ id: 'en_attente', label: 'À traiter' + (pendingCount ? ' (' + pendingCount + ')' : '') }, { id: 'a_venir', label: 'Acceptées à venir' }, { id: 'toutes', label: 'Historique' }].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{ padding: '5px 14px', borderRadius: '20px', border: '1px solid ' + (filter === f.id ? C.purple : C.border), background: filter === f.id ? C.purpleLight : 'none', color: filter === f.id ? C.purple : C.muted, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }}>
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ color: C.muted, fontSize: '12px', textAlign: 'center', padding: '30px' }}>Chargement...</div>
        ) : shown.length === 0 ? (
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '30px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>
            {filter === 'en_attente' ? 'Aucune demande à traiter' : 'Aucune absence'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {shown.map(a => {
              const t = absenceType(a.type); const st = ABSENCE_STATUS[a.status];
              return (
                <div key={a.id} style={{ background: C.card, border: '1px solid ' + C.border, borderLeft: '4px solid ' + t.color, borderRadius: '10px', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{a.employees?.first_name} {a.employees?.last_name} <span style={{ fontSize: '11px', color: C.muted, fontWeight: 400 }}>· {a.employees?.service}</span></div>
                      <div style={{ fontSize: '12px', marginTop: '4px' }}>
                        <span style={{ background: t.bg, color: t.color, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>{t.label}</span>
                        <span style={{ marginLeft: '8px' }}>{absencePeriod(a)} · {absenceDays(a)} jour{absenceDays(a) > 1 ? 's' : ''}</span>
                      </div>
                      {a.comment && <div style={{ fontSize: '11px', color: C.muted, fontStyle: 'italic', marginTop: '4px' }}>« {a.comment} »</div>}
                      <div style={{ fontSize: '10px', color: C.muted, marginTop: '4px' }}>Demandé le {frDate(a.created_at)}{a.decided_at ? ' · traité le ' + frDate(a.decided_at) : ''}</div>
                      {conflicts[a.id] > 0 && (
                        <div style={{ fontSize: '11px', color: C.amber, marginTop: '6px' }}>⚠️ {conflicts[a.id]} créneau(x) déjà planifié(s) sur cette période</div>
                      )}
                      {a.manager_comment && a.status !== 'en_attente' && <div style={{ fontSize: '11px', marginTop: '4px' }}>Votre commentaire : {a.manager_comment}</div>}
                    </div>
                    <span style={{ background: st.bg, color: st.color, padding: '3px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>{st.label}</span>
                  </div>
                  {a.status === 'en_attente' && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                      <input style={{ ...inp, flex: 1, minWidth: '200px' }} placeholder="Commentaire pour le salarié (facultatif)" value={comments[a.id] || ''} onChange={e => setComments(c => ({ ...c, [a.id]: e.target.value }))} />
                      <button disabled={busy === a.id} onClick={() => decide(a, 'acceptee')} style={{ background: C.green, border: 'none', borderRadius: '6px', padding: '6px 16px', color: '#fff', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer', opacity: busy === a.id ? 0.6 : 1 }}>✓ Accepter</button>
                      <button disabled={busy === a.id} onClick={() => decide(a, 'refusee')} style={{ background: C.redLight, border: '1px solid ' + C.red + '44', borderRadius: '6px', padding: '6px 16px', color: C.red, fontSize: '12px', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer', opacity: busy === a.id ? 0.6 : 1 }}>Refuser</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {toast && <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: C.card, border: '1px solid ' + toast.color, borderRadius: '8px', padding: '10px 16px', fontSize: '12px', color: toast.color, zIndex: 200 }}>{toast.msg}</div>}
    </div>
  );
}
