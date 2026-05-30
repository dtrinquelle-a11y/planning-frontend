import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API = 'https://mon-planning-production.up.railway.app/api';

const C = {
  bg: '#0F1117', card: '#1A1D27', border: '#2A2D3A',
  text: '#E8E6DC', muted: '#6B6E82', purple: '#7C6FCD',
  green: '#2DB87A', amber: '#F5A623', red: '#E85D5D',
};

const SERVICES = ['Tous', 'Accueil', 'Housekeeping', 'Technique', 'Restauration'];

const SERVICE_COLORS = {
  'Accueil': '#7C6FCD',
  'Housekeeping': '#2DB87A',
  'Technique': '#F5A623',
  'Restauration': '#E85D5D',
};

const AVATAR_COLORS = ['#7C6FCD', '#2DB87A', '#F5A623', '#E85D5D', '#5B9BD5', '#F090D0', '#C084FC', '#34D399'];

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const months = ['jan','fev','mars','avr','mai','juin','juil','aout','sep','oct','nov','dec'];

const HOURS = Array.from({ length: 20 }, (_, i) => i + 5); // 5h à 00h

function getMonday(offset) {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) + offset * 7;
  const mon = new Date(now); mon.setDate(diff); mon.setHours(0,0,0,0); return mon;
}

function fmtDate(d) {
  const p = n => String(n).padStart(2,'0');
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
}

function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate()+n); return r; }

function initials(f, l) { return (f?.[0]||'')+(l?.[0]||''); }

function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.slice(0,5).split(':').map(Number);
  return h * 60 + m;
}

function isPresent(shift, hour) {
  const start = timeToMinutes(shift.start_time);
  const end = timeToMinutes(shift.end_time);
  const hMin = hour * 60;
  const hMax = hour * 60 + 59;
  return start <= hMax && end > hMin;
}

function getPresentPercent(shift, hour) {
  const start = timeToMinutes(shift.start_time);
  const end = timeToMinutes(shift.end_time);
  const hStart = hour * 60;
  const hEnd = hour * 60 + 60;
  const overlapStart = Math.max(start, hStart);
  const overlapEnd = Math.min(end, hEnd);
  if (overlapEnd <= overlapStart) return 0;
  return (overlapEnd - overlapStart) / 60;
}

