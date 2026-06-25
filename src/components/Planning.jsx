import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useTheme } from '../ThemeContext';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import supabase from '../supabase';

const API = 'https://mon-planning-production.up.railway.app/api';
const SERVICES = ['Accueil', 'Housekeeping', 'Technique', 'Restauration', 'Animation'];
const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const SHIFTS = [
  { id: 'matin', label: 'Matin', start: '07:00', end: '13:00', bg: '#EEF2FF', border: '#7C6FCD', text: '#4338CA' },
  { id: 'apres_midi', label: 'Apres-midi', start: '13:00', end: '19:00', bg: '#F0FDF4', border: '#2DB87A', text: '#166534' },
  { id: 'journee', label: 'Journee', start: '09:00', end: '17:00', bg: '#FFFBEB', border: '#F5A623', text: '#92400E' },
  { id: 'soir', label: 'Soir', start: '18:00', end: '23:30', bg: '#FEF2F2', border: '#E85D5D', text: '#991B1B' },
  { id: 'custom', label: 'Personnalise', start: '08:00', end: '16:00', bg: '#EFF6FF', border: '#3B82F6', text: '#1E40AF' },
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

// Pause légale CC HPA
function calcPauseHPA(totalMinutes) {
  if (totalMinutes >= 540) return 45; // > 9h
  if (totalMinutes >= 360) return 30; // > 6h
  return 0;
}

function calcShiftH(s) {
  if (!s.start_time || !s.end_time || s.shift_type === 'repos') return 0;
  const [sh,sm] = s.start_time.slice(0,5).split(':').map(Number);
  const [eh,em] = s.end_time.slice(0,5).split(':').map(Number);
  const brk = parseInt(s.break_minutes || 0);
  return Math.max(0, (eh*60+em - sh*60-sm - brk) / 60);
}

function calcHeuresEmp(empId, shiftsMap) {
  return Object.entries(shiftsMap)
    .filter(([k]) => k.startsWith(empId + '-'))
    .reduce((acc, [, arr]) => {
      const list = Array.isArray(arr) ? arr : [arr];
      return acc + list.reduce((s, sh) => s + calcShiftH(sh), 0);
    }, 0);
}

export default function Planning() {
  const { colors: C } = useTheme();
  const [service, setService] = useState('Accueil');
  const [weekOffset, setWeekOffset] = useState(0);
  const [employees, setEmployees] = useState([]);
  const [shiftsMap, setShiftsMap] = useState({}); // key = empId-date, value = array of shifts
  const [monthlySummary, setMonthlySummary] = useState({});
  const [visibility, setVisibility] = useState({}); // key = empId, value = bool
  const [modal, setModal] = useState(null); // 'add' | 'manage' | 'addTemp'
  const [form, setForm] = useState({});
  const [dupDays, setDupDays] = useState([]);
  const [toast, setToast] = useState('');
  const [hovered, setHovered] = useState(null);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [tempForm, setTempForm] = useState({ first_name: '', last_name: '', role: '' });
  const [dragEmpIdx, setDragEmpIdx] = useState(null);
  const [copyModal, setCopyModal] = useState(false);
  const [copyEmpId, setCopyEmpId] = useState('');
  const [copyTargetOffset, setCopyTargetOffset] = useState(1);
  const toastTimer = useRef(null);
  const planningRef = useRef(null);
  const mon = getMonday(weekOffset);
  const today = new Date(); today.setHours(0,0,0,0);
  const currentMonth = fmtDate(mon).slice(0, 7);
  const currentMonthLabel = monthsFull[mon.getMonth()] + ' ' + mon.getFullYear();
  const weekStart = fmtDate(mon);

  useEffect(() => { loadEmployees(); }, []);
  useEffect(() => { loadShifts(); loadVisibility(); loadMonthlySummary(); }, [weekOffset, service]); // eslint-disable-line

  async function loadEmployees() {
    const r = await axios.get(API+'/employees').catch(()=>({data:[]}));
    setEmployees(r.data.sort((a,b) => (a.sort_order||0) - (b.sort_order||0)));
  }

  async function loadShifts() {
    const r = await axios.get(API+'/schedules?week='+fmtDate(mon)).catch(()=>({data:[]}));
    const map = {};
    r.data.forEach(s => {
      const dk = s.work_date ? s.work_date.slice(0,10) : '';
      const key = s.employee_id + '-' + dk;
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    setShiftsMap(map);
  }

  async function loadMonthlySummary() {
    const r = await axios.get(API+'/schedules/monthly-summary?month='+currentMonth).catch(()=>({data:{}}));
    setMonthlySummary(r.data);
  }

  async function loadVisibility() {
    const { data } = await supabase.from('planning_visibility').select('*').eq('service', service).eq('week_start', weekStart);
    const vis = {};
    (data||[]).forEach(v => { vis[v.employee_id] = v.is_visible; });
    setVisibility(vis);
  }

  async function toggleVisibility(empId, current) {
    const newVal = !current;
    setVisibility(prev => ({ ...prev, [empId]: newVal }));
    await supabase.from('planning_visibility').upsert({ employee_id: empId, service, week_start: weekStart, is_visible: newVal });
  }

  const filtered = employees.filter(e =>
    (e.service === service || (e.services_secondaires && e.services_secondaires.split(',').map(s=>s.trim()).includes(service)))
    && (visibility[e.id] !== false)
  );

  const allInService = employees.filter(e =>
    e.service === service || (e.services_secondaires && e.services_secondaires.split(',').map(s=>s.trim()).includes(service))
  );

  function showToast(msg) { setToast(msg); clearTimeout(toastTimer.current); toastTimer.current=setTimeout(()=>setToast(''),2500); }

  async function exportPDF() {
    if (!planningRef.current) return;
    setExportingPDF(true); showToast('Generation PDF...');
    try {
      const canvas = await html2canvas(planningRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const ratio = pdfWidth / canvas.width * 10;
      pdf.setFontSize(10); pdf.setTextColor(100);
      const endMon2 = addDays(mon,6);
      const wl = mon.getDate()+' '+months[mon.getMonth()]+' -> '+endMon2.getDate()+' '+months[endMon2.getMonth()]+' '+endMon2.getFullYear();
      pdf.text('Planning '+service+' · '+wl, 14, 7);
      pdf.text('Le Bout du Monde · '+new Date().toLocaleDateString('fr-FR'), pdfWidth-14, 7, {align:'right'});
      pdf.addImage(imgData, 'PNG', 14, 12, canvas.width*ratio/10, canvas.height*ratio/10);
      pdf.save('planning-'+service.toLowerCase()+'-'+fmtDate(mon)+'.pdf');
      showToast('PDF telecharge !');
    } catch { showToast('Erreur PDF'); }
    finally { setExportingPDF(false); }
  }

  function openModal(emp, dayIdx, existingShift=null) {
    const date = fmtDate(addDays(mon,dayIdx));
    const sh = existingShift ? SHIFTS.find(s=>s.id===existingShift.shift_type)||SHIFTS[0] : SHIFTS[0];
    setForm({
      empId: emp.id, empName: emp.first_name+' '+emp.last_name, date, dayIdx,
      shiftId: existingShift?.shift_type || sh.id,
      start: existingShift ? existingShift.start_time.slice(0,5) : sh.start,
      end: existingShift ? existingShift.end_time.slice(0,5) : sh.end,
      breakMinutes: existingShift ? parseInt(existingShift.break_minutes||0) : 0,
      note: existingShift?.note || '',
      existingId: existingShift?.id || null,
      isDouble: false, start2: '18:00', end2: '23:00', breakMinutes2: 0, shiftId2: 'soir',
    });
    setDupDays([]); setModal('add');
  }

  // Calcul pause CC HPA auto pour double shift
  function calcAutoBreak(start, end) {
    if (!start || !end) return 0;
    const [sh,sm] = start.split(':').map(Number);
    const [eh,em] = end.split(':').map(Number);
    const totalMin = eh*60+em - sh*60-sm;
    return calcPauseHPA(totalMin);
  }

  const formNetH = form.shiftId && form.shiftId !== 'repos' && form.start && form.end ? (() => {
    const [sh,sm] = form.start.split(':').map(Number);
    const [eh,em] = form.end.split(':').map(Number);
    return Math.max(0, (eh*60+em - sh*60-sm - (form.breakMinutes||0)) / 60);
  })() : 0;

  const form2NetH = form.isDouble && form.start2 && form.end2 ? (() => {
    const [sh,sm] = form.start2.split(':').map(Number);
    const [eh,em] = form.end2.split(':').map(Number);
    return Math.max(0, (eh*60+em - sh*60-sm - (form.breakMinutes2||0)) / 60);
  })() : 0;

  async function saveShift() {
    try {
      const breakMins = form.breakMinutes || 0;
      const newShiftsMap = { ...shiftsMap };

      if (form.existingId) {
        await axios.patch(API+'/schedules/'+form.existingId, { start_time:form.start, end_time:form.end, shift_type:form.shiftId, break_minutes:breakMins, note:form.note||null });
        const key = form.empId+'-'+form.date;
        if (newShiftsMap[key]) {
          newShiftsMap[key] = newShiftsMap[key].map(s => s.id === form.existingId ? {...s, start_time:form.start, end_time:form.end, shift_type:form.shiftId, break_minutes:breakMins, note:form.note||null} : s);
        }
      } else {
        const r = await axios.post(API+'/schedules', { employee_id:form.empId, work_date:form.date, start_time:form.start, end_time:form.end, shift_type:form.shiftId, break_minutes:breakMins, note:form.note||null });
        const key = form.empId+'-'+form.date;
        newShiftsMap[key] = [...(newShiftsMap[key]||[]), r.data];

        // Double shift
        if (form.isDouble && form.shiftId2 !== 'repos') {
          const breakMins2 = form.breakMinutes2 || 0;
          const r2 = await axios.post(API+'/schedules', { employee_id:form.empId, work_date:form.date, start_time:form.start2, end_time:form.end2, shift_type:form.shiftId2, break_minutes:breakMins2, note:form.note||null });
          newShiftsMap[key] = [...newShiftsMap[key], r2.data];
        }
      }

      // Duplication
      for (const di of dupDays) {
        if (di === form.dayIdx) continue;
        const dd = fmtDate(addDays(mon,di));
        const key2 = form.empId+'-'+dd;
        try {
          const r = await axios.post(API+'/schedules', { employee_id:form.empId, work_date:dd, start_time:form.start, end_time:form.end, shift_type:form.shiftId, break_minutes:breakMins, note:form.note||null });
          newShiftsMap[key2] = [...(newShiftsMap[key2]||[]), r.data];
          if (form.isDouble && form.shiftId2 !== 'repos') {
            const r2 = await axios.post(API+'/schedules', { employee_id:form.empId, work_date:dd, start_time:form.start2, end_time:form.end2, shift_type:form.shiftId2, break_minutes:form.breakMinutes2||0, note:form.note||null });
            newShiftsMap[key2] = [...newShiftsMap[key2], r2.data];
          }
        } catch {}
      }

      setShiftsMap(newShiftsMap); setModal(null);
      loadMonthlySummary();
      showToast('Enregistre'+(dupDays.filter(d=>d!==form.dayIdx).length>0?' + '+dupDays.filter(d=>d!==form.dayIdx).length+' copie(s)':''));
    } catch(err) { showToast('Erreur : '+(err.response?.data?.error||err.message)); }
  }

  async function deleteShift(e, shiftId, empId, date) {
    e.stopPropagation();
    try {
      await axios.delete(API+'/schedules/'+shiftId);
      const key = empId+'-'+date;
      setShiftsMap(prev => {
        const n = {...prev};
        n[key] = (n[key]||[]).filter(s => s.id !== shiftId);
        if (!n[key].length) delete n[key];
        return n;
      });
      loadMonthlySummary();
      showToast('Supprime');
    } catch { showToast('Erreur'); }
  }

  async function publishWeek() {
    try { const r = await axios.post(API+'/schedules/publish',{week:fmtDate(mon)}); showToast(r.data.published+' creneau(x) publie(s)'); }
    catch { showToast('Erreur'); }
  }

  async function copyWeek() {
    if(!copyEmpId){showToast('Selectionne un salarie');return;}
    const tm=getMonday(copyTargetOffset);
    const es=Object.entries(shiftsMap).filter(([k])=>k.startsWith(copyEmpId+'-'));
    if(!es.length){showToast('Aucun creneau');return;}
    let cp=0;
    for(const[k,shArr]of es){
      const sd=new Date(k.split('-').slice(1).join('-'));
      const di=(sd.getDay()+6)%7;
      const dd=fmtDate(addDays(tm,di));
      for (const sh of (Array.isArray(shArr)?shArr:[shArr])) {
        try{await axios.post(API+'/schedules',{employee_id:copyEmpId,work_date:dd,start_time:sh.start_time,end_time:sh.end_time,shift_type:sh.shift_type,break_minutes:sh.break_minutes||0,note:sh.note||null});cp++;}catch{}
      }
    }
    setCopyModal(false); showToast(cp+' creneau(x) copies');
  }

  // Réordonnancement drag & drop salariés
  async function moveEmp(fromIdx, toIdx) {
    const newList = [...allInService];
    const [moved] = newList.splice(fromIdx, 1);
    newList.splice(toIdx, 0, moved);
    // Mettre à jour sort_order
    for (let i = 0; i < newList.length; i++) {
      await supabase.from('employees').update({ sort_order: i+1 }).eq('id', newList[i].id);
    }
    setEmployees(prev => {
      const others = prev.filter(e => !allInService.find(a => a.id === e.id));
      return [...others, ...newList].sort((a,b) => (a.sort_order||0)-(b.sort_order||0));
    });
  }

  async function addTempEmployee() {
    if (!tempForm.first_name) { showToast('Prenom requis'); return; }
    const { data } = await supabase.from('employees').insert({
      first_name: tempForm.first_name, last_name: tempForm.last_name||'',
      role: tempForm.role||'Equiper temp', email: 'temp_'+Date.now()+'@temp.fr',
      service, contract_hours: 35, contract_type: 'CDD', is_active: true, is_temp: true,
      sort_order: allInService.length + 1,
    }).select().single();
    if (data) { setEmployees(prev => [...prev, data]); setVisibility(prev => ({...prev, [data.id]: true})); }
    setModal(null); setTempForm({ first_name:'', last_name:'', role:'' });
    showToast('Equiper temp ajoute');
  }

  async function deleteTempEmp(empId) {
    await supabase.from('employees').delete().eq('id', empId).eq('is_temp', true);
    setEmployees(prev => prev.filter(e => e.id !== empId));
    showToast('Supprime');
  }

  function toggleDupDay(di){setDupDays(prev=>prev.includes(di)?prev.filter(d=>d!==di):[...prev,di]);}

  const endMon=addDays(mon,6);
  const weekLabel=mon.getDate()+' '+months[mon.getMonth()]+' -> '+endMon.getDate()+' '+months[endMon.getMonth()]+' '+endMon.getFullYear();
  const inp={width:'100%',background:C.bg,border:'1px solid '+C.border,borderRadius:'6px',padding:'6px 8px',color:C.text,fontSize:'12px',fontFamily:'inherit'};
  const lbl={display:'block',fontSize:'10px',color:C.muted,letterSpacing:'0.08em',marginBottom:'4px'};

  return (
    <div style={{minHeight:'100vh',background:C.bg,color:C.text,fontFamily:"'DM Mono','Courier New',monospace"}}>
      {/* Barre nav */}
      <div style={{borderBottom:'1px solid '+C.border,padding:'14px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',background:C.card,flexWrap:'wrap',gap:'10px'}}>
        <div style={{display:'flex',gap:'6px',flexWrap:'wrap',alignItems:'center'}}>
          {SERVICES.map(sv=>(
            <button key={sv} style={{padding:'5px 14px',borderRadius:'6px',border:'1px solid '+(service===sv?C.purple:C.border),background:service===sv?C.purpleLight:'none',color:service===sv?C.purple:C.muted,cursor:'pointer',fontSize:'11px',fontFamily:'inherit'}} onClick={()=>setService(sv)}>{sv}</button>
          ))}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
          <button onClick={()=>setWeekOffset(w=>w-1)} style={{background:'none',border:'1px solid '+C.border,borderRadius:'6px',color:C.text,cursor:'pointer',padding:'4px 10px',fontSize:'13px',fontFamily:'inherit'}}>{'<'}</button>
          <span style={{fontSize:'12px',minWidth:'180px',textAlign:'center',color:C.text}}>{weekLabel}</span>
          <button onClick={()=>setWeekOffset(w=>w+1)} style={{background:'none',border:'1px solid '+C.border,borderRadius:'6px',color:C.text,cursor:'pointer',padding:'4px 10px',fontSize:'13px',fontFamily:'inherit'}}>{'>'}</button>
          <button onClick={()=>setWeekOffset(0)} style={{background:'none',border:'1px solid '+C.border,borderRadius:'6px',color:C.muted,cursor:'pointer',padding:'4px 10px',fontSize:'11px',fontFamily:'inherit'}}>Auj.</button>
          <button onClick={()=>setModal('manage')} style={{background:C.bg,border:'1px solid '+C.border,borderRadius:'6px',padding:'6px 12px',color:C.muted,cursor:'pointer',fontSize:'11px',fontFamily:'inherit'}} title="Gerer les equipiers">⚙️</button>
          <button onClick={()=>{setCopyEmpId(filtered[0]?.id||'');setCopyTargetOffset(weekOffset+1);setCopyModal(true);}} style={{background:C.amberLight,border:'1px solid '+C.amber+'66',borderRadius:'6px',padding:'6px 14px',color:C.amber,cursor:'pointer',fontSize:'11px',fontFamily:'inherit',fontWeight:600}}>Copier</button>
          <button onClick={exportPDF} disabled={exportingPDF} style={{background:C.purpleLight,border:'1px solid '+C.purple+'66',borderRadius:'6px',padding:'6px 12px',color:C.purple,cursor:exportingPDF?'not-allowed':'pointer',fontSize:'11px',fontFamily:'inherit',fontWeight:600,opacity:exportingPDF?0.7:1}}>{exportingPDF?'...':'↓ PDF'}</button>
          <button onClick={publishWeek} style={{background:C.green,border:'none',borderRadius:'6px',padding:'6px 14px',color:'#fff',cursor:'pointer',fontSize:'11px',fontFamily:'inherit',fontWeight:600}}>Publier</button>
        </div>
      </div>

      {/* Légende */}
      <div style={{padding:'8px 24px',background:C.card,borderBottom:'1px solid '+C.border,display:'flex',gap:'16px',alignItems:'center',flexWrap:'wrap'}}>
        <span style={{fontSize:'10px',color:C.muted,letterSpacing:'0.08em'}}>CC HPA :</span>
        {[{color:C.green,label:'≤ contrat'},{color:C.purple,label:'> contrat'},{color:C.amber,label:'> 44h ⚠️'},{color:C.red,label:'> 48h 🚨'}].map(item=>(
          <div key={item.label} style={{display:'flex',alignItems:'center',gap:'5px',fontSize:'11px',color:C.muted}}>
            <div style={{width:'10px',height:'10px',borderRadius:'50%',background:item.color,flexShrink:0}}/>{item.label}
          </div>
        ))}
        <span style={{fontSize:'10px',color:C.muted,marginLeft:'auto'}}>Pause auto CC HPA · Max 48h/sem</span>
      </div>

      {/* Grille planning */}
      <div style={{padding:'20px 24px'}}>
        {filtered.length===0?(
          <div style={{color:C.muted,textAlign:'center',padding:'60px',fontSize:'13px'}}>
            Aucun salarie visible · <button onClick={()=>setModal('manage')} style={{background:'none',border:'none',color:C.purple,cursor:'pointer',fontFamily:'inherit',fontSize:'13px',textDecoration:'underline'}}>Gérer les équipiers</button>
          </div>
        ):(
          <div ref={planningRef} style={{border:'1px solid '+C.border,borderRadius:'10px',overflow:'hidden',boxShadow:'0 2px 8px '+C.shadow,background:'#fff'}}>
            <div style={{padding:'10px 16px',background:'#f8f9ff',borderBottom:'1px solid '+C.border,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontSize:'13px',fontWeight:600,color:'#1A1D27'}}>Planning {service} · {weekLabel}</div>
              <div style={{fontSize:'11px',color:'#6B7280'}}>{currentMonthLabel} · Le Bout du Monde</div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'180px repeat(7, 1fr)',background:'#f8f9ff',borderBottom:'1px solid '+C.border}}>
              <div style={{padding:'8px',borderRight:'1px solid '+C.border,fontSize:'10px',color:'#6B7280'}}>{currentMonthLabel}</div>
              {DAYS.map((d,i)=>{const day=addDays(mon,i);const isToday=day.getTime()===today.getTime();return(
                <div key={i} style={{padding:'8px 4px',textAlign:'center',fontSize:'10px',color:isToday?'#6C5FCD':'#6B7280',borderRight:i<6?'1px solid '+C.border:'none',background:isToday?'#EEF2FF':'transparent'}}>
                  {d}<span style={{fontSize:'16px',fontWeight:600,display:'block',color:isToday?'#6C5FCD':'#1A1D27'}}>{day.getDate()}</span>
                </div>
              );})}
            </div>

            {filtered.map((emp,ei)=>{
              const totalH = calcHeuresEmp(emp.id, shiftsMap);
              const contractH = parseFloat(emp.contract_hours)||35;
              const hColor = totalH>48?'#DC2626':totalH>44?'#D97706':totalH>contractH?'#6C5FCD':'#16A34A';
              const isMulti = emp.service !== service;
              const monthly = monthlySummary[emp.id]||{heures_planifiees:0,heures_realisees:0};
              return(
                <div key={emp.id}
                  draggable
                  onDragStart={()=>setDragEmpIdx(ei)}
                  onDragOver={e=>e.preventDefault()}
                  onDrop={()=>{ if(dragEmpIdx!==null&&dragEmpIdx!==ei){moveEmp(dragEmpIdx,ei);setDragEmpIdx(null); } }}
                  style={{display:'grid',gridTemplateColumns:'180px repeat(7, 1fr)',borderBottom:ei<filtered.length-1?'1px solid '+C.border:'none',opacity:dragEmpIdx===ei?0.5:1,transition:'opacity .15s'}}>
                  <div style={{padding:'8px',borderRight:'1px solid '+C.border,display:'flex',alignItems:'flex-start',gap:'8px',background:'#fff',cursor:'grab'}}>
                    <div style={{position:'relative',flexShrink:0,marginTop:'2px'}}>
                      <div style={{width:'30px',height:'30px',borderRadius:'50%',background:AVATAR_COLORS[ei%AVATAR_COLORS.length]+'22',border:'1px solid '+AVATAR_COLORS[ei%AVATAR_COLORS.length]+'44',color:AVATAR_COLORS[ei%AVATAR_COLORS.length],display:'flex',alignItems:'center',justifyContent:'center',fontSize:'10px',fontWeight:600}}>
                        {initials(emp.first_name,emp.last_name)}
                      </div>
                      {isMulti&&<div style={{position:'absolute',bottom:'-2px',right:'-2px',width:'10px',height:'10px',borderRadius:'50%',background:'#D97706',border:'1px solid #fff',fontSize:'6px',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff'}}>M</div>}
                      {emp.is_temp&&<div style={{position:'absolute',top:'-2px',right:'-2px',width:'10px',height:'10px',borderRadius:'50%',background:'#6C5FCD',border:'1px solid #fff',fontSize:'6px',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff'}}>T</div>}
                    </div>
                    <div style={{minWidth:0,flex:1}}>
                      <div style={{fontSize:'11px',fontWeight:500,lineHeight:1.2,color:'#1A1D27',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{emp.first_name} {emp.last_name}</div>
                      <div style={{fontSize:'9px',color:'#6B7280'}}>{emp.role}</div>
                      {totalH>0?(
                        <div style={{fontSize:'9px',fontWeight:700,color:hColor,marginTop:'3px',display:'flex',alignItems:'center',gap:'3px'}}>
                          <div style={{width:'5px',height:'5px',borderRadius:'50%',background:hColor,flexShrink:0}}/>
                          Sem: {totalH.toFixed(1)}h / {contractH}h
                        </div>
                      ):<div style={{fontSize:'9px',color:'#E5E7EB',marginTop:'3px'}}>Sem: 0h / {contractH}h</div>}
                      <div style={{marginTop:'4px',padding:'3px 5px',background:'#F4F6FA',borderRadius:'4px',border:'1px solid #E2E5ED'}}>
                        <div style={{fontSize:'8px',color:'#6B7280',marginBottom:'2px'}}>CE MOIS</div>
                        <div style={{display:'flex',gap:'6px'}}>
                          <div style={{fontSize:'9px',color:'#6C5FCD',fontWeight:600}}>📅 {monthly.heures_planifiees.toFixed(1)}h</div>
                          <div style={{fontSize:'9px',color:'#16A34A',fontWeight:600}}>✓ {monthly.heures_realisees.toFixed(1)}h</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {DAYS.map((_,di)=>{
                    const date=fmtDate(addDays(mon,di));
                    const key=emp.id+'-'+date;
                    const dayShifts=shiftsMap[key]||[];
                    return(
                      <div key={di} style={{padding:'3px',minHeight:'80px',borderRight:di<6?'1px solid '+C.border:'none',cursor:'pointer',background:hovered===key?C.borderLight:'transparent'}}
                        onClick={()=>openModal(emp,di)} onMouseEnter={()=>setHovered(key)} onMouseLeave={()=>setHovered(null)}>
                        {dayShifts.length>0 ? (
                          <div style={{display:'flex',flexDirection:'column',gap:'2px'}}>
                            {dayShifts.map((shift,si)=>{
                              const shDef=SHIFTS.find(s=>s.id===shift.shift_type)||SHIFTS[4];
                              return(
                                <div key={si} draggable onDragStart={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();openModal(emp,di,shift);}}
                                  style={{borderRadius:'5px',padding:'3px 6px',fontSize:'10px',fontWeight:500,background:shDef.bg,border:'1px solid '+shDef.border,color:shDef.text,cursor:'pointer',position:'relative',lineHeight:1.3}}>
                                  {shDef.label}
                                  {shift.shift_type!=='repos'&&<div style={{fontSize:'9px',opacity:0.75}}>{shift.start_time?.slice(0,5)}–{shift.end_time?.slice(0,5)}{parseInt(shift.break_minutes||0)>0?' ('+shift.break_minutes+'m)':''}</div>}
                                  {shift.note&&<div style={{fontSize:'9px',opacity:0.9,marginTop:'1px',fontStyle:'italic',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{shift.note}</div>}
                                  <button onClick={e=>deleteShift(e,shift.id,emp.id,date)} style={{position:'absolute',top:'2px',right:'3px',background:'none',border:'none',color:'inherit',cursor:'pointer',fontSize:'10px',opacity:hovered===key?1:0,transition:'opacity .15s',padding:'0 2px',fontFamily:'inherit'}}>x</button>
                                </div>
                              );
                            })}
                            <div onClick={e=>{e.stopPropagation();openModal(emp,di);}} style={{fontSize:'9px',color:C.purple,textAlign:'center',cursor:'pointer',padding:'1px',opacity:0.7}}>+ shift</div>
                          </div>
                        ):(
                          <div style={{fontSize:'18px',color:C.border,textAlign:'center',paddingTop:'10px',opacity:hovered===key?1:0}}>+</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal ajout créneau */}
      {modal==='add'&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,padding:'20px'}} onClick={()=>setModal(null)}>
          <div style={{background:C.card,border:'1px solid '+C.border,borderRadius:'12px',padding:'20px',width:'340px',maxHeight:'90vh',overflowY:'auto',boxShadow:'0 8px 32px '+C.shadow}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:'13px',fontWeight:600,marginBottom:'2px',color:C.text}}>{form.empName}</div>
            <div style={{fontSize:'11px',color:C.muted,marginBottom:'14px'}}>{form.date}</div>

            {/* Shift 1 */}
            <div style={{background:C.bg,borderRadius:'8px',padding:'10px',marginBottom:'10px',border:'1px solid '+C.border}}>
              <div style={{fontSize:'10px',color:C.purple,fontWeight:600,marginBottom:'8px',letterSpacing:'0.08em'}}>SHIFT 1</div>
              <div style={{marginBottom:'8px'}}><label style={lbl}>TYPE</label>
                <select style={inp} value={form.shiftId} onChange={e=>{const sh=SHIFTS.find(s=>s.id===e.target.value);setForm(f=>({...f,shiftId:e.target.value,start:sh.start,end:sh.end}));}}>
                  {SHIFTS.map(sh=><option key={sh.id} value={sh.id}>{sh.label}{sh.start!=='00:00'?' ('+sh.start+'-'+sh.end+')':''}</option>)}
                </select>
              </div>
              {form.shiftId !== 'repos' && (
                <>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'6px',marginBottom:'6px'}}>
                    <div><label style={lbl}>DEBUT</label><input type="time" style={inp} value={form.start} onChange={e=>{const auto=calcAutoBreak(e.target.value,form.end);setForm(f=>({...f,start:e.target.value,breakMinutes:auto}));}}/></div>
                    <div><label style={lbl}>FIN</label><input type="time" style={inp} value={form.end} onChange={e=>{const auto=calcAutoBreak(form.start,e.target.value);setForm(f=>({...f,end:e.target.value,breakMinutes:auto}));}}/></div>
                    <div><label style={lbl}>PAUSE</label><input type="number" min="0" max="120" step="15" style={inp} value={form.breakMinutes||0} onChange={e=>setForm(f=>({...f,breakMinutes:parseInt(e.target.value||0)}))}/></div>
                  </div>
                  {formNetH>0&&<div style={{fontSize:'10px',color:C.purple,background:C.purpleLight,padding:'4px 8px',borderRadius:'5px'}}>⏱ {formNetH.toFixed(1)}h nettes</div>}
                </>
              )}
            </div>

            {/* Double shift toggle */}
            {!form.existingId && (
              <div style={{marginBottom:'10px'}}>
                <label style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer',fontSize:'12px',color:C.muted}}>
                  <input type="checkbox" checked={form.isDouble||false} onChange={e=>setForm(f=>({...f,isDouble:e.target.checked}))} style={{cursor:'pointer'}}/>
                  Ajouter un 2ème shift (coupure)
                </label>
              </div>
            )}

            {/* Shift 2 */}
            {form.isDouble && (
              <div style={{background:C.bg,borderRadius:'8px',padding:'10px',marginBottom:'10px',border:'1px solid '+C.amber+'66'}}>
                <div style={{fontSize:'10px',color:C.amber,fontWeight:600,marginBottom:'8px',letterSpacing:'0.08em'}}>SHIFT 2 (COUPURE)</div>
                <div style={{marginBottom:'8px'}}><label style={lbl}>TYPE</label>
                  <select style={inp} value={form.shiftId2||'soir'} onChange={e=>{const sh=SHIFTS.find(s=>s.id===e.target.value);setForm(f=>({...f,shiftId2:e.target.value,start2:sh.start,end2:sh.end}));}}>
                    {SHIFTS.filter(s=>s.id!=='repos').map(sh=><option key={sh.id} value={sh.id}>{sh.label} ({sh.start}-{sh.end})</option>)}
                  </select>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'6px',marginBottom:'6px'}}>
                  <div><label style={lbl}>DEBUT</label><input type="time" style={inp} value={form.start2||'18:00'} onChange={e=>{const auto=calcAutoBreak(e.target.value,form.end2);setForm(f=>({...f,start2:e.target.value,breakMinutes2:auto}));}}/></div>
                  <div><label style={lbl}>FIN</label><input type="time" style={inp} value={form.end2||'23:00'} onChange={e=>{const auto=calcAutoBreak(form.start2,e.target.value);setForm(f=>({...f,end2:e.target.value,breakMinutes2:auto}));}}/></div>
                  <div><label style={lbl}>PAUSE</label><input type="number" min="0" max="120" step="15" style={inp} value={form.breakMinutes2||0} onChange={e=>setForm(f=>({...f,breakMinutes2:parseInt(e.target.value||0)}))}/></div>
                </div>
                {form2NetH>0&&<div style={{fontSize:'10px',color:C.amber,background:C.amberLight,padding:'4px 8px',borderRadius:'5px'}}>⏱ {form2NetH.toFixed(1)}h nettes · Total journee: {(formNetH+form2NetH).toFixed(1)}h</div>}
              </div>
            )}

            <div style={{marginBottom:'10px'}}><label style={lbl}>NOTE</label>
              <input style={inp} placeholder="Ex: Service bar..." value={form.note||''} onChange={e=>setForm(f=>({...f,note:e.target.value}))}/>
            </div>

            {!form.existingId && (
              <div style={{marginBottom:'14px'}}><label style={{...lbl,marginBottom:'8px'}}>DUPLIQUER SUR</label>
                <div style={{display:'flex',gap:'5px',flexWrap:'wrap'}}>
                  {DAYS.map((d,di)=>{const isOrigin=di===form.dayIdx;const checked=isOrigin||dupDays.includes(di);return(
                    <button key={di} onClick={()=>!isOrigin&&toggleDupDay(di)} style={{padding:'4px 8px',borderRadius:'5px',fontSize:'10px',fontFamily:'inherit',cursor:isOrigin?'default':'pointer',border:'1px solid '+(checked?C.purple:C.border),background:checked?C.purpleLight:'none',color:checked?C.purple:C.muted,opacity:isOrigin?0.5:1}}>{d}</button>
                  );})}
                </div>
              </div>
            )}

            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={()=>setModal(null)} style={{flex:1,background:'none',border:'1px solid '+C.border,borderRadius:'6px',padding:'8px',color:C.muted,cursor:'pointer',fontSize:'12px',fontFamily:'inherit'}}>Annuler</button>
              <button onClick={saveShift} style={{flex:1,background:C.purple,border:'none',borderRadius:'6px',padding:'8px',color:'#fff',cursor:'pointer',fontSize:'12px',fontFamily:'inherit',fontWeight:600}}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal gestion équipiers */}
      {modal==='manage'&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,padding:'20px'}} onClick={()=>setModal(null)}>
          <div style={{background:C.card,border:'1px solid '+C.border,borderRadius:'12px',padding:'20px',width:'380px',maxHeight:'80vh',overflowY:'auto',boxShadow:'0 8px 32px '+C.shadow}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:'14px',fontWeight:600,marginBottom:'4px',color:C.text}}>Équipiers · {service}</div>
            <div style={{fontSize:'11px',color:C.muted,marginBottom:'16px'}}>Semaine du {weekLabel}</div>

            <div style={{display:'flex',flexDirection:'column',gap:'6px',marginBottom:'16px'}}>
              {allInService.map((emp,i)=>{
                const isVisible = visibility[emp.id] !== false;
                return(
                  <div key={emp.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px 10px',background:isVisible?C.bg:C.borderLight,borderRadius:'8px',border:'1px solid '+(isVisible?C.border:C.border+'44')}}>
                    <div style={{display:'flex',flexDirection:'column',gap:'2px'}}>
                      <button onClick={()=>i>0&&moveEmp(i,i-1)} disabled={i===0} style={{background:'none',border:'none',cursor:i===0?'default':'pointer',color:i===0?C.border:C.muted,fontSize:'10px',padding:'0',lineHeight:1}}>▲</button>
                      <button onClick={()=>i<allInService.length-1&&moveEmp(i,i+1)} disabled={i===allInService.length-1} style={{background:'none',border:'none',cursor:i===allInService.length-1?'default':'pointer',color:i===allInService.length-1?C.border:C.muted,fontSize:'10px',padding:'0',lineHeight:1}}>▼</button>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:'12px',fontWeight:500,color:isVisible?C.text:C.muted}}>{emp.first_name} {emp.last_name}</div>
                      <div style={{fontSize:'10px',color:C.muted}}>{emp.role}{emp.is_temp?' · Temp':''}</div>
                    </div>
                    <label style={{display:'flex',alignItems:'center',gap:'6px',cursor:'pointer'}}>
                      <input type="checkbox" checked={isVisible} onChange={()=>toggleVisibility(emp.id,isVisible)} style={{cursor:'pointer',width:'16px',height:'16px'}}/>
                      <span style={{fontSize:'11px',color:C.muted}}>{isVisible?'Visible':'Masqué'}</span>
                    </label>
                    {emp.is_temp&&(
                      <button onClick={()=>deleteTempEmp(emp.id)} style={{background:C.redLight,border:'1px solid '+C.red+'44',borderRadius:'5px',padding:'3px 7px',color:C.red,cursor:'pointer',fontSize:'10px',fontFamily:'inherit'}}>Supp.</button>
                    )}
                  </div>
                );
              })}
            </div>

            <button onClick={()=>setModal('addTemp')} style={{width:'100%',background:'none',border:'2px dashed '+C.purple+'66',borderRadius:'8px',padding:'10px',color:C.purple,cursor:'pointer',fontSize:'12px',fontFamily:'inherit',marginBottom:'10px'}}>
              + Ajouter un équipier temporaire
            </button>
            <button onClick={()=>setModal(null)} style={{width:'100%',background:C.purple,border:'none',borderRadius:'8px',padding:'10px',color:'#fff',cursor:'pointer',fontSize:'12px',fontFamily:'inherit',fontWeight:600}}>Fermer</button>
          </div>
        </div>
      )}

      {/* Modal équipier temp */}
      {modal==='addTemp'&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:110,padding:'20px'}} onClick={()=>setModal('manage')}>
          <div style={{background:C.card,border:'1px solid '+C.border,borderRadius:'12px',padding:'20px',width:'320px',boxShadow:'0 8px 32px '+C.shadow}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:'14px',fontWeight:600,marginBottom:'14px',color:C.text}}>Équipier temporaire</div>
            <div style={{marginBottom:'10px'}}><label style={lbl}>PRENOM *</label><input style={inp} value={tempForm.first_name} onChange={e=>setTempForm(f=>({...f,first_name:e.target.value}))} placeholder="Prenom"/></div>
            <div style={{marginBottom:'10px'}}><label style={lbl}>NOM</label><input style={inp} value={tempForm.last_name} onChange={e=>setTempForm(f=>({...f,last_name:e.target.value}))} placeholder="Nom"/></div>
            <div style={{marginBottom:'16px'}}><label style={lbl}>ROLE</label><input style={inp} value={tempForm.role} onChange={e=>setTempForm(f=>({...f,role:e.target.value}))} placeholder="Ex: Serveur, Animateur..."/></div>
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={()=>setModal('manage')} style={{flex:1,background:'none',border:'1px solid '+C.border,borderRadius:'6px',padding:'8px',color:C.muted,cursor:'pointer',fontSize:'12px',fontFamily:'inherit'}}>Annuler</button>
              <button onClick={addTempEmployee} style={{flex:1,background:C.purple,border:'none',borderRadius:'6px',padding:'8px',color:'#fff',cursor:'pointer',fontSize:'12px',fontFamily:'inherit',fontWeight:600}}>Ajouter</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal copie semaine */}
      {copyModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}} onClick={()=>setCopyModal(false)}>
          <div style={{background:C.card,border:'1px solid '+C.border,borderRadius:'12px',padding:'20px',width:'300px',boxShadow:'0 8px 32px '+C.shadow}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:'13px',fontWeight:600,marginBottom:'14px',color:C.text}}>Copier la semaine</div>
            <div style={{marginBottom:'12px'}}><label style={lbl}>SALARIE</label>
              <select style={inp} value={copyEmpId} onChange={e=>setCopyEmpId(e.target.value)}>
                <option value="">-- Choisir --</option>
                {filtered.map(emp=><option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>)}
              </select>
            </div>
            <div style={{display:'flex',gap:'6px',marginBottom:'12px'}}>
              <button onClick={()=>setCopyTargetOffset(weekOffset+1)} style={{flex:1,padding:'6px',borderRadius:'6px',border:'1px solid '+(copyTargetOffset===weekOffset+1?C.purple:C.border),background:copyTargetOffset===weekOffset+1?C.purpleLight:'none',color:copyTargetOffset===weekOffset+1?C.purple:C.muted,cursor:'pointer',fontSize:'11px',fontFamily:'inherit'}}>S. suivante</button>
              <button onClick={()=>setCopyTargetOffset(weekOffset+2)} style={{flex:1,padding:'6px',borderRadius:'6px',border:'1px solid '+(copyTargetOffset===weekOffset+2?C.purple:C.border),background:copyTargetOffset===weekOffset+2?C.purpleLight:'none',color:copyTargetOffset===weekOffset+2?C.purple:C.muted,cursor:'pointer',fontSize:'11px',fontFamily:'inherit'}}>Dans 2 sem.</button>
            </div>
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={()=>setCopyModal(false)} style={{flex:1,background:'none',border:'1px solid '+C.border,borderRadius:'6px',padding:'8px',color:C.muted,cursor:'pointer',fontSize:'12px',fontFamily:'inherit'}}>Annuler</button>
              <button onClick={copyWeek} style={{flex:1,background:C.purple,border:'none',borderRadius:'6px',padding:'8px',color:'#fff',cursor:'pointer',fontSize:'12px',fontFamily:'inherit',fontWeight:600}}>Copier</button>
            </div>
          </div>
        </div>
      )}

      {toast&&<div style={{position:'fixed',bottom:'24px',right:'24px',background:C.card,border:'1px solid '+C.green,borderRadius:'8px',padding:'10px 16px',fontSize:'12px',color:C.green,zIndex:200,boxShadow:'0 4px 12px '+C.shadow}}>{toast}</div>}
    </div>
  );
}
