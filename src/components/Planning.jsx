import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useTheme } from '../ThemeContext';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import supabase from '../supabase';

const API = 'https://mon-planning-production.up.railway.app/api';
const SERVICES = ['Accueil', 'Housekeeping', 'Technique', 'Restauration', 'Animation', 'Managers'];
const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const SHIFTS = [
  { id: 'matin', label: 'Matin', start: '07:00', end: '13:00', bg: '#EEF2FF', border: '#7C6FCD', text: '#4338CA' },
  { id: 'apres_midi', label: 'Apres-midi', start: '13:00', end: '19:00', bg: '#F0FDF4', border: '#2DB87A', text: '#166534' },
  { id: 'journee', label: 'Journee', start: '09:00', end: '17:00', bg: '#FFFBEB', border: '#F5A623', text: '#92400E' },
  { id: 'soir', label: 'Soir', start: '18:00', end: '23:30', bg: '#FEF2F2', border: '#E85D5D', text: '#991B1B' },
  { id: 'custom', label: 'Personalise', start: '08:00', end: '16:00', bg: '#EFF6FF', border: '#3B82F6', text: '#1E40AF' },
  { id: 'off', label: 'OFF', start: '00:00', end: '00:00', bg: '#F1F5F9', border: '#94A3B8', text: '#475569' },
  { id: 'repos', label: 'Repos', start: '00:00', end: '00:00', bg: '#F3F4F6', border: '#9CA3AF', text: '#6B7280' },
];
const AVATAR_COLORS = ['#7C6FCD','#2DB87A','#F5A623','#E85D5D','#5B9BD5','#F090D0'];

function initials(f, l) { return (f?.[0]||'')+(l?.[0]||''); }
function getMonday(offset) {
  const now = new Date(); const day = now.getDay();
  const diff = now.getDate()-day+(day===0?-6:1)+offset*7;
  const mon = new Date(now); mon.setDate(diff); mon.setHours(0,0,0,0); return mon;
}
function fmtDate(d) { const p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }
function addDays(d, n) { const r=new Date(d); r.setDate(r.getDate()+n); return r; }
const months = ['jan','fev','mars','avr','mai','juin','juil','aout','sep','oct','nov','dec'];
const monthsFull = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Aout','Septembre','Octobre','Novembre','Decembre'];

// Pause legale CC HPA
function calcPauseHPA(totalMinutes) {
  if (totalMinutes >= 540) return 45; // > 9h
  if (totalMinutes >= 360) return 30; // > 6h
  return 0;
}
function calcShiftH(s) {
  if (!s || !s.start_time || !s.end_time) return 0;
  const [sh,sm] = s.start_time.slice(11,16).split(':').map(Number);
  const [eh,em] = s.end_time.slice(11,16).split(':').map(Number);
  let total = (eh*60+em)-(sh*60+sm);
  if (total < 0) total += 24*60;
  const pause = s.break_minutes ?? calcPauseHPA(total);
  return Math.max(0, (total - pause) / 60);
}
function calcHeuresEmp(shifts) { return shifts.reduce((a,s) => a + calcShiftH(s), 0); }

