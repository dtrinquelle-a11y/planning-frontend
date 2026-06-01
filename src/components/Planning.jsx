import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useTheme } from '../ThemeContext';

const API = 'https://mon-planning-production.up.railway.app/api';
const SERVICES = ['Accueil', 'Housekeeping', 'Technique', 'Restauration'];
const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const SHIFTS = [
  { id: 'matin', label: 'Matin', start: '07:00', end: '13:00', bg: '#EEF2FF', border: '#7C6FCD', text: '#4338CA' },
  { id: 'apres_midi', label: 'Apres-midi', start: '13:00', end: '19:00', bg: '#F0FDF4', border: '#2DB87A', text: '#166534' },
  { id: 'journee', label: 'Journee', start: '09:00', end: '17:00', bg: '#FFFBEB', border: '#F5A623', text: '#92400E' },
  { id: 'soir', label: 'Soir', start: '18:00', end: '23:30', bg: '#FEF2F2', border: '#E85D5D', text: '#991B1B' },
  { id: 'custom', label: 'Personnalise', start: '08:00', end: '16:00', bg: '#EFF6FF', border: '#3B82F6', text: '#1E40AF' },
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

function calcHeuresEmp(empId, shifts) {
  return Object.entries(shifts)
    .filter(([k]) => k.startsWith(empId + '-'))
    .reduce((acc, [, s]) => {
      if (!s.start_time || !s.end_time) return acc;
      const [sh, sm] = s.start_time.slice(0,5).split(':').map(Number);
      const [eh, em] = s.end_time.slice(0,5).split(':').map(Number);
      return acc + (eh*60+em - sh*60-sm) / 60;
    }, 0);
}

export default function Planning() {
  const { colors: C } = useTheme();
  const [service, setService] = useState('Accueil');
  const [weekOffset, setWeekOffset] = useState(0);
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState({});
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [dupDays, setDupDays] = useState([]);
  const [toast, setToast] = useState('');
  const [hovered, setHovered] = useState(null);
  const [dragSrc, setDragSrc] = useState(null);
  const [copyModal, setCopyModal] = useState(false);
  const [copyEmpId, setCopyEmpId] = useState('');
  const [copyTargetOffset, setCopyTargetOffset] = useState(1);
  const toastTimer = useRef(null);
  const mon = getMonday(weekOffset);
  const today = new Date(); today.setHours(0,0,0,0);

  useEffect(() => { axios.get(API+'/employees').then(r=>setEmployees(r.data)).catch(()=>{}); }, []);
  useEffect(() => {
    axios.get(API+'/schedules?week='+fmtDate(mon)).then(r=>{
      const map={}; r.data.forEach(s=>{const dk=s.work_date?s.work_date.slice(0,10):'';map[s.employee_id+'-'+dk]=s;}); setShifts(map);
    }).catch(()=>{});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  const filtered = employees.filter(e =>
    e.service === service ||
    (e.services_secondaires && e.services_secondaires.split(',').map(s=>s.trim()).includes(service))
  );

  function showToast(msg) { setToast(msg); clearTimeout(toastTimer.current); toastTimer.current=setTimeout(()=>setToast(''),2500); }

  function openModal(emp, dayIdx) {
    const date=fmtDate(addDays(mon,dayIdx)); const existing=shifts[emp.id+'-'+date];
    const sh=existing?SHIFTS.find(s=>s.id===existing.shift_type)||SHIFTS[0]:SHIFTS[0];
    setForm({ empId:emp.id, empName:emp.first_name+' '+emp.last_name, date, dayIdx, shiftId:sh.id, start:existing?existing.start_time.slice(0,5):sh.start, end:existing?existing.end_time.slice(0,5):sh.end, note:existing?.note||'', existingId:existing?existing.id:null });
    setDupDays([]); setModal('add');
  }

  async function saveShift() {
    try {
      let savedId=form.existingId;
      if(form.existingId){await axios.patch(API+'/schedules/'+form.existingId,{start_time:form.start,end_time:form.end,shift_type:form.shiftId,note:form.note||null});}
      else{const r=await axios.post(API+'/schedules',{employee_id:form.empId,work_date:form.date,start_time:form.start,end_time:form.end,shift_type:form.shiftId,break_minutes:0,note:form.note||null});savedId=r.data.id;}
      const newShifts={...shifts};
      newShifts[form.empId+'-'+form.date]={employee_id:form.empId,work_date:form.date,start_time:form.start,end_time:form.end,shift_type:form.shiftId,note:form.note||null,id:savedId};
      for(const di of dupDays){if(di===form.dayIdx)continue;const dd=fmtDate(addDays(mon,di));const ex=shifts[form.empId+'-'+dd];try{if(ex){await axios.patch(API+'/schedules/'+ex.id,{start_time:form.start,end_time:form.end,shift_type:form.shiftId,note:form.note||null});newShifts[form.empId+'-'+dd]={...ex,start_time:form.start,end_time:form.end,shift_type:form.shiftId,note:form.note||null};}else{const r=await axios.post(API+'/schedules',{employee_id:form.empId,work_date:dd,start_time:form.start,end_time:form.end,shift_type:form.shiftId,break_minutes:0,note:form.note||null});newShifts[form.empId+'-'+dd]=r.data;}}catch(err){}}
      setShifts(newShifts); setModal(null);
      showToast('Enregistre'+(dupDays.filter(d=>d!==form.dayIdx).length>0?' + '+dupDays.filter(d=>d!==form.dayIdx).length+' copie(s)':''));
    } catch(err){showToast('Erreur : '+(err.response?.data?.error||err.message));}
  }

  async function deleteShift(e,shiftId,key){e.stopPropagation();try{await axios.delete(API+'/schedules/'+shiftId);setShifts(prev=>{const n={...prev};delete n[key];return n;});showToast('Supprime');}catch{showToast('Erreur');}}
  async function publishWeek(){try{const r=await axios.post(API+'/schedules/publish',{week:fmtDate(mon)});showToast(r.data.published+' creneau(x) publie(s)');}catch{showToast('Erreur');}}
  async function copyWeek(){if(!copyEmpId){showToast('Selectionne un salarie');return;}const tm=getMonday(copyTargetOffset);const es=Object.entries(shifts).filter(([k])=>k.startsWith(copyEmpId+'-'));if(!es.length){showToast('Aucun creneau');return;}let cp=0;for(const[k,sh]of es){const sd=new Date(k.split('-').slice(1).join('-'));const di=(sd.getDay()+6)%7;const dd=fmtDate(addDays(tm,di));try{await axios.post(API+'/schedules',{employee_id:copyEmpId,work_date:dd,start_time:sh.start_time,end_time:sh.end_time,shift_type:sh.shift_type,break_minutes:0,note:sh.note||null});cp++;}catch{}}setCopyModal(false);showToast(cp+' creneau(x) copies');}
  function toggleDupDay(di){setDupDays(prev=>prev.includes(di)?prev.filter(d=>d!==di):[...prev,di]);}
  function onDragStart(e,key,shift){setDragSrc({key,shift});e.dataTransfer.effectAllowed='move';}
  function onDragOver(e){e.preventDefault();}
  async function onDrop(e,empId,dayIdx){e.preventDefault();if(!dragSrc)return;const nd=fmtDate(addDays(mon,dayIdx));const nk=empId+'-'+nd;if(dragSrc.key===nk)return;try{await axios.patch(API+'/schedules/'+dragSrc.shift.id,{work_date:nd,employee_id:empId});setShifts(prev=>{const n={...prev};delete n[dragSrc.key];n[nk]={...dragSrc.shift,work_date:nd,employee_id:empId};return n;});showToast('Deplace');}catch{showToast('Erreur');}setDragSrc(null);}

  const endMon=addDays(mon,6);
  const weekLabel=mon.getDate()+' '+months[mon.getMonth()]+' -> '+endMon.getDate()+' '+months[endMon.getMonth()]+' '+endMon.getFullYear();
  const inp={width:'100%',background:C.bg,border:'1px solid '+C.border,borderRadius:'6px',padding:'6px 8px',color:C.text,fontSize:'12px',fontFamily:'inherit'};
  const lbl={display:'block',fontSize:'10px',color:C.muted,letterSpacing:'0.08em',marginBottom:'4px'};

  // Légende seuils CC HPA
  const legendItems = [
    { color: C.green, label: '≤ contrat' },
    { color: C.purple, label: '> contrat' },
    { color: C.amber, label: '> 44h ⚠️' },
    { color: C.red, label: '> 48h 🚨' },
  ];

  return (
    <div style={{minHeight:'100vh',background:C.bg,color:C.text,fontFamily:"'DM Mono','Courier New',monospace"}}>
      <div style={{borderBottom:'1px solid '+C.border,padding:'14px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',background:C.card,flexWrap:'wrap',gap:'10px'}}>
        <div style={{display:'flex',gap:'6px',flexWrap:'wrap',alignItems:'center'}}>
          {SERVICES.map(sv=>(
            <button key={sv} style={{padding:'5px 14px',borderRadius:'6px',border:'1px solid '+(service===sv?C.purple:C.border),background:service===sv?C.purpleLight:'none',color:service===sv?C.purple:C.muted,cursor:'pointer',fontSize:'11px',fontFamily:'inherit'}} onClick={()=>setService(sv)}>{sv}</button>
          ))}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
          <button onClick={()=>setWeekOffset(w=>w-1)} style={{background:'none',border:'1px solid '+C.border,borderRadius:'6px',color:C.text,cursor:'pointer',padding:'4px 10px',fontSize:'13px',fontFamily:'inherit'}}>{'<'}</button>
          <span style={{fontSize:'12px',minWidth:'200px',textAlign:'center',color:C.text}}>{weekLabel}</span>
          <button onClick={()=>setWeekOffset(w=>w+1)} style={{background:'none',border:'1px solid '+C.border,borderRadius:'6px',color:C.text,cursor:'pointer',padding:'4px 10px',fontSize:'13px',fontFamily:'inherit'}}>{'>'}</button>
          <button onClick={()=>setWeekOffset(0)} style={{background:'none',border:'1px solid '+C.border,borderRadius:'6px',color:C.muted,cursor:'pointer',padding:'4px 10px',fontSize:'11px',fontFamily:'inherit'}}>Auj.</button>
          <button onClick={()=>{setCopyEmpId(filtered[0]?.id||'');setCopyTargetOffset(weekOffset+1);setCopyModal(true);}} style={{background:C.amberLight,border:'1px solid '+C.amber+'66',borderRadius:'6px',padding:'6px 14px',color:C.amber,cursor:'pointer',fontSize:'11px',fontFamily:'inherit',fontWeight:600}}>Copier</button>
          <button onClick={publishWeek} style={{background:C.green,border:'none',borderRadius:'6px',padding:'6px 14px',color:'#fff',cursor:'pointer',fontSize:'11px',fontFamily:'inherit',fontWeight:600}}>Publier</button>
        </div>
      </div>

      {/* Légende seuils */}
      <div style={{padding:'8px 24px',background:C.card,borderBottom:'1px solid '+C.border,display:'flex',gap:'16px',alignItems:'center',flexWrap:'wrap'}}>
        <span style={{fontSize:'10px',color:C.muted,letterSpacing:'0.08em'}}>SEUILS CC HPA :</span>
        {legendItems.map(item=>(
          <div key={item.label} style={{display:'flex',alignItems:'center',gap:'5px',fontSize:'11px',color:C.muted}}>
            <div style={{width:'10px',height:'10px',borderRadius:'50%',background:item.color,flexShrink:0}}/>
            {item.label}
          </div>
        ))}
        <span style={{fontSize:'10px',color:C.muted,marginLeft:'auto'}}>Contrat individuel · Max légal 48h/sem</span>
      </div>

      <div style={{padding:'20px 24px'}}>
        {filtered.length===0?(
          <div style={{color:C.muted,textAlign:'center',padding:'60px',fontSize:'13px'}}>Aucun salarie dans le service {service}</div>
        ):(
          <div style={{border:'1px solid '+C.border,borderRadius:'10px',overflow:'hidden',boxShadow:'0 2px 8px '+C.shadow}}>
            <div style={{display:'grid',gridTemplateColumns:'130px repeat(7, 1fr)',background:C.card,borderBottom:'1px solid '+C.border}}>
              <div style={{padding:'8px',borderRight:'1px solid '+C.border}}></div>
              {DAYS.map((d,i)=>{const day=addDays(mon,i);const isToday=day.getTime()===today.getTime();return(
                <div key={i} style={{padding:'8px 4px',textAlign:'center',fontSize:'10px',color:isToday?C.purple:C.muted,borderRight:i<6?'1px solid '+C.border:'none'}}>
                  {d}<span style={{fontSize:'16px',fontWeight:600,display:'block',color:isToday?C.purple:C.text}}>{day.getDate()}</span>
                </div>
              );})}
            </div>

            {filtered.map((emp,ei)=>{
              const totalH = calcHeuresEmp(emp.id, shifts);
              const contractH = parseFloat(emp.contract_hours) || 35;
              const heuresColor = totalH > 48 ? C.red : totalH > 44 ? C.amber : totalH > contractH ? C.purple : C.green;
              const isMultiService = emp.service !== service;

              return(
                <div key={emp.id} style={{display:'grid',gridTemplateColumns:'130px repeat(7, 1fr)',borderBottom:ei<filtered.length-1?'1px solid '+C.border:'none'}}>
                  <div style={{padding:'8px',borderRight:'1px solid '+C.border,display:'flex',alignItems:'center',gap:'8px',background:C.card}}>
                    <div style={{position:'relative',flexShrink:0}}>
                      <div style={{width:'30px',height:'30px',borderRadius:'50%',background:AVATAR_COLORS[ei%AVATAR_COLORS.length]+'22',border:'1px solid '+AVATAR_COLORS[ei%AVATAR_COLORS.length]+'44',color:AVATAR_COLORS[ei%AVATAR_COLORS.length],display:'flex',alignItems:'center',justifyContent:'center',fontSize:'10px',fontWeight:600}}>
                        {initials(emp.first_name,emp.last_name)}
                      </div>
                      {isMultiService&&<div title={'Service principal : '+emp.service} style={{position:'absolute',bottom:'-2px',right:'-2px',width:'10px',height:'10px',borderRadius:'50%',background:C.amber,border:'1px solid '+C.card,fontSize:'6px',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff'}}>M</div>}
                    </div>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:'11px',fontWeight:500,lineHeight:1.2,color:C.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{emp.first_name}<br/>{emp.last_name}</div>
                      <div style={{fontSize:'9px',color:C.muted}}>{emp.role}</div>
                      {totalH > 0 ? (
                        <div style={{fontSize:'9px',fontWeight:700,color:heuresColor,marginTop:'2px',display:'flex',alignItems:'center',gap:'3px'}}>
                          <div style={{width:'6px',height:'6px',borderRadius:'50%',background:heuresColor,flexShrink:0}}/>
                          {totalH.toFixed(1)}h / {contractH}h
                        </div>
                      ) : (
                        <div style={{fontSize:'9px',color:C.border,marginTop:'2px'}}>{contractH}h contrat</div>
                      )}
                    </div>
                  </div>

                  {DAYS.map((_,di)=>{
                    const date=fmtDate(addDays(mon,di));const key=emp.id+'-'+date;const shift=shifts[key];const shDef=shift?SHIFTS.find(s=>s.id===shift.shift_type):null;
                    return(
                      <div key={di} style={{padding:'3px',minHeight:'62px',borderRight:di<6?'1px solid '+C.border:'none',cursor:'pointer',background:hovered===key+'c'?C.borderLight:'transparent'}}
                        onClick={()=>openModal(emp,di)} onMouseEnter={()=>setHovered(key+'c')} onMouseLeave={()=>setHovered(null)} onDragOver={onDragOver} onDrop={e=>onDrop(e,emp.id,di)}>
                        {shift&&shDef?(
                          <div draggable onDragStart={e=>{e.stopPropagation();onDragStart(e,key,shift);}} onMouseEnter={()=>setHovered(key)} onMouseLeave={()=>setHovered(key+'c')} onClick={e=>e.stopPropagation()}
                            style={{borderRadius:'5px',padding:'3px 6px',fontSize:'10px',fontWeight:500,background:shDef.bg,border:'1px solid '+shDef.border,color:shDef.text,cursor:'grab',position:'relative',lineHeight:1.3}}>
                            {shDef.label}
                            <div style={{fontSize:'9px',opacity:0.75}}>{shift.start_time?shift.start_time.slice(0,5):''}–{shift.end_time?shift.end_time.slice(0,5):''}</div>
                            {shift.note&&<div style={{fontSize:'9px',opacity:0.9,marginTop:'2px',fontStyle:'italic',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{shift.note}</div>}
                            <button onClick={e=>deleteShift(e,shift.id,key)} style={{position:'absolute',top:'2px',right:'3px',background:'none',border:'none',color:'inherit',cursor:'pointer',fontSize:'10px',opacity:hovered===key?1:0,transition:'opacity .15s',padding:'0 2px',fontFamily:'inherit'}}>x</button>
                          </div>
                        ):(
                          <div style={{fontSize:'18px',color:C.border,textAlign:'center',paddingTop:'10px',opacity:hovered===key+'c'?1:0}}>+</div>
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

      {modal==='add'&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}} onClick={()=>setModal(null)}>
          <div style={{background:C.card,border:'1px solid '+C.border,borderRadius:'12px',padding:'20px',width:'300px',boxShadow:'0 8px 32px '+C.shadow}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:'13px',fontWeight:600,marginBottom:'2px',color:C.text}}>{form.empName}</div>
            <div style={{fontSize:'11px',color:C.muted,marginBottom:'14px'}}>{form.date}</div>
            <div style={{marginBottom:'10px'}}><label style={lbl}>TYPE</label>
              <select style={inp} value={form.shiftId} onChange={e=>{const sh=SHIFTS.find(s=>s.id===e.target.value);setForm(f=>({...f,shiftId:e.target.value,start:sh.start,end:sh.end}));}}>
                {SHIFTS.map(sh=><option key={sh.id} value={sh.id}>{sh.label} ({sh.start}-{sh.end})</option>)}
              </select>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'10px'}}>
              <div><label style={lbl}>DEBUT</label><input type="time" style={inp} value={form.start} onChange={e=>setForm(f=>({...f,start:e.target.value}))}/></div>
              <div><label style={lbl}>FIN</label><input type="time" style={inp} value={form.end} onChange={e=>setForm(f=>({...f,end:e.target.value}))}/></div>
            </div>
            <div style={{marginBottom:'14px'}}><label style={lbl}>POSTE / NOTE (optionnel)</label>
              <input style={inp} placeholder="Ex: Service bar, Plonge..." value={form.note||''} onChange={e=>setForm(f=>({...f,note:e.target.value}))}/>
            </div>
            <div style={{marginBottom:'14px'}}><label style={{...lbl,marginBottom:'8px'}}>DUPLIQUER SUR</label>
              <div style={{display:'flex',gap:'5px',flexWrap:'wrap'}}>
                {DAYS.map((d,di)=>{const isOrigin=di===form.dayIdx;const checked=isOrigin||dupDays.includes(di);return(
                  <button key={di} onClick={()=>!isOrigin&&toggleDupDay(di)} style={{padding:'4px 8px',borderRadius:'5px',fontSize:'10px',fontFamily:'inherit',cursor:isOrigin?'default':'pointer',border:'1px solid '+(checked?C.purple:C.border),background:checked?C.purpleLight:'none',color:checked?C.purple:C.muted,opacity:isOrigin?0.5:1}}>{d}</button>
                );})}
              </div>
              <div style={{fontSize:'10px',color:C.muted,marginTop:'5px'}}>{dupDays.filter(d=>d!==form.dayIdx).length>0?dupDays.filter(d=>d!==form.dayIdx).length+' jour(s)':'Cliquer pour dupliquer'}</div>
            </div>
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={()=>setModal(null)} style={{flex:1,background:'none',border:'1px solid '+C.border,borderRadius:'6px',padding:'8px',color:C.muted,cursor:'pointer',fontSize:'12px',fontFamily:'inherit'}}>Annuler</button>
              <button onClick={saveShift} style={{flex:1,background:C.purple,border:'none',borderRadius:'6px',padding:'8px',color:'#fff',cursor:'pointer',fontSize:'12px',fontFamily:'inherit',fontWeight:600}}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

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
            <div style={{marginBottom:'12px'}}><label style={lbl}>DESTINATION</label>
              <div style={{display:'flex',gap:'6px',marginBottom:'8px'}}>
                <button onClick={()=>setCopyTargetOffset(weekOffset+1)} style={{flex:1,padding:'6px',borderRadius:'6px',border:'1px solid '+(copyTargetOffset===weekOffset+1?C.purple:C.border),background:copyTargetOffset===weekOffset+1?C.purpleLight:'none',color:copyTargetOffset===weekOffset+1?C.purple:C.muted,cursor:'pointer',fontSize:'11px',fontFamily:'inherit'}}>S. suivante</button>
                <button onClick={()=>setCopyTargetOffset(weekOffset+2)} style={{flex:1,padding:'6px',borderRadius:'6px',border:'1px solid '+(copyTargetOffset===weekOffset+2?C.purple:C.border),background:copyTargetOffset===weekOffset+2?C.purpleLight:'none',color:copyTargetOffset===weekOffset+2?C.purple:C.muted,cursor:'pointer',fontSize:'11px',fontFamily:'inherit'}}>Dans 2 sem.</button>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                <label style={{...lbl,marginBottom:0,whiteSpace:'nowrap'}}>OU DANS</label>
                <input type="number" min="1" max="52" value={copyTargetOffset-weekOffset} onChange={e=>setCopyTargetOffset(weekOffset+parseInt(e.target.value||1))} style={{...inp,width:'60px'}}/>
                <span style={{fontSize:'11px',color:C.muted}}>sem.</span>
              </div>
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
