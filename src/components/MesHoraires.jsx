import React, { useEffect, useState } from 'react';
import supabase from '../supabase';
import { useTheme } from '../ThemeContext';
import { NON_WORK, DECL_STATUS, isoDay, hm, mondayOf, lockAt, shiftEnd, canAnswer, absentOn } from '../declarations';
import useIsMobile from '../useIsMobile';

const JOURS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
const MOIS = ['jan.', 'fév.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const dayLabel = iso => { const d = new Date(iso + 'T00:00:00'); return JOURS[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS[d.getMonth()]; };
// Duree nette en minutes (pause deduite, fin apres minuit geree)
function netMin(start, end, brk) {
  const [a, b] = hm(start).split(':').map(Number), [c, d] = hm(end).split(':').map(Number);
  let m = c * 60 + d - a * 60 - b; if (m <= 0) m += 1440;
  return Math.max(0, m - (parseInt(brk, 10) || 0));
}
const fmtH = min => Math.floor(min / 60) + 'h' + String(min % 60).padStart(2, '0');

// Validation des horaires (pointeuse desactivee) : "Avez-vous realise les horaires prevus ?" a la fin de chaque creneau.
// Manager (asManager) : peut corriger a tout moment, meme apres la cloture du lundi.
export default function MesHoraires({ employee, asManager, onChange }) {
  const { colors: C } = useTheme();
  const mobile = useIsMobile();
  const [shifts, setShifts] = useState([]);
  const [decls, setDecls] = useState({});
  const [absences, setAbsences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(null); // { id, start, end, brk, comment, off }
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [weeksBack, setWeeksBack] = useState(1); // semaine en cours + precedente(s)

  async function load() {
    setLoading(true);
    const from = mondayOf(isoDay(new Date())); from.setDate(from.getDate() - 7 * weeksBack);
    const to = new Date(); to.setDate(to.getDate() + 1);
    const [sh, dc, ab] = await Promise.all([
      supabase.from('schedules').select('id, work_date, start_time, end_time, break_minutes, shift_type, note').eq('employee_id', employee.id)
        .gte('work_date', isoDay(from)).lte('work_date', isoDay(to)).order('work_date').order('start_time'),
      supabase.from('work_declarations').select('*').eq('employee_id', employee.id).gte('work_date', isoDay(from)),
      supabase.from('absence_requests').select('start_date, end_date').eq('employee_id', employee.id).eq('status', 'acceptee').gte('end_date', isoDay(from)),
    ]);
    setShifts((sh.data || []).filter(s => !NON_WORK.includes(s.shift_type)));
    setDecls(Object.fromEntries((dc.data || []).map(d => [d.schedule_id, d])));
    setAbsences(ab.data || []);
    setLoading(false);
  }
  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id, weeksBack]);

  async function declare(s, status, f) {
    setBusy(s.id); setMsg(null);
    const { error } = await supabase.rpc('declare_work', {
      p_schedule_id: s.id, p_status: status,
      p_start: f ? f.start : null, p_end: f ? f.end : null,
      p_break: f && f.brk !== '' ? parseInt(f.brk, 10) : null, p_comment: f ? f.comment : null,
    });
    setBusy(null);
    if (error) { setMsg({ err: true, text: error.message }); return false; }
    setEdit(null);
    await load();
    window.dispatchEvent(new Event('badges-refresh'));
    if (onChange) onChange();
    return true;
  }

  async function saveEdit(s) {
    const f = edit;
    if (f.off) return declare(s, 'non_travaille', { comment: f.comment });
    if (!f.start || !f.end || f.start === f.end) { setMsg({ err: true, text: 'Indiquez vos heures d\'arrivée et de départ.' }); return; }
    if (f.brk !== '' && (isNaN(parseInt(f.brk, 10)) || parseInt(f.brk, 10) < 0)) { setMsg({ err: true, text: 'Pause invalide.' }); return; }
    // Horaires identiques au prevu : simple validation
    const same = f.start === hm(s.start_time) && f.end === hm(s.end_time) && parseInt(f.brk || 0, 10) === (parseInt(s.break_minutes, 10) || 0);
    return declare(s, same ? 'conforme' : 'modifie', f);
  }

  async function confirmAll(list) {
    if (!window.confirm('Valider ' + list.length + ' journée(s) telles que prévues au planning ?')) return;
    for (const s of list) { if (!(await declare(s, 'conforme'))) break; }
  }

  if (loading) return <div style={{ color: C.muted, fontSize: '12px', textAlign: 'center', padding: '30px' }}>Chargement...</div>;

  const now = new Date();
  const weeks = {};
  shifts.forEach(s => { const k = isoDay(mondayOf(String(s.work_date).slice(0, 10))); (weeks[k] = weeks[k] || []).push(s); });
  const keys = Object.keys(weeks).sort().reverse();
  const inp = { background: C.bg, border: '1px solid ' + C.border, borderRadius: '6px', padding: '6px 8px', color: C.text, fontSize: '12px', fontFamily: 'inherit', boxSizing: 'border-box' };
  const btn = mobile
    ? { border: '1px solid ' + C.border, background: C.card, borderRadius: '12px', padding: '13px 18px', color: C.text, cursor: 'pointer', fontSize: '16px', fontFamily: 'inherit', fontWeight: 600 }
    : { border: '1px solid ' + C.border, background: C.card, borderRadius: '6px', padding: '6px 12px', color: C.text, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600 };
  if (mobile) inp.fontSize = '16px'; // 16 px : evite le zoom automatique de l'iPhone sur les champs

  return (
    <div>
      <div style={{ fontSize: '12px', color: C.muted, marginBottom: '14px', lineHeight: 1.6 }}>
        {asManager ? 'Horaires déclarés par le salarié. En tant que responsable, vous pouvez les corriger, même après la clôture.'
          : 'À la fin de chaque journée, confirmez vos horaires. Chaque semaine est clôturée le lundi à 12 h : les journées non validées sont alors retenues telles que prévues.'}
      </div>
      {msg && <div style={{ fontSize: '12px', color: msg.err ? C.red : C.green, marginBottom: '10px' }}>{msg.text}</div>}
      {!keys.length && <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '24px', textAlign: 'center', color: C.muted, fontSize: '12px' }}>Aucun créneau sur la période.</div>}

      {keys.map(k => {
        const list = weeks[k];
        const lock = lockAt(k);
        const locked = now >= lock;
        const todo = list.filter(s => !decls[s.id] && canAnswer(s, now) && !absentOn(absences, String(s.work_date).slice(0, 10)));
        const total = list.reduce((n, s) => { const d = decls[s.id]; if (d) return n + (d.status === 'non_travaille' ? 0 : netMin(d.start_time, d.end_time, d.break_minutes)); return n; }, 0);
        const end = new Date(k + 'T00:00:00'); end.setDate(end.getDate() + 6);
        return (
          <div key={k} style={{ marginBottom: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: C.text }}>Semaine du {dayLabel(k)} au {dayLabel(isoDay(end))}</div>
                <div style={{ fontSize: '11px', color: locked ? C.muted : C.amber }}>
                  {locked ? '🔒 Clôturée' : 'Clôture ' + dayLabel(isoDay(lock)).toLowerCase() + ' à 12 h'}{total ? ' · ' + fmtH(total) + ' validées' : ''}
                </div>
              </div>
              {todo.length > 1 && !locked && <button onClick={() => confirmAll(todo)} style={{ ...btn, background: C.green, borderColor: C.green, color: '#fff' }}>✓ Tout valider tel que prévu ({todo.length})</button>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {list.map(s => {
                const iso = String(s.work_date).slice(0, 10);
                const d = decls[s.id];
                const absent = absentOn(absences, iso);
                const ended = now >= new Date(shiftEnd(s).getTime() - 30 * 60000);
                const open = asManager || (!locked && ended);
                const st = d ? DECL_STATUS[d.status] : null;
                const editing = edit && edit.id === s.id;
                return (
                  <div key={s.id} style={{ background: C.card, border: '1px solid ' + C.border, borderLeft: '4px solid ' + (st ? st.color : absent ? C.border : ended && !locked ? C.amber : C.border), borderRadius: '8px', padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <div style={{ minWidth: '110px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: C.text }}>{dayLabel(iso)}</div>
                        <div style={{ fontSize: '11px', color: C.muted }}>prévu {hm(s.start_time)} – {hm(s.end_time)}{parseInt(s.break_minutes, 10) ? ' · pause ' + s.break_minutes + ' min' : ''}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: '150px' }}>
                        {d ? (
                          <>
                            <span style={{ background: st.bg, color: st.color, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>{st.label}</span>
                            {d.status !== 'non_travaille' && <span style={{ fontSize: '12px', color: C.text, marginLeft: '8px' }}>{hm(d.start_time)} – {hm(d.end_time)}{parseInt(d.break_minutes, 10) ? ' · pause ' + d.break_minutes + ' min' : ''}</span>}
                            {d.comment && d.status !== 'auto' && <div style={{ fontSize: '11px', color: C.muted, fontStyle: 'italic', marginTop: '2px' }}>« {d.comment} »</div>}
                            {d.by_manager && <div style={{ fontSize: '10px', color: C.muted, marginTop: '2px' }}>Corrigé par le responsable</div>}
                          </>
                        ) : absent ? <span style={{ fontSize: '11px', color: C.muted }}>Absence acceptée</span>
                          : !ended ? <span style={{ fontSize: '11px', color: C.muted }}>À valider en fin de créneau</span>
                          : locked ? <span style={{ fontSize: '11px', color: C.muted }}>Non validé</span>
                          : <span style={{ fontSize: '12px', fontWeight: 600, color: C.text }}>Avez-vous réalisé les horaires prévus ?</span>}
                      </div>
                      {!editing && open && !absent && (
                        d ? <button onClick={() => setEdit({ id: s.id, start: hm(d.start_time || s.start_time), end: hm(d.end_time || s.end_time), brk: String(d.status === 'non_travaille' ? s.break_minutes : d.break_minutes), comment: d.status === 'auto' ? '' : d.comment || '', off: d.status === 'non_travaille' })} style={{ ...btn, fontWeight: 500 }}>Modifier</button>
                          : (
                            <div style={{ display: 'flex', gap: mobile ? '10px' : '6px', width: mobile ? '100%' : 'auto' }}>
                              <button disabled={busy === s.id} onClick={() => declare(s, 'conforme')} style={{ ...btn, flex: mobile ? 1 : 'none', background: C.green, borderColor: C.green, color: '#fff' }}>{mobile ? '✓ Oui' : 'Oui'}</button>
                              <button disabled={busy === s.id} onClick={() => setEdit({ id: s.id, start: hm(s.start_time), end: hm(s.end_time), brk: String(s.break_minutes || 0), comment: '', off: false })} style={{ ...btn, flex: mobile ? 1 : 'none' }}>{mobile ? '✗ Non, corriger' : 'Non'}</button>
                            </div>
                          )
                      )}
                    </div>

                    {editing && (
                      <div style={{ marginTop: '10px', borderTop: '1px solid ' + C.border, paddingTop: '10px' }}>
                        <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12px', color: C.text, marginBottom: '8px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={edit.off} onChange={e => setEdit(x => ({ ...x, off: e.target.checked }))} style={{ accentColor: C.purple }} /> Je n'ai pas travaillé ce jour-là
                        </label>
                        {!edit.off && (
                          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                            <label style={{ fontSize: '10px', color: C.muted }}>ARRIVÉE<br /><input type="time" style={inp} value={edit.start} onChange={e => setEdit(x => ({ ...x, start: e.target.value }))} /></label>
                            <label style={{ fontSize: '10px', color: C.muted }}>DÉPART<br /><input type="time" style={inp} value={edit.end} onChange={e => setEdit(x => ({ ...x, end: e.target.value }))} /></label>
                            <label style={{ fontSize: '10px', color: C.muted }}>PAUSE (MIN)<br /><input type="number" min="0" step="5" style={{ ...inp, width: '80px' }} value={edit.brk} onChange={e => setEdit(x => ({ ...x, brk: e.target.value }))} /></label>
                            {edit.start && edit.end && <div style={{ fontSize: '11px', color: C.muted, alignSelf: 'flex-end', paddingBottom: '8px' }}>= {fmtH(netMin(edit.start, edit.end, edit.brk))} travaillées</div>}
                          </div>
                        )}
                        <input style={{ ...inp, width: '100%', marginBottom: '8px' }} placeholder="Commentaire pour votre responsable (facultatif)" value={edit.comment} onChange={e => setEdit(x => ({ ...x, comment: e.target.value }))} />
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button disabled={busy === s.id} onClick={() => saveEdit(s)} style={{ ...btn, background: C.purple, borderColor: C.purple, color: '#fff' }}>{busy === s.id ? '...' : 'Enregistrer'}</button>
                          <button onClick={() => setEdit(null)} style={{ ...btn, fontWeight: 500 }}>Annuler</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <button onClick={() => setWeeksBack(w => w + 2)} style={{ ...btn, fontWeight: 500, color: C.muted }}>Voir les semaines précédentes</button>
    </div>
  );
}
