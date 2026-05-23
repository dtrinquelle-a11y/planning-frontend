import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API = 'https://mon-planning-production.up.railway.app/api';

const C = {
  bg: '#0F1117', card: '#1A1D27', border: '#2A2D3A',
  text: '#E8E6DC', muted: '#6B6E82', purple: '#7C6FCD',
  green: '#2DB87A', amber: '#F5A623', red: '#E85D5D',
};

const SHIFTS = [
  { id: 'matin', label: 'Matin', bg: '#2A1F4A', border: '#7C6FCD', text: '#B8B0F0' },
  { id: 'apres_midi', label: 'Apres-midi', bg: '#1A3A2A', border: '#2DB87A', text: '#7DDBB0' },
  { id: 'journee', label: 'Journee', bg: '#3A2A10', border: '#F5A623', text: '#F5C870' },
  { id: 'soir', label: 'Soir', bg: '#3A1A1A', border: '#E85D5D', text: '#F0A0A0' },
  { id: 'custom', label: 'Personnalise', bg: '#1A2A3A', border: '#5B9BD5', text: '#90C0F0' },
];

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const months = ['jan', 'fev', 'mars', 'avr', 'mai', 'juin', 'juil', 'aout', 'sep', 'oct', 'nov', 'dec'];
const AVATAR_COLORS = ['#7C6FCD', '#2DB87A', '#F5A623', '#E85D5D', '#5B9BD5', '#F090D0'];

function fmtDate(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function getMonday(offset) {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) + offset * 7;
  const mon = new Date(now); mon.setDate(diff); mon.setHours(0, 0, 0, 0); return mon;
}
function initials(f, l) { return (f?.[0] || '') + (l?.[0] || ''); }