export default function Planning({ profile }) {
  const { colors: C } = useTheme();
  const [weekOffset, setWeekOffset] = useState(0);
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [modal, setModal] = useState(null);
  const [selEmp, setSelEmp] = useState('');
  const [selShift, setSelShift] = useState('matin');
  const [selDay, setSelDay] = useState(0);
  const [customStart, setCustomStart] = useState('08:00');
  const [customEnd, setCustomEnd] = useState('16:00');
  const [note, setNote] = useState('');
  const [activeService, setActiveService] = useState('Accueil');
  const [monthlySummary, setMonthlySummary] = useState({});
  const [toast, setToast] = useState(null);
  const [copyModal, setCopyModal] = useState(false);
  const [copyTargetOffset, setCopyTargetOffset] = useState(weekOffset+1);
  const [copyEmpId, setCopyEmpId] = useState('');
  const planningRef = useRef(null);
  // Nouvelles features
  const [viewMode, setViewMode] = useState('salarie-ligne'); // 'salarie-ligne' | 'salarie-colonne'
  const [empOrder, setEmpOrder] = useState({}); // { serviceKey: [empId, ...] }
  const [showAddMember, setShowAddMember] = useState(false);
  const [sectorMembers, setSectorMembers] = useState({}); // { service: [empId,...] }
  const [checkedEmps, setCheckedEmps] = useState([]);
  const [dragSrc, setDragSrc] = useState(null); // {shiftId, empId, dayIdx}
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const monday = getMonday(weekOffset);
  const weekDates = DAYS.map((_,i) => addDays(monday, i));
  const isAdmin = profile?.role === 'admin' || profile?.role === 'manager';

  const showToast = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  // Charger employes
  const loadEmployees = useCallback(async () => {
    try { const r = await axios.get(API+'/employees'); setEmployees(r.data); } catch(e) {}
  }, []);

  // Charger shifts de la semaine
  const loadShifts = useCallback(async () => {
    try { const r = await axios.get(API+'/schedules?week='+fmtDate(monday)); setShifts(r.data); } catch(e) {}
  }, [weekOffset]);

  // Charger resume mensuel
  const loadMonthlySummary = useCallback(async () => {
    const m = monday.getFullYear()+'-'+String(monday.getMonth()+1).padStart(2,'0');
    try { const r = await axios.get(API+'/schedules/monthly-summary?month='+m); setMonthlySummary(r.data); } catch(e) {}
  }, [weekOffset]);

  // Charger preferences depuis Supabase (ordre + membres secteurs)
  const loadPrefs = useCallback(async () => {
    try {
      const { data: orderData } = await supabase.from('planning_preferences').select('*');
      if (orderData && orderData.length > 0) {
        const orders = {};
        orderData.forEach(row => { orders[row.service] = row.emp_order; });
        setEmpOrder(orders);
      }
      const { data: membersData } = await supabase.from('planning_sector_members').select('*');
      if (membersData && membersData.length > 0) {
        const members = {};
        membersData.forEach(row => {
          if (!members[row.service]) members[row.service] = [];
          members[row.service].push(row.employee_id);
        });
        setSectorMembers(members);
      }
    } catch(e) {} finally { setPrefsLoaded(true); }
  }, []);

  useEffect(() => { loadEmployees(); loadPrefs(); }, []);
  useEffect(() => { loadShifts(); loadMonthlySummary(); }, [weekOffset]);

  // Sauvegarder ordre dans Supabase
  const saveOrder = async (service, newOrder) => {
    try {
      await supabase.from('planning_preferences').upsert(
        { service, emp_order: newOrder },
        { onConflict: 'service' }
      );
      setEmpOrder(prev => ({...prev, [service]: newOrder}));
    } catch(e) {}
  };

  // Sauvegarder membres secteur dans Supabase
  const saveSectorMembers = async (service, empIds) => {
    try {
      await supabase.from('planning_sector_members').delete().eq('service', service);
      if (empIds.length > 0) {
        await supabase.from('planning_sector_members').insert(
          empIds.map(id => ({ service, employee_id: id }))
        );
      }
      setSectorMembers(prev => ({...prev, [service]: empIds}));
    } catch(e) {}
  };

  // Employes filtres par service avec ordre personnalise
  const filtered = employees.filter(e => e.is_active !== false && (
    e.service === activeService ||
    (e.services_secondaires && e.services_secondaires.includes(activeService))
  ));

  // Appliquer ordre personnalise + membres supplementaires
  const getSortedEmployees = () => {
    const members = sectorMembers[activeService] || [];
    const baseEmps = employees.filter(e => e.is_active !== false && (
      e.service === activeService ||
      (e.services_secondaires && e.services_secondaires.includes(activeService)) ||
      members.includes(e.id)
    ));
    const order = empOrder[activeService];
    if (!order || order.length === 0) return baseEmps;
    const ordered = [];
    order.forEach(id => { const e = baseEmps.find(x => x.id === id); if (e) ordered.push(e); });
    baseEmps.forEach(e => { if (!order.includes(e.id)) ordered.push(e); });
    return ordered;
  };
  const sortedEmps = getSortedEmployees();

  // CRUD shifts
  const createShift = async () => {
    if (!selEmp) return;
    const shift = SHIFTS.find(s => s.id === selShift);
    const dateStr = fmtDate(weekDates[selDay]);
    const startDt = dateStr+'T'+(selShift==='custom'?customStart:shift.start)+':00';
    const endDt = dateStr+'T'+(selShift==='custom'?customEnd:shift.end)+':00';
    // Pour OFF/repos: pas d'heures significatives
    const isOff = selShift === 'off' || selShift === 'repos';
    try {
      await axios.post(API+'/schedules', {
        employee_id: selEmp, work_date: dateStr,
        start_time: isOff ? dateStr+'T00:00:00' : startDt,
        end_time: isOff ? dateStr+'T00:00:00' : endDt,
        shift_type: selShift, break_minutes: isOff ? 0 : undefined, note
      });
      await loadShifts(); await loadMonthlySummary();
      setModal(null); setNote(''); showToast('Creneau cree');
    } catch(e) { showToast('Erreur creation','error'); }
  };

  const deleteShift = async (id) => {
    try {
      await axios.delete ? await axios.delete(API+'/schedules/'+id) : await axios.patch(API+'/schedules/'+id,{shift_type:'deleted'});
      await loadShifts(); await loadMonthlySummary(); showToast('Creneau supprime');
    } catch(e) {
      try { await axios.patch(API+'/schedules/'+id,{note:'__deleted__'}); await loadShifts(); } catch(e2) {}
    }
  };

  const handleDeleteShift = async (id) => {
    if (!window.confirm('Supprimer ce creneau ?')) return;
    try {
      await axios.delete(API+'/schedules/'+id);
      await loadShifts(); await loadMonthlySummary(); showToast('Creneau supprime');
    } catch(e) { showToast('Erreur suppression','error'); }
  };

  // Dupliquer semaine
  const copyWeek = async () => {
    const srcMonday = fmtDate(getMonday(weekOffset));
    const tgtMonday = getMonday(copyTargetOffset);
    const srcShifts = shifts.filter(s => {
      if (copyEmpId) return String(s.employee_id) === String(copyEmpId);
      return true;
    });
    let ok = 0;
    for (const s of srcShifts) {
      const srcDate = new Date(s.work_date);
      const srcMon = new Date(srcMonday);
      const dayDiff = Math.round((srcDate - srcMon) / (1000*60*60*24));
      const tgtDate = fmtDate(addDays(tgtMonday, dayDiff));
      const isOff = s.shift_type === 'off' || s.shift_type === 'repos';
      try {
        await axios.post(API+'/schedules', {
          employee_id: s.employee_id,
          work_date: tgtDate,
          start_time: isOff ? tgtDate+'T00:00:00' : tgtDate+'T'+s.start_time.slice(11,16)+':00',
          end_time: isOff ? tgtDate+'T00:00:00' : tgtDate+'T'+s.end_time.slice(11,16)+':00',
          shift_type: s.shift_type,
          break_minutes: s.break_minutes,
          note: s.note
        });
        ok++;
      } catch(e) {}
    }
    setCopyModal(false);
    await loadShifts();
    showToast(ok+' creneaux copies vers semaine '+copyTargetOffset);
  };

  // Drag & Drop HTML5 natif
  const handleDragStart = (e, shift) => {
    setDragSrc(shift);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', shift.id);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e, empId, dayIdx) => {
    e.preventDefault();
    if (!dragSrc) return;
    if (dragSrc.employee_id === empId && dragSrc.dayIdx === dayIdx) return;
    const newDate = fmtDate(weekDates[dayIdx]);
    const isOff = dragSrc.shift_type === 'off' || dragSrc.shift_type === 'repos';
    try {
      await axios.patch(API+'/schedules/'+dragSrc.id, {
        employee_id: empId,
        work_date: newDate,
        start_time: isOff ? newDate+'T00:00:00' : newDate+'T'+dragSrc.start_time.slice(11,16)+':00',
        end_time: isOff ? newDate+'T00:00:00' : newDate+'T'+dragSrc.end_time.slice(11,16)+':00',
      });
      await loadShifts();
      showToast('Creneau deplace');
    } catch(err) { showToast('Erreur deplacement','error'); }
    setDragSrc(null);
  };

  const handleDragEnd = () => setDragSrc(null);

  // Reordering employes dans le secteur (drag sur lignes)
  const handleEmpDragStart = (e, empId) => {
    e.dataTransfer.setData('empId', empId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleEmpDrop = (e, targetEmpId) => {
    e.preventDefault();
    const srcId = e.dataTransfer.getData('empId');
    if (srcId === String(targetEmpId)) return;
    const current = sortedEmps.map(x => x.id);
    const srcIdx = current.indexOf(Number(srcId)) !== -1 ? current.indexOf(Number(srcId)) : current.indexOf(srcId);
    const tgtIdx = current.indexOf(targetEmpId);
    if (srcIdx === -1 || tgtIdx === -1) return;
    const newOrder = [...current];
    newOrder.splice(srcIdx, 1);
    newOrder.splice(tgtIdx, 0, current[srcIdx]);
    saveOrder(activeService, newOrder);
    showToast('Ordre mis a jour');
  };

  // Export PDF simplifie (sans heures, pour salaries)
  const exportPDF = async () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const mon = monday;
    const weekLabel = fmtDate(mon) + ' au ' + fmtDate(addDays(mon,6));
    doc.setFont('helvetica','bold');
    doc.setFontSize(16);
    doc.text('Planning - ' + activeService, 14, 15);
    doc.setFontSize(10);
    doc.setFont('helvetica','normal');
    doc.text('Semaine du ' + weekLabel, 14, 22);
    const colW = 36;
    const rowH = 14;
    const startX = 14;
    let y = 30;
    // En-tete jours
    doc.setFillColor(108, 92, 231);
    doc.setTextColor(255,255,255);
    doc.setFont('helvetica','bold');
    doc.setFontSize(9);
    if (viewMode === 'salarie-ligne') {
      // Mode par defaut: salarié en ligne, jour en colonne
      doc.rect(startX, y, 40, rowH, 'F');
      doc.text('Salarie', startX+2, y+9);
      weekDates.forEach((d,i) => {
        const x = startX+40+i*colW;
        doc.rect(x, y, colW, rowH, 'F');
        doc.text(DAYS[i]+' '+d.getDate()+'/'+String(d.getMonth()+1).padStart(2,'0'), x+2, y+9);
      });
      y += rowH;
      doc.setFont('helvetica','normal'); doc.setFontSize(8);
      sortedEmps.forEach((emp, ei) => {
        const bg = ei%2===0 ? [250,250,255] : [255,255,255];
        doc.setFillColor(...bg); doc.setTextColor(30,30,30);
        doc.rect(startX, y, 40, rowH, 'F');
        doc.text(emp.first_name+' '+emp.last_name, startX+2, y+9);
        weekDates.forEach((d,dayIdx) => {
          const x = startX+40+dayIdx*colW;
          doc.setFillColor(...bg); doc.rect(x, y, colW, rowH, 'F');
          const dayShifts = shifts.filter(s => s.employee_id===emp.id && s.work_date.slice(0,10)===fmtDate(d));
          if (dayShifts.length > 0) {
            const s = dayShifts[0];
            const sh = SHIFTS.find(x=>x.id===s.shift_type);
            if (s.shift_type === 'off' || s.shift_type === 'repos') {
              doc.setTextColor(100,100,100); doc.text(sh ? sh.label : 'OFF', x+2, y+9);
            } else {
              doc.setTextColor(30,30,30);
              doc.text((sh?sh.label:s.shift_type), x+2, y+6);
              doc.text(s.start_time.slice(11,16)+'-'+s.end_time.slice(11,16), x+2, y+12);
            }
          }
          doc.setTextColor(30,30,30);
        });
        y += rowH;
        if (y > 185) { doc.addPage(); y = 20; }
      });
    } else {
      // Mode inverse: jour en ligne, salarie en colonne
      const empColW = Math.min(colW, (280 - 25) / Math.max(sortedEmps.length, 1));
      doc.rect(startX, y, 25, rowH, 'F');
      doc.text('Jour', startX+2, y+9);
      sortedEmps.forEach((emp,i) => {
        const x = startX+25+i*empColW;
        doc.rect(x, y, empColW, rowH, 'F');
        doc.text((emp.first_name+' '+emp.last_name).substring(0,10), x+2, y+9);
      });
      y += rowH;
      doc.setFont('helvetica','normal'); doc.setFontSize(8);
      weekDates.forEach((d, dayIdx) => {
        const bg = dayIdx%2===0 ? [250,250,255] : [255,255,255];
        doc.setFillColor(...bg); doc.setTextColor(30,30,30);
        doc.rect(startX, y, 25, rowH, 'F');
        doc.text(DAYS[dayIdx]+' '+d.getDate()+'/'+String(d.getMonth()+1).padStart(2,'0'), startX+2, y+9);
        sortedEmps.forEach((emp,i) => {
          const x = startX+25+i*empColW;
          doc.setFillColor(...bg); doc.rect(x, y, empColW, rowH, 'F');
          const dayShifts = shifts.filter(s => s.employee_id===emp.id && s.work_date.slice(0,10)===fmtDate(d));
          if (dayShifts.length > 0) {
            const s = dayShifts[0];
            const sh = SHIFTS.find(x=>x.id===s.shift_type);
            if (s.shift_type==='off'||s.shift_type==='repos') {
              doc.setTextColor(100,100,100); doc.text(sh?sh.label:'OFF', x+2, y+9);
            } else {
              doc.setTextColor(30,30,30);
              doc.text(s.start_time.slice(11,16)+'-'+s.end_time.slice(11,16), x+2, y+9);
            }
          }
          doc.setTextColor(30,30,30);
        });
        y += rowH;
      });
    }
    doc.save('planning-'+activeService+'-'+fmtDate(monday)+'.pdf');
  };

  // Styles communs
  const inp = { padding:'6px 10px', borderRadius:'6px', border:'1px solid '+C.border, background:C.input, color:C.text, fontSize:'13px', width:'100%' };
  const lbl = { fontSize:'11px', fontWeight:600, color:C.muted, letterSpacing:'0.05em', display:'block', marginBottom:'4px' };
  const btn = (bg,fg) => ({ padding:'8px 14px', borderRadius:'8px', border:'none', background:bg, color:fg, cursor:'pointer', fontSize:'13px', fontWeight:500 });

  // Rendu brique shift avec drag & drop
  const renderShift = (s, empId, dayIdx) => {
    const def = SHIFTS.find(x=>x.id===s.shift_type) || SHIFTS[0];
    const isOff = s.shift_type==='off'||s.shift_type==='repos';
    return (
      <div key={s.id}
        draggable={isAdmin}
        onDragStart={isAdmin ? (e)=>handleDragStart(e,{...s,dayIdx}) : undefined}
        onDragEnd={handleDragEnd}
        style={{
          background:def.bg, border:'1.5px solid '+def.border, borderRadius:'7px',
          padding:'4px 7px', marginBottom:'3px', fontSize:'11px',
          cursor: isAdmin ? 'grab' : 'default',
          opacity: dragSrc && dragSrc.id===s.id ? 0.5 : 1,
          transition:'opacity 0.15s'
        }}
      >
        <div style={{fontWeight:600, color:def.text}}>
          {isOff ? def.label : (s.start_time.slice(11,16)+' - '+s.end_time.slice(11,16))}
        </div>
        {!isOff && <div style={{color:def.text,opacity:0.8}}>{def.label}{s.note?(' - '+s.note):''}</div>}
        {isOff && s.note && <div style={{color:def.text,opacity:0.7,fontSize:'10px'}}>{s.note}</div>}
        {isAdmin && (
          <button onClick={()=>handleDeleteShift(s.id)}
            style={{background:'none',border:'none',color:def.text,cursor:'pointer',fontSize:'10px',padding:'1px 4px',opacity:0.7}}
          >x</button>
        )}
      </div>
    );
  };

  // Cellule droppable
  const renderCell = (emp, dayIdx) => {
    const d = weekDates[dayIdx];
    const dayShifts = shifts.filter(s => s.employee_id===emp.id && s.work_date.slice(0,10)===fmtDate(d));
    const isDropTarget = dragSrc && !(dragSrc.employee_id===emp.id && dragSrc.dayIdx===dayIdx);
    return (
      <td key={dayIdx}
        onDragOver={isAdmin ? handleDragOver : undefined}
        onDrop={isAdmin ? (e)=>handleDrop(e,emp.id,dayIdx) : undefined}
        style={{
          border:'1px solid '+C.border, padding:'4px', minWidth:'110px', verticalAlign:'top',
          background: isDropTarget && dragSrc ? C.cardHover||'rgba(108,92,231,0.05)' : C.card,
          transition:'background 0.15s'
        }}
        onClick={() => { if (isAdmin && dayShifts.length===0) { setSelDay(dayIdx); setSelEmp(emp.id); setModal('create'); } }}
      >
        {dayShifts.map(s => renderShift(s, emp.id, dayIdx))}
        {isAdmin && dayShifts.length===0 && (
          <div style={{color:C.muted,fontSize:'11px',textAlign:'center',paddingTop:'8px',cursor:'pointer'}}>+</div>
        )}
      </td>
    );
  };

  const mon = monday;
  const weekLabel = monthsFull[mon.getMonth()]+' '+mon.getFullYear();

  return (
    <div style={{padding:'16px', color:C.text}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px',flexWrap:'wrap',gap:'8px'}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <button onClick={()=>setWeekOffset(w=>w-1)} style={btn(C.card,C.text)}>&#8249;</button>
          <span style={{fontWeight:700,fontSize:'15px',minWidth:'160px',textAlign:'center'}}>
            Semaine du {fmtDate(monday).slice(8,10)}/{fmtDate(monday).slice(5,7)} au {fmtDate(addDays(monday,6)).slice(8,10)}/{fmtDate(addDays(monday,6)).slice(5,7)} - {weekLabel}
          </span>
          <button onClick={()=>setWeekOffset(w=>w+1)} style={btn(C.card,C.text)}>&#8250;</button>
          <button onClick={()=>setWeekOffset(0)} style={{...btn(C.card,C.muted),fontSize:'11px'}}>Auj.</button>
        </div>
        <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
          {/* Toggle vue lignes/colonnes */}
          <button
            onClick={()=>setViewMode(v=>v==='salarie-ligne'?'salarie-colonne':'salarie-ligne')}
            title={viewMode==='salarie-ligne'?'Passer en mode: jour en ligne':'Passer en mode: salarie en ligne'}
            style={btn(C.card,C.text)}
          >
            {viewMode==='salarie-ligne' ? '&#8644; Inverser vue' : '&#8645; Vue normale'}
          </button>
          {isAdmin && (
            <>
              <button onClick={()=>setCopyModal(true)} style={btn(C.card,C.text)}>&#128203; Copier semaine</button>
              <button onClick={()=>setShowAddMember(true)} style={btn(C.card,C.text)}>+ Ajouter membre</button>
              <button onClick={()=>setModal('create')} style={btn(C.purple||'#6C5CE7','#fff')}>+ Creneau</button>
            </>
          )}
          <button onClick={exportPDF} style={btn(C.card,C.text)}>&#128196; PDF</button>
        </div>
      </div>

      {/* Onglets services */}
      <div style={{display:'flex',gap:'6px',marginBottom:'14px',flexWrap:'wrap'}}>
        {SERVICES.map(s => (
          <button key={s} onClick={()=>setActiveService(s)}
            style={{padding:'5px 12px',borderRadius:'20px',border:'none',cursor:'pointer',fontSize:'12px',fontWeight:600,
              background:activeService===s?(C.purple||'#6C5CE7'):C.card,
              color:activeService===s?'#fff':C.text}}
          >{s}</button>
        ))}
      </div>

      {/* Grille planning */}
      <div ref={planningRef} style={{overflowX:'auto'}}>
        {viewMode === 'salarie-ligne' ? (
          // MODE NORMAL: salaries en lignes, jours en colonnes
          <table style={{borderCollapse:'collapse',width:'100%',minWidth:'700px'}}>
            <thead>
              <tr>
                <th style={{border:'1px solid '+C.border,padding:'8px',background:C.cardAlt||C.card,minWidth:'160px',textAlign:'left'}}>
                  <span style={{fontSize:'11px',color:C.muted}}>Salarie</span>
                </th>
                {weekDates.map((d,i) => (
                  <th key={i} style={{border:'1px solid '+C.border,padding:'8px',background:C.cardAlt||C.card,minWidth:'110px',textAlign:'center'}}>
                    <div style={{fontWeight:700}}>{DAYS[i]}</div>
                    <div style={{fontSize:'11px',color:C.muted}}>{d.getDate()}/{String(d.getMonth()+1).padStart(2,'0')}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedEmps.map((emp,ei) => (
                <tr key={emp.id}
                  draggable={isAdmin}
                  onDragStart={isAdmin ? (e)=>handleEmpDragStart(e,emp.id) : undefined}
                  onDragOver={isAdmin ? (e)=>e.preventDefault() : undefined}
                  onDrop={isAdmin ? (e)=>handleEmpDrop(e,emp.id) : undefined}
                  style={{background:ei%2===0?C.card:C.cardAlt||C.card}}
                >
                  <td style={{border:'1px solid '+C.border,padding:'8px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                      {isAdmin && <span style={{cursor:'grab',color:C.muted,fontSize:'14px'}}>&#9776;</span>}
                      <div style={{width:'28px',height:'28px',borderRadius:'50%',background:AVATAR_COLORS[ei%AVATAR_COLORS.length],display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:'11px',flexShrink:0}}>
                        {initials(emp.first_name,emp.last_name)}
                      </div>
                      <div>
                        <div style={{fontWeight:600,fontSize:'12px'}}>{emp.first_name} {emp.last_name}</div>
                        <div style={{fontSize:'10px',color:C.muted}}>{emp.role}</div>
                      </div>
                    </div>
                  </td>
                  {weekDates.map((_,dayIdx) => renderCell(emp, dayIdx))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          // MODE INVERSE: jours en lignes, salaries en colonnes
          <table style={{borderCollapse:'collapse',width:'100%',minWidth:'700px'}}>
            <thead>
              <tr>
                <th style={{border:'1px solid '+C.border,padding:'8px',background:C.cardAlt||C.card,minWidth:'80px',textAlign:'left'}}>
                  <span style={{fontSize:'11px',color:C.muted}}>Jour</span>
                </th>
                {sortedEmps.map((emp,ei) => (
                  <th key={emp.id} style={{border:'1px solid '+C.border,padding:'6px',background:C.cardAlt||C.card,minWidth:'110px',textAlign:'center'}}>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'3px'}}>
                      <div style={{width:'26px',height:'26px',borderRadius:'50%',background:AVATAR_COLORS[ei%AVATAR_COLORS.length],display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:'10px'}}>
                        {initials(emp.first_name,emp.last_name)}
                      </div>
                      <div style={{fontWeight:600,fontSize:'11px'}}>{emp.first_name}</div>
                      <div style={{fontSize:'10px',color:C.muted}}>{emp.last_name}</div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weekDates.map((d,dayIdx) => (
                <tr key={dayIdx} style={{background:dayIdx%2===0?C.card:C.cardAlt||C.card}}>
                  <td style={{border:'1px solid '+C.border,padding:'8px',fontWeight:700,fontSize:'12px'}}>
                    <div>{DAYS[dayIdx]}</div>
                    <div style={{fontSize:'10px',color:C.muted,fontWeight:400}}>{d.getDate()}/{String(d.getMonth()+1).padStart(2,'0')}</div>
                  </td>
                  {sortedEmps.map((emp) => renderCell(emp, dayIdx))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal creation creneau */}
      {modal==='create' && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}} onClick={()=>setModal(null)}>
          <div style={{background:C.card,border:'1px solid '+C.border,borderRadius:'12px',padding:'24px',width:'340px',boxShadow:'0 8px 32px rgba(0,0,0,0.2)'}} onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:700,fontSize:'15px',marginBottom:'16px',color:C.text}}>Nouveau creneau</div>
            <div style={{marginBottom:'12px'}}>
              <label style={lbl}>SALARIE</label>
              <select style={inp} value={selEmp} onChange={e=>setSelEmp(e.target.value)}>
                <option value=''>-- Choisir --</option>
                {employees.filter(e=>e.is_active!==false).map(e => (
                  <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
                ))}
              </select>
            </div>
            <div style={{marginBottom:'12px'}}>
              <label style={lbl}>JOUR</label>
              <select style={inp} value={selDay} onChange={e=>setSelDay(Number(e.target.value))}>
                {weekDates.map((d,i)=>(
                  <option key={i} value={i}>{DAYS[i]} {d.getDate()}/{String(d.getMonth()+1).padStart(2,'0')}</option>
                ))}
              </select>
            </div>
            <div style={{marginBottom:'12px'}}>
              <label style={lbl}>TYPE</label>
              <select style={inp} value={selShift} onChange={e=>setSelShift(e.target.value)}>
                {SHIFTS.map(s=>(<option key={s.id} value={s.id}>{s.label}</option>))}
              </select>
            </div>
            {selShift==='custom' && (
              <div style={{display:'flex',gap:'8px',marginBottom:'12px'}}>
                <div style={{flex:1}}><label style={lbl}>DEBUT</label><input type='time' style={inp} value={customStart} onChange={e=>setCustomStart(e.target.value)}/></div>
                <div style={{flex:1}}><label style={lbl}>FIN</label><input type='time' style={inp} value={customEnd} onChange={e=>setCustomEnd(e.target.value)}/></div>
              </div>
            )}
            <div style={{marginBottom:'16px'}}>
              <label style={lbl}>NOTE (optionnel)</label>
              <input type='text' style={inp} value={note} onChange={e=>setNote(e.target.value)} placeholder='ex: remplacement...'/>
            </div>
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={()=>setModal(null)} style={{flex:1,...btn('none',C.muted),border:'1px solid '+C.border}}>Annuler</button>
              <button onClick={createShift} style={{flex:1,...btn(C.purple||'#6C5CE7','#fff')}}>Creer</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal copie semaine */}
      {copyModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}} onClick={()=>setCopyModal(false)}>
          <div style={{background:C.card,border:'1px solid '+C.border,borderRadius:'12px',padding:'24px',width:'320px',boxShadow:'0 8px 32px '+C.shadow}} onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:700,fontSize:'15px',marginBottom:'16px',color:C.text}}>Copier la semaine</div>
            <div style={{marginBottom:'12px'}}>
              <label style={lbl}>SALARIE (laisser vide = tous)</label>
              <select style={inp} value={copyEmpId} onChange={e=>setCopyEmpId(e.target.value)}>
                <option value=''>-- Tous les salaries --</option>
                {employees.filter(e=>e.is_active!==false).map(emp=>(
                  <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
                ))}
              </select>
            </div>
            <div style={{marginBottom:'12px'}}>
              <label style={lbl}>SEMAINE CIBLE</label>
              <div style={{display:'flex',gap:'6px',marginBottom:'6px'}}>
                <button onClick={()=>setCopyTargetOffset(weekOffset+1)} style={{flex:1,padding:'6px',borderRadius:'6px',border:'1px solid '+(copyTargetOffset===weekOffset+1?C.purple||'#6C5CE7':C.border),background:copyTargetOffset===weekOffset+1?(C.purple||'#6C5CE7'):'none',color:copyTargetOffset===weekOffset+1?'#fff':C.text,cursor:'pointer',fontSize:'12px'}}>Semaine suivante</button>
                <button onClick={()=>setCopyTargetOffset(weekOffset+2)} style={{flex:1,padding:'6px',borderRadius:'6px',border:'1px solid '+(copyTargetOffset===weekOffset+2?C.purple||'#6C5CE7':C.border),background:copyTargetOffset===weekOffset+2?(C.purple||'#6C5CE7'):'none',color:copyTargetOffset===weekOffset+2?'#fff':C.text,cursor:'pointer',fontSize:'12px'}}>Dans 2 semaines</button>
              </div>
              <div style={{fontSize:'11px',color:C.muted,textAlign:'center'}}>
                Vers: {fmtDate(getMonday(copyTargetOffset))} au {fmtDate(addDays(getMonday(copyTargetOffset),6))}
              </div>
            </div>
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={()=>setCopyModal(false)} style={{flex:1,...btn('none',C.muted),border:'1px solid '+C.border,padding:'8px',borderRadius:'6px',cursor:'pointer',fontSize:'13px'}}>Annuler</button>
              <button onClick={copyWeek} style={{flex:1,background:C.purple||'#6C5CE7',border:'none',borderRadius:'6px',padding:'8px',color:'#fff',cursor:'pointer',fontSize:'13px'}}>Copier</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ajout membre au secteur */}
      {showAddMember && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}} onClick={()=>setShowAddMember(false)}>
          <div style={{background:C.card,border:'1px solid '+C.border,borderRadius:'12px',padding:'24px',width:'360px',maxHeight:'80vh',overflowY:'auto',boxShadow:'0 8px 32px rgba(0,0,0,0.2)'}} onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:700,fontSize:'15px',marginBottom:'4px',color:C.text}}>Membres du secteur {activeService}</div>
            <div style={{fontSize:'12px',color:C.muted,marginBottom:'16px'}}>Cochez les salaries a afficher dans ce secteur</div>
            <div style={{marginBottom:'16px'}}>
              {employees.filter(e=>e.is_active!==false).map(emp => {
                const currentMembers = sectorMembers[activeService] || [];
                const isInService = emp.service===activeService || (emp.services_secondaires&&emp.services_secondaires.includes(activeService));
                const isExtra = currentMembers.includes(emp.id) && !isInService;
                const checked = isInService || currentMembers.includes(emp.id);
                return (
                  <div key={emp.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px',borderRadius:'6px',marginBottom:'4px',background:checked?(C.cardAlt||'rgba(108,92,231,0.05)'):C.card,border:'1px solid '+(checked?C.purple||'#6C5CE7':C.border)}}>
                    <input type='checkbox'
                      checked={!!checkedEmps.length ? checkedEmps.includes(emp.id) : checked}
                      disabled={isInService}
                      onChange={e => {
                        if (e.target.checked) {
                          setCheckedEmps(prev => prev.length===0 ? [...(sectorMembers[activeService]||[]),emp.id] : [...prev,emp.id]);
                        } else {
                          setCheckedEmps(prev => (prev.length===0 ? (sectorMembers[activeService]||[]) : prev).filter(id=>id!==emp.id));
                        }
                      }}
                      style={{width:'16px',height:'16px',cursor:isInService?'default':'pointer'}}
                    />
                    <div style={{width:'28px',height:'28px',borderRadius:'50%',background:AVATAR_COLORS[employees.indexOf(emp)%AVATAR_COLORS.length],display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:'11px',flexShrink:0}}>
                      {initials(emp.first_name,emp.last_name)}
                    </div>
                    <div>
                      <div style={{fontWeight:600,fontSize:'13px'}}>{emp.first_name} {emp.last_name}</div>
                      <div style={{fontSize:'11px',color:C.muted}}>{emp.role} - {emp.service}{isInService?' (service principal)':isExtra?' (ajoute)':''}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={()=>{setShowAddMember(false);setCheckedEmps([]);}} style={{flex:1,...btn('none',C.muted),border:'1px solid '+C.border,padding:'8px',borderRadius:'6px',cursor:'pointer'}}>Annuler</button>
              <button onClick={async()=>{
                const toSave = checkedEmps.length > 0 ? checkedEmps : (sectorMembers[activeService]||[]);
                await saveSectorMembers(activeService, toSave);
                setShowAddMember(false); setCheckedEmps([]);
                showToast('Membres mis a jour');
              }} style={{flex:1,...btn(C.purple||'#6C5CE7','#fff'),padding:'8px',borderRadius:'6px',cursor:'pointer'}}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div style={{position:'fixed',bottom:'24px',right:'24px',background:toast.type==='error'?'#EF4444':C.green||'#10B981',color:'#fff',borderRadius:'8px',padding:'10px 16px',fontSize:'13px',fontWeight:600,zIndex:200,boxShadow:'0 4px 12px rgba(0,0,0,0.2)'}}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