export default function Timeline() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [service, setService] = useState('Tous');
  const [view, setView] = useState('semaine');
  const [selectedDay, setSelectedDay] = useState(0);
  const [schedules, setSchedules] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hoveredEmp, setHoveredEmp] = useState(null);

  const mon = getMonday(weekOffset);
  const endMon = addDays(mon, 6);
  const weekLabel = mon.getDate() + ' ' + months[mon.getMonth()] + ' → ' + endMon.getDate() + ' ' + months[endMon.getMonth()] + ' ' + endMon.getFullYear();

  useEffect(() => {
    setLoading(true);
    Promise.all([
      axios.get(API + '/employees'),
      axios.get(API + '/schedules?week=' + fmtDate(mon)),
    ]).then(([empRes, schedRes]) => {
      setEmployees(empRes.data);
      setSchedules(schedRes.data);
    }).catch(() => {}).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  const filteredEmployees = service === 'Tous'
    ? employees
    : employees.filter(e => e.service === service);

  const filteredEmpIds = new Set(filteredEmployees.map(e => e.id || e.employee_id));

  const filteredSchedules = schedules.filter(s =>
    filteredEmpIds.has(s.employee_id)
  );

  function getShiftsForDay(dayIdx) {
    const date = fmtDate(addDays(mon, dayIdx));
    return filteredSchedules.filter(s => s.work_date && s.work_date.slice(0,10) === date);
  }

  function getEmpColor(empId) {
    const idx = employees.findIndex(e => e.id === empId || e.employee_id === empId);
    return AVATAR_COLORS[idx % AVATAR_COLORS.length];
  }

  function getServiceColor(empId) {
    const emp = employees.find(e => e.id === empId);
    return emp ? SERVICE_COLORS[emp.service] || C.purple : C.purple;
  }

  function getEmpService(empId) {
    const emp = employees.find(e => e.id === empId);
    return emp?.service || '';
  }

  function countPresentAtHour(dayIdx, hour) {
    return getShiftsForDay(dayIdx).filter(s => isPresent(s, hour)).length;
  }

  // Vue journée — timeline détaillée
  function DayView({ dayIdx }) {
    const dayShifts = getShiftsForDay(dayIdx);
    const day = addDays(mon, dayIdx);
    const isToday = fmtDate(day) === fmtDate(new Date());

    const activeHours = HOURS.filter(h => dayShifts.some(s => isPresent(s, h)));
    const minHour = activeHours.length > 0 ? Math.max(5, activeHours[0] - 1) : 6;
    const maxHour = activeHours.length > 0 ? Math.min(24, activeHours[activeHours.length-1] + 2) : 23;
    const displayHours = HOURS.filter(h => h >= minHour && h <= maxHour);

    return (
      <div style={{ background: C.card, border: '1px solid ' + (isToday ? C.purple + '66' : C.border), borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid ' + C.border, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: isToday ? C.purple + '11' : 'transparent' }}>
          <div>
            <span style={{ fontSize: '11px', color: isToday ? C.purple : C.muted }}>{DAYS[dayIdx]}</span>
            <span style={{ fontSize: '18px', fontWeight: 600, color: isToday ? C.purple : C.text, marginLeft: '8px' }}>{day.getDate()} {months[day.getMonth()]}</span>
          </div>
          <div style={{ fontSize: '11px', color: C.muted }}>
            {dayShifts.length} salarie(s) · max {Math.max(0, ...displayHours.map(h => countPresentAtHour(dayIdx, h)))} en simultane
          </div>
        </div>

        {dayShifts.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: C.border, fontSize: '12px' }}>Aucun creneau ce jour</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: '600px' }}>
              {/* Ligne des heures */}
              <div style={{ display: 'grid', gridTemplateColumns: '140px repeat(' + displayHours.length + ', 1fr)', borderBottom: '1px solid ' + C.border }}>
                <div style={{ padding: '6px 10px', fontSize: '10px', color: C.muted }}>Salarie</div>
                {displayHours.map(h => (
                  <div key={h} style={{ padding: '6px 2px', textAlign: 'center', fontSize: '10px', color: C.muted, borderLeft: '1px solid ' + C.border + '44' }}>
                    {String(h).padStart(2,'0')}h
                  </div>
                ))}
              </div>

              {/* Ligne de comptage */}
              <div style={{ display: 'grid', gridTemplateColumns: '140px repeat(' + displayHours.length + ', 1fr)', borderBottom: '1px solid ' + C.border, background: C.bg }}>
                <div style={{ padding: '5px 10px', fontSize: '10px', color: C.muted, display: 'flex', alignItems: 'center' }}>Presents</div>
                {displayHours.map(h => {
                  const count = countPresentAtHour(dayIdx, h);
                  const maxCount = Math.max(1, ...displayHours.map(hh => countPresentAtHour(dayIdx, hh)));
                  const pct = count / maxCount;
                  return (
                    <div key={h} style={{ padding: '3px 2px', borderLeft: '1px solid ' + C.border + '44', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                      <div style={{ width: '100%', height: '20px', background: C.border, borderRadius: '3px', overflow: 'hidden', position: 'relative' }}>
                        <div style={{ position: 'absolute', bottom: 0, width: '100%', height: (pct * 100) + '%', background: count > 0 ? C.green : 'transparent', borderRadius: '3px', transition: 'height .3s' }} />
                      </div>
                      {count > 0 && <span style={{ fontSize: '9px', color: C.green, fontWeight: 600 }}>{count}</span>}
                    </div>
                  );
                })}
              </div>

              {/* Ligne par salarié */}
              {dayShifts.map((shift, i) => {
                const color = service === 'Tous' ? getServiceColor(shift.employee_id) : getEmpColor(shift.employee_id);
                const name = (shift.first_name || '') + ' ' + (shift.last_name || '');
                const svc = getEmpService(shift.employee_id);
                return (
                  <div key={i}
                    style={{ display: 'grid', gridTemplateColumns: '140px repeat(' + displayHours.length + ', 1fr)', borderBottom: '1px solid ' + C.border + '44', background: hoveredEmp === shift.employee_id ? color + '11' : 'transparent', transition: 'background .15s' }}
                    onMouseEnter={() => setHoveredEmp(shift.employee_id)}
                    onMouseLeave={() => setHoveredEmp(null)}
                  >
                    <div style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: color + '22', border: '1px solid ' + color + '44', color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 700, flexShrink: 0 }}>
                        {initials(shift.first_name, shift.last_name)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '11px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                        {service === 'Tous' && <div style={{ fontSize: '9px', color: color }}>{svc}</div>}
                        {shift.note && <div style={{ fontSize: '9px', color: C.muted, fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shift.note}</div>}
                      </div>
                    </div>
                    {displayHours.map(h => {
                      const pct = getPresentPercent(shift, h);
                      return (
                        <div key={h} style={{ borderLeft: '1px solid ' + C.border + '33', position: 'relative', minHeight: '34px' }}>
                          {pct > 0 && (
                            <div style={{
                              position: 'absolute', top: '4px', bottom: '4px',
                              left: pct < 1 && timeToMinutes(shift.start_time) > h * 60 ? (((timeToMinutes(shift.start_time) - h*60)/60)*100)+'%' : '2px',
                              right: pct < 1 && timeToMinutes(shift.end_time) < (h+1)*60 ? (((h+1)*60 - timeToMinutes(shift.end_time))/60*100)+'%' : '2px',
                              background: color,
                              borderRadius: '3px',
                              opacity: 0.85,
                            }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Vue semaine — grille compacte avec compteurs
  function WeekView() {
    return (
      <div style={{ border: '1px solid ' + C.border, borderRadius: '10px', overflow: 'hidden' }}>
        {/* Header heures */}
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: '700px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '80px repeat(20, 1fr)', background: C.card, borderBottom: '1px solid ' + C.border }}>
              <div style={{ padding: '8px 6px', fontSize: '10px', color: C.muted }}>Jour</div>
              {HOURS.map(h => (
                <div key={h} style={{ padding: '8px 2px', textAlign: 'center', fontSize: '9px', color: C.muted, borderLeft: '1px solid ' + C.border + '33' }}>
                  {String(h).padStart(2,'0')}h
                </div>
              ))}
            </div>

            {DAYS.map((d, di) => {
              const day = addDays(mon, di);
              const isToday = fmtDate(day) === fmtDate(new Date());
              const dayShifts = getShiftsForDay(di);

              return (
                <div key={di} style={{ borderBottom: di < 6 ? '1px solid ' + C.border : 'none' }}>
                  {/* Ligne compteur */}
                  <div style={{ display: 'grid', gridTemplateColumns: '80px repeat(20, 1fr)', background: isToday ? C.purple + '08' : 'transparent' }}>
                    <div style={{ padding: '6px', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderRight: '1px solid ' + C.border }}>
                      <div style={{ fontSize: '11px', color: isToday ? C.purple : C.muted, fontWeight: 500 }}>{d}</div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: isToday ? C.purple : C.text }}>{day.getDate()}</div>
                      <div style={{ fontSize: '9px', color: C.muted }}>{dayShifts.length}p</div>
                    </div>
                    {HOURS.map(h => {
                      const presents = dayShifts.filter(s => isPresent(s, h));
                      const maxPresents = Math.max(1, ...HOURS.map(hh => getShiftsForDay(di).filter(s => isPresent(s, hh)).length));
                      return (
                        <div key={h} style={{ borderLeft: '1px solid ' + C.border + '22', padding: '2px', position: 'relative', minHeight: '44px' }}>
                          {presents.length > 0 && (
                            <>
                              <div style={{ width: '100%', height: '4px', background: C.border, borderRadius: '2px', marginBottom: '2px', overflow: 'hidden' }}>
                                <div style={{ height: '4px', width: (presents.length / maxPresents * 100) + '%', background: C.green, borderRadius: '2px' }} />
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1px' }}>
                                {presents.slice(0, 4).map((s, i) => {
                                  const color = service === 'Tous' ? getServiceColor(s.employee_id) : getEmpColor(s.employee_id);
                                  return (
                                    <div key={i} title={(s.first_name||'') + ' ' + (s.last_name||'')}
                                      style={{ width: '14px', height: '14px', borderRadius: '50%', background: color + '33', border: '1px solid ' + color + '66', color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', fontWeight: 700 }}>
                                      {(s.first_name||'?')[0]}
                                    </div>
                                  );
                                })}
                                {presents.length > 4 && (
                                  <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: C.border, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', fontWeight: 700 }}>
                                    +{presents.length - 4}
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Mono','Courier New',monospace" }}>

      {/* Header */}
      <div style={{ background: C.card, borderBottom: '1px solid ' + C.border, padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: C.muted, marginRight: '4px' }}>SERVICE</span>
          {SERVICES.map(sv => (
            <button key={sv} onClick={() => setService(sv)}
              style={{ padding: '4px 12px', borderRadius: '20px', border: '1px solid ' + (service === sv ? (SERVICE_COLORS[sv] || C.purple) : C.border), background: service === sv ? (SERVICE_COLORS[sv] || C.purple) + '22' : 'none', color: service === sv ? (SERVICE_COLORS[sv] || C.purple) : C.muted, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }}>
              {sv}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => setWeekOffset(w => w-1)} style={{ background: 'none', border: '1px solid ' + C.border, borderRadius: '6px', color: C.text, cursor: 'pointer', padding: '4px 10px', fontFamily: 'inherit' }}>{'<'}</button>
          <span style={{ fontSize: '12px', minWidth: '180px', textAlign: 'center' }}>{weekLabel}</span>
          <button onClick={() => setWeekOffset(w => w+1)} style={{ background: 'none', border: '1px solid ' + C.border, borderRadius: '6px', color: C.text, cursor: 'pointer', padding: '4px 10px', fontFamily: 'inherit' }}>{'>'}</button>
          <button onClick={() => setWeekOffset(0)} style={{ background: 'none', border: '1px solid ' + C.border, borderRadius: '6px', color: C.muted, cursor: 'pointer', padding: '4px 8px', fontSize: '11px', fontFamily: 'inherit' }}>Auj.</button>
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setView('semaine')}
            style={{ padding: '5px 14px', borderRadius: '6px', border: '1px solid ' + (view === 'semaine' ? C.purple : C.border), background: view === 'semaine' ? C.purple + '22' : 'none', color: view === 'semaine' ? C.purple : C.muted, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }}>
            Semaine
          </button>
          <button onClick={() => setView('jour')}
            style={{ padding: '5px 14px', borderRadius: '6px', border: '1px solid ' + (view === 'jour' ? C.purple : C.border), background: view === 'jour' ? C.purple + '22' : 'none', color: view === 'jour' ? C.purple : C.muted, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }}>
            Jour
          </button>
        </div>
      </div>

      <div style={{ padding: '20px 24px' }}>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: C.muted, fontSize: '13px' }}>Chargement...</div>
        ) : view === 'semaine' ? (
          <WeekView />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Sélecteur jour */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {DAYS.map((d, di) => {
                const day = addDays(mon, di);
                const isToday = fmtDate(day) === fmtDate(new Date());
                const count = getShiftsForDay(di).length;
                return (
                  <button key={di} onClick={() => setSelectedDay(di)}
                    style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid ' + (selectedDay === di ? C.purple : isToday ? C.purple + '44' : C.border), background: selectedDay === di ? C.purple + '22' : isToday ? C.purple + '11' : 'none', color: selectedDay === di ? C.purple : isToday ? C.purple : C.muted, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }}>
                    {d} {day.getDate()}
                    {count > 0 && <span style={{ marginLeft: '5px', fontSize: '9px', background: C.purple + '33', padding: '1px 5px', borderRadius: '10px' }}>{count}</span>}
                  </button>
                );
              })}
            </div>
            <DayView dayIdx={selectedDay} />
          </div>
        )}

        {/* Légende services */}
        {service === 'Tous' && (
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '16px' }}>
            {Object.entries(SERVICE_COLORS).map(([svc, color]) => (
              <div key={svc} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: C.muted }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: color }} />
                {svc}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