const inp = { width: '100%', background: '#0F1117', border: '1px solid #2A2D3A', borderRadius: '6px', padding: '8px 10px', color: '#E8E6DC', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' };
const lbl = { display: 'block', fontSize: '10px', color: '#6B6E82', letterSpacing: '0.08em', marginBottom: '4px' };

export default function EspaceSalarie() {
  const [employees, setEmployees] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [tab, setTab] = useState('planning');
  const [weekOffset, setWeekOffset] = useState(0);
  const [shifts, setShifts] = useState([]);
  const [modulation, setModulation] = useState(null);
  const [echanges] = useState([]);
  const [echangeModal, setEchangeModal] = useState(false);
  const [echangeForm, setEchangeForm] = useState({ shift_id: '', message: '' });
  const [toast, setToast] = useState('');

  const mon = getMonday(weekOffset);
  const endMon = addDays(mon, 6);
  const weekLabel = mon.getDate() + ' ' + months[mon.getMonth()] + ' -> ' + endMon.getDate() + ' ' + months[endMon.getMonth()];

  useEffect(() => {
    axios.get(API + '/employees').then(r => {
      setEmployees(r.data);
      if (r.data.length > 0) setSelectedEmp(r.data[0]);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedEmp) return;
    axios.get(API + '/schedules?week=' + fmtDate(mon)).then(r => {
      setShifts(r.data.filter(s => s.employee_id === selectedEmp.id));
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmp, weekOffset]);

  useEffect(() => {
    if (!selectedEmp) return;
    axios.get(API + '/timeclock/modulation/' + selectedEmp.id).then(r => setModulation(r.data)).catch(() => {});
  }, [selectedEmp]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  function getShiftForDay(dayIdx) {
    const date = fmtDate(addDays(mon, dayIdx));
    return shifts.find(s => s.work_date && s.work_date.slice(0, 10) === date);
  }

  function getNextShift() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) {
      const d = addDays(today, i);
      const date = fmtDate(d);
      const found = shifts.find(s => s.work_date && s.work_date.slice(0, 10) === date);
      if (found) return { shift: found, date: d, daysAway: i };
    }
    return null;
  }

  function calcHeuresWeek() {
    return shifts.reduce((total, s) => {
      if (!s.start_time || !s.end_time) return total;
      const [sh, sm] = s.start_time.slice(0, 5).split(':').map(Number);
      const [eh, em] = s.end_time.slice(0, 5).split(':').map(Number);
      return total + (eh * 60 + em - sh * 60 - sm) / 60;
    }, 0);
  }

  async function demanderEchange() {
    showToast('Demande d\'echange envoyee au manager');
    setEchangeModal(false);
    setEchangeForm({ shift_id: '', message: '' });
  }

  if (!selectedEmp) return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>
      <div style={{ color: C.muted, fontSize: '13px' }}>Chargement...</div>
    </div>
  );

  const nextShift = getNextShift();
  const heuresWeek = calcHeuresWeek();
  const empIdx = employees.findIndex(e => e.id === selectedEmp.id);
  const avatarColor = AVATAR_COLORS[empIdx % AVATAR_COLORS.length] || C.purple;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Mono','Courier New',monospace" }}>

      {/* Header */}
      <div style={{ background: C.card, borderBottom: '1px solid ' + C.border, padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600 }}><span style={{ color: C.purple }}>▸</span> MON PLANNING</div>
          <select style={{ ...inp, width: 'auto', fontSize: '12px', padding: '5px 10px' }}
            value={selectedEmp.id}
            onChange={e => {
              const emp = employees.find(em => em.id === e.target.value);
              setSelectedEmp(emp);
            }}>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
            ))}
          </select>
        </div>

        {/* Profil */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px', background: C.bg, borderRadius: '10px', marginBottom: '14px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: avatarColor + '22', border: '1px solid ' + avatarColor + '44', color: avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 600, flexShrink: 0 }}>
            {initials(selectedEmp.first_name, selectedEmp.last_name)}
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 600 }}>{selectedEmp.first_name} {selectedEmp.last_name}</div>
            <div style={{ fontSize: '11px', color: C.muted }}>{selectedEmp.role} · {selectedEmp.service}</div>
            <div style={{ fontSize: '10px', color: C.muted }}>{selectedEmp.contract_hours}h / semaine · {selectedEmp.contract_type}</div>
          </div>
        </div>

        {/* Prochain creneau */}
        {nextShift && (
          <div style={{ background: C.green + '11', border: '1px solid ' + C.green + '44', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontSize: '20px', color: C.green }}>→</div>
            <div>
              <div style={{ fontSize: '10px', color: C.green, letterSpacing: '0.08em', marginBottom: '2px' }}>
                {nextShift.daysAway === 0 ? "AUJOURD'HUI" : nextShift.daysAway === 1 ? 'DEMAIN' : 'DANS ' + nextShift.daysAway + ' JOURS'}
              </div>
              <div style={{ fontSize: '13px', fontWeight: 500, color: C.text }}>
                {SHIFTS.find(s => s.id === nextShift.shift.shift_type)?.label || 'Creneau'} · {nextShift.shift.start_time?.slice(0, 5)} – {nextShift.shift.end_time?.slice(0, 5)}
              </div>
              <div style={{ fontSize: '10px', color: C.muted }}>{nextShift.date.getDate()} {months[nextShift.date.getMonth()]}</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0', marginTop: '14px', borderBottom: '1px solid ' + C.border }}>
          {[
            { id: 'planning', label: 'Planning' },
            { id: 'heures', label: 'Mes heures' },
            { id: 'echanges', label: 'Echanges' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: '8px 16px', background: 'none', border: 'none', borderBottom: '2px solid ' + (tab === t.id ? C.purple : 'transparent'), color: tab === t.id ? C.purple : C.muted, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit', letterSpacing: '0.06em', fontWeight: tab === t.id ? 600 : 400 }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenu */}
      <div style={{ padding: '16px 20px', maxWidth: '700px', margin: '0 auto' }}>

        {/* TAB PLANNING */}
        {tab === 'planning' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <button onClick={() => setWeekOffset(w => w - 1)} style={{ background: 'none', border: '1px solid ' + C.border, borderRadius: '6px', color: C.text, cursor: 'pointer', padding: '4px 10px', fontFamily: 'inherit' }}>{'<'}</button>
              <span style={{ fontSize: '12px', color: C.muted }}>{weekLabel}</span>
              <button onClick={() => setWeekOffset(w => w + 1)} style={{ background: 'none', border: '1px solid ' + C.border, borderRadius: '6px', color: C.text, cursor: 'pointer', padding: '4px 10px', fontFamily: 'inherit' }}>{'>'}</button>
            </div>

            <div style={{ fontSize: '11px', color: C.muted, marginBottom: '8px' }}>
              {heuresWeek.toFixed(1)}h planifiees cette semaine
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {DAYS.map((d, di) => {
                const day = addDays(mon, di);
                const shift = getShiftForDay(di);
                const shDef = shift ? SHIFTS.find(s => s.id === shift.shift_type) : null;
                const isToday = fmtDate(day) === fmtDate(new Date());
                return (
                  <div key={di} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: isToday ? C.purple + '11' : C.card, border: '1px solid ' + (isToday ? C.purple + '44' : C.border), borderRadius: '8px' }}>
                    <div style={{ minWidth: '70px' }}>
                      <div style={{ fontSize: '11px', color: isToday ? C.purple : C.muted }}>{d}</div>
                      <div style={{ fontSize: '16px', fontWeight: 600, color: isToday ? C.purple : C.text }}>{day.getDate()}</div>
                    </div>
                    {shift && shDef ? (
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '20px', background: shDef.bg, border: '1px solid ' + shDef.border, color: shDef.text, fontSize: '11px', fontWeight: 500, marginBottom: '3px' }}>
                          {shDef.label}
                        </div>
                        <div style={{ fontSize: '12px', color: C.text }}>{shift.start_time?.slice(0, 5)} – {shift.end_time?.slice(0, 5)}</div>
                        {shift.is_published && (
                          <div style={{ fontSize: '10px', color: C.green, marginTop: '2px' }}>Publie</div>
                        )}
                      </div>
                    ) : (
                      <div style={{ flex: 1, fontSize: '12px', color: C.border }}>Repos</div>
                    )}
                    {shift && (
                      <button onClick={() => { setEchangeForm(f => ({ ...f, shift_id: shift.id })); setEchangeModal(true); }}
                        style={{ background: 'none', border: '1px solid ' + C.border, borderRadius: '6px', padding: '4px 10px', color: C.muted, cursor: 'pointer', fontSize: '10px', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                        Echanger
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB HEURES */}
        {tab === 'heures' && (
          <div>
            <div style={{ fontSize: '11px', color: C.muted, letterSpacing: '0.08em', marginBottom: '14px' }}>MODULATION ANNUELLE · CC HPA</div>

            {modulation ? (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                  {[
                    { label: 'Heures pointees', val: modulation.heures_travaillees + 'h', color: C.purple },
                    { label: 'Seuil legal', val: modulation.seuil_legal + 'h', color: C.text },
                    { label: 'Heures restantes', val: modulation.heures_restantes + 'h', color: parseFloat(modulation.heures_restantes) < 200 ? C.amber : C.green },
                    { label: 'Statut', val: modulation.statut === 'normal' ? 'Normal' : modulation.statut === 'majoration_25' ? 'Maj. 25%' : 'Maj. 50%', color: modulation.statut === 'normal' ? C.green : modulation.statut === 'majoration_25' ? C.amber : C.red },
                  ].map((item, i) => (
                    <div key={i} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '8px', padding: '12px 14px' }}>
                      <div style={{ fontSize: '10px', color: C.muted, marginBottom: '4px' }}>{item.label}</div>
                      <div style={{ fontSize: '20px', fontWeight: 600, color: item.color }}>{item.val}</div>
                    </div>
                  ))}
                </div>

                {/* Barre de progression */}
                <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '8px', padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: C.muted, marginBottom: '8px' }}>
                    <span>0h</span>
                    <span>1607h (seuil)</span>
                    <span>1790h</span>
                  </div>
                  <div style={{ height: '8px', background: C.border, borderRadius: '4px', overflow: 'hidden', marginBottom: '6px' }}>
                    <div style={{ height: '8px', width: Math.min((parseFloat(modulation.heures_travaillees) / 1790) * 100, 100) + '%', background: modulation.statut === 'normal' ? C.green : modulation.statut === 'majoration_25' ? C.amber : C.red, borderRadius: '4px', transition: 'width 0.6s ease' }} />
                  </div>
                  <div style={{ fontSize: '11px', color: C.muted }}>
                    Periode : {modulation.period_start?.slice(0, 10)} → {modulation.period_end?.slice(0, 10)}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: C.muted, fontSize: '12px', textAlign: 'center', padding: '40px' }}>Aucune donnee de modulation</div>
            )}

            <div style={{ marginTop: '14px', background: C.card, border: '1px solid ' + C.border, borderRadius: '8px', padding: '14px' }}>
              <div style={{ fontSize: '11px', color: C.muted, marginBottom: '10px', letterSpacing: '0.08em' }}>CETTE SEMAINE</div>
              <div style={{ fontSize: '24px', fontWeight: 600, color: C.purple }}>{heuresWeek.toFixed(1)}h</div>
              <div style={{ fontSize: '11px', color: C.muted, marginTop: '4px' }}>planifiees sur {shifts.length} creneau(x)</div>
            </div>
          </div>
        )}

        {/* TAB ECHANGES */}
        {tab === 'echanges' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ fontSize: '11px', color: C.muted, letterSpacing: '0.08em' }}>MES DEMANDES D'ECHANGE</div>
              <button onClick={() => setEchangeModal(true)}
                style={{ background: C.purple, border: 'none', borderRadius: '6px', padding: '6px 12px', color: '#fff', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit', fontWeight: 600 }}>
                + Nouvelle demande
              </button>
            </div>

            {echanges.length === 0 ? (
              <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '8px', padding: '30px', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: C.muted, marginBottom: '8px' }}>Aucune demande d'echange en cours</div>
                <div style={{ fontSize: '11px', color: C.border }}>Clique sur un creneau → "Echanger" ou sur "+ Nouvelle demande"</div>
              </div>
            ) : echanges.map((e, i) => (
              <div key={i} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '8px', padding: '12px 14px', marginBottom: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: 500 }}>{e.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal echange */}
      {echangeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }} onClick={() => setEchangeModal(false)}>
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '320px' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '14px' }}>Demande d'echange</div>

            <div style={{ marginBottom: '10px' }}>
              <label style={lbl}>CRENEAU A ECHANGER</label>
              <select style={inp} value={echangeForm.shift_id} onChange={e => setEchangeForm(f => ({ ...f, shift_id: e.target.value }))}>
                <option value="">-- Choisir un creneau --</option>
                {shifts.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.work_date?.slice(0, 10)} · {s.start_time?.slice(0, 5)}-{s.end_time?.slice(0, 5)}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={lbl}>MESSAGE AU MANAGER</label>
              <textarea style={{ ...inp, height: '80px', resize: 'vertical' }}
                placeholder="Ex: Je ne peux pas travailler ce jour-la..."
                value={echangeForm.message}
                onChange={e => setEchangeForm(f => ({ ...f, message: e.target.value }))} />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setEchangeModal(false)} style={{ flex: 1, background: 'none', border: '1px solid ' + C.border, borderRadius: '6px', padding: '8px', color: C.muted, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>Annuler</button>
              <button onClick={demanderEchange} style={{ flex: 1, background: C.purple, border: 'none', borderRadius: '6px', padding: '8px', color: '#fff', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600 }}>Envoyer</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: C.card, border: '1px solid ' + C.green, borderRadius: '8px', padding: '10px 16px', fontSize: '12px', color: C.green, zIndex: 200 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
