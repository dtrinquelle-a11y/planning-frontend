import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useTheme } from '../ThemeContext';

const API = 'https://mon-planning-production.up.railway.app/api';
const SHIFTS = [
  { id: 'matin', label: 'Matin', bg: '#EEF2FF', border: '#7C6FCD', text: '#4338CA' },
  { id: 'apres_midi', label: 'Apres-midi', bg: '#F0FDF4', border: '#2DB87A', text: '#166534' },
  { id: 'journee', label: 'Journee', bg: '#FFFBEB', border: '#F5A623', text: '#92400E' },
  { id: 'soir', label: 'Soir', bg: '#FEF2F2', border: '#E85D5D', text: '#991B1B' },
  { id: 'custom', label: 'Personnalise', bg: '#EFF6FF', border: '#3B82F6', text: '#1E40AF' },
];
const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const months = ['jan','fev','mars','avr','mai','juin','juil','aout','sep','oct','nov','dec'];
const AVATAR_COLORS = ['#7C6FCD','#2DB87A','#F5A623','#E85D5D','#5B9BD5','#F090D0'];
function fmtDate(d){const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
function addDays(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r;}
function getMonday(offset){const now=new Date();const day=now.getDay();const diff=now.getDate()-day+(day===0?-6:1)+offset*7;const mon=new Date(now);mon.setDate(diff);mon.setHours(0,0,0,0);return mon;}
function initials(f,l){return(f?.[0]||'')+(l?.[0]||'');}

export default function EspaceSalarie() {
  const { colors: C } = useTheme();
  const [employees,setEmployees]=useState([]);
  const [selectedEmp,setSelectedEmp]=useState(null);
  const [tab,setTab]=useState('planning');
  const [weekOffset,setWeekOffset]=useState(0);
  const [shifts,setShifts]=useState([]);
  const [modulation,setModulation]=useState(null);
  const mon=getMonday(weekOffset);
  const endMon=addDays(mon,6);
  const weekLabel=mon.getDate()+' '+months[mon.getMonth()]+' -> '+endMon.getDate()+' '+months[endMon.getMonth()];

  useEffect(()=>{axios.get(API+'/employees').then(r=>{setEmployees(r.data);if(r.data.length>0)setSelectedEmp(r.data[0]);}).catch(()=>{});},[]);
  useEffect(()=>{if(!selectedEmp)return;axios.get(API+'/schedules?week='+fmtDate(mon)).then(r=>{setShifts(r.data.filter(s=>s.employee_id===selectedEmp.id));}).catch(()=>{});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selectedEmp,weekOffset]);
  useEffect(()=>{if(!selectedEmp)return;axios.get(API+'/timeclock/modulation/'+selectedEmp.id).then(r=>setModulation(r.data)).catch(()=>{});},[selectedEmp]);

  function getShiftForDay(dayIdx){const date=fmtDate(addDays(mon,dayIdx));return shifts.find(s=>s.work_date&&s.work_date.slice(0,10)===date);}
  function getNextShift(){const today=new Date();today.setHours(0,0,0,0);for(let i=0;i<14;i++){const d=addDays(today,i);const date=fmtDate(d);const found=shifts.find(s=>s.work_date&&s.work_date.slice(0,10)===date);if(found)return{shift:found,date:d,daysAway:i};}return null;}
  function calcH(){return shifts.reduce((t,s)=>{if(!s.start_time||!s.end_time)return t;const[sh,sm]=s.start_time.slice(0,5).split(':').map(Number);const[eh,em]=s.end_time.slice(0,5).split(':').map(Number);return t+(eh*60+em-sh*60-sm)/60;},0);}

  if(!selectedEmp)return<div style={{minHeight:'100vh',background:C.bg,display:'flex',alignItems:'center',justifyContent:'center',color:C.muted,fontFamily:'inherit'}}>Chargement...</div>;

  const nextShift=getNextShift();
  const heuresPlanifiees=calcH();
  const heuresRealisees=modulation?parseFloat(modulation.heures_travaillees||0):0;
  const heuresPlanifieesAnnuelles=modulation?parseFloat(modulation.heures_planifiees||0):0;
  const empIdx=employees.findIndex(e=>e.id===selectedEmp.id);
  const avatarColor=AVATAR_COLORS[empIdx%AVATAR_COLORS.length]||C.purple;
  const modulationPct=modulation?Math.min((heuresRealisees/parseFloat(modulation.seuil_legal))*100,100):0;
  const modulationColor=modulation?.statut==='majoration_50'?C.red:modulation?.statut==='majoration_25'?C.amber:C.green;
  const inp={width:'100%',background:C.bg,border:'1px solid '+C.border,borderRadius:'6px',padding:'8px 10px',color:C.text,fontSize:'13px',fontFamily:'inherit',boxSizing:'border-box'};

  return(
    <div style={{minHeight:'100vh',background:C.bg,color:C.text,fontFamily:"'DM Mono','Courier New',monospace"}}>
      <div style={{background:C.card,borderBottom:'1px solid '+C.border,padding:'16px 20px',boxShadow:C.shadow+' 0 1px 4px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px',flexWrap:'wrap',gap:'10px'}}>
          <div style={{fontSize:'13px',fontWeight:600,color:C.text}}><span style={{color:C.purple}}>▸</span> MON PLANNING</div>
          <select style={{...inp,width:'auto',fontSize:'12px',padding:'5px 10px'}} value={selectedEmp.id} onChange={e=>setSelectedEmp(employees.find(em=>em.id===e.target.value))}>
            {employees.map(emp=><option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>)}
          </select>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'14px',padding:'12px',background:C.bg,borderRadius:'10px',marginBottom:'14px',border:'1px solid '+C.border}}>
          <div style={{width:'48px',height:'48px',borderRadius:'50%',background:avatarColor+'22',border:'1px solid '+avatarColor+'44',color:avatarColor,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px',fontWeight:600,flexShrink:0}}>{initials(selectedEmp.first_name,selectedEmp.last_name)}</div>
          <div>
            <div style={{fontSize:'15px',fontWeight:600,color:C.text}}>{selectedEmp.first_name} {selectedEmp.last_name}</div>
            <div style={{fontSize:'11px',color:C.muted}}>{selectedEmp.role} · {selectedEmp.service}</div>
            <div style={{fontSize:'10px',color:C.muted}}>{selectedEmp.contract_hours}h / semaine · {selectedEmp.contract_type}</div>
          </div>
        </div>
        {nextShift&&(
          <div style={{background:C.greenLight,border:'1px solid '+C.green+'44',borderRadius:'8px',padding:'10px 14px',display:'flex',alignItems:'center',gap:'12px',marginBottom:'14px'}}>
            <div style={{fontSize:'20px',color:C.green}}>→</div>
            <div>
              <div style={{fontSize:'10px',color:C.green,letterSpacing:'0.08em',marginBottom:'2px'}}>{nextShift.daysAway===0?"AUJOURD'HUI":nextShift.daysAway===1?'DEMAIN':'DANS '+nextShift.daysAway+' JOURS'}</div>
              <div style={{fontSize:'13px',fontWeight:500,color:C.text}}>{SHIFTS.find(s=>s.id===nextShift.shift.shift_type)?.label||'Creneau'} · {nextShift.shift.start_time?.slice(0,5)} – {nextShift.shift.end_time?.slice(0,5)}</div>
              {nextShift.shift.note&&<div style={{fontSize:'11px',color:C.muted,fontStyle:'italic',marginTop:'2px'}}>{nextShift.shift.note}</div>}
              <div style={{fontSize:'10px',color:C.muted}}>{nextShift.date.getDate()} {months[nextShift.date.getMonth()]}</div>
            </div>
          </div>
        )}
        <div style={{display:'flex',gap:'0',borderBottom:'1px solid '+C.border}}>
          {[{id:'planning',label:'Planning'},{id:'heures',label:'Mes heures'}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:'8px 16px',background:'none',border:'none',borderBottom:'2px solid '+(tab===t.id?C.purple:'transparent'),color:tab===t.id?C.purple:C.muted,cursor:'pointer',fontSize:'11px',fontFamily:'inherit',letterSpacing:'0.06em',fontWeight:tab===t.id?600:400}}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{padding:'16px 20px',maxWidth:'700px',margin:'0 auto'}}>
        {tab==='planning'&&(
          <div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px'}}>
              <button onClick={()=>setWeekOffset(w=>w-1)} style={{background:'none',border:'1px solid '+C.border,borderRadius:'6px',color:C.text,cursor:'pointer',padding:'4px 10px',fontFamily:'inherit'}}>{'<'}</button>
              <span style={{fontSize:'12px',color:C.muted}}>{weekLabel}</span>
              <button onClick={()=>setWeekOffset(w=>w+1)} style={{background:'none',border:'1px solid '+C.border,borderRadius:'6px',color:C.text,cursor:'pointer',padding:'4px 10px',fontFamily:'inherit'}}>{'>'}</button>
            </div>
            <div style={{fontSize:'11px',color:C.muted,marginBottom:'10px'}}>{heuresPlanifiees.toFixed(1)}h planifiees cette semaine</div>
            <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
              {DAYS.map((d,di)=>{
                const day=addDays(mon,di);const shift=getShiftForDay(di);const shDef=shift?SHIFTS.find(s=>s.id===shift.shift_type):null;const isToday=fmtDate(day)===fmtDate(new Date());
                return(
                  <div key={di} style={{display:'flex',alignItems:'center',gap:'12px',padding:'10px 14px',background:isToday?C.purpleLight:C.card,border:'1px solid '+(isToday?C.purple+'44':C.border),borderRadius:'8px',boxShadow:C.shadow+' 0 1px 4px'}}>
                    <div style={{minWidth:'70px'}}>
                      <div style={{fontSize:'11px',color:isToday?C.purple:C.muted}}>{d}</div>
                      <div style={{fontSize:'16px',fontWeight:600,color:isToday?C.purple:C.text}}>{day.getDate()}</div>
                    </div>
                    {shift&&shDef?(
                      <div style={{flex:1}}>
                        <div style={{display:'inline-block',padding:'2px 10px',borderRadius:'20px',background:shDef.bg,border:'1px solid '+shDef.border,color:shDef.text,fontSize:'11px',fontWeight:500,marginBottom:'3px'}}>{shDef.label}</div>
                        <div style={{fontSize:'12px',color:C.text}}>{shift.start_time?.slice(0,5)} – {shift.end_time?.slice(0,5)}</div>
                        {shift.note&&<div style={{fontSize:'11px',color:C.muted,fontStyle:'italic',marginTop:'2px'}}>{shift.note}</div>}
                        {shift.is_published&&<div style={{fontSize:'10px',color:C.green,marginTop:'2px'}}>Publie</div>}
                      </div>
                    ):(
                      <div style={{flex:1,fontSize:'12px',color:C.muted}}>Repos</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {tab==='heures'&&(
          <div>
            <div style={{fontSize:'11px',color:C.muted,letterSpacing:'0.08em',marginBottom:'14px'}}>MES HEURES · CC HPA</div>
            <div style={{background:C.card,border:'1px solid '+C.border,borderRadius:'10px',padding:'16px',marginBottom:'12px',boxShadow:C.shadow+' 0 2px 8px'}}>
              <div style={{fontSize:'11px',color:C.muted,letterSpacing:'0.08em',marginBottom:'12px'}}>MODULATION ANNUELLE</div>
              <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',marginBottom:'10px'}}>
                <div><div style={{fontSize:'32px',fontWeight:600,color:modulationColor,lineHeight:1}}>{heuresRealisees.toFixed(1)}h</div><div style={{fontSize:'11px',color:C.muted,marginTop:'4px'}}>realisees</div></div>
                <div style={{textAlign:'right'}}><div style={{fontSize:'16px',fontWeight:500,color:C.muted}}>/ {modulation?.seuil_legal||1607}h</div><div style={{fontSize:'10px',color:C.muted,marginTop:'2px'}}>seuil CC HPA</div></div>
              </div>
              <div style={{height:'8px',background:C.border,borderRadius:'4px',overflow:'hidden',marginBottom:'8px'}}><div style={{height:'8px',width:modulationPct+'%',background:modulationColor,borderRadius:'4px',transition:'width 0.6s ease'}}/></div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:'10px',color:C.muted}}>
                <span>0h</span><span style={{color:modulationColor,fontWeight:500}}>{modulation?.statut==='normal'?'Normal':modulation?.statut==='majoration_25'?'Majoration 25%':'Majoration 50%'}</span><span>1607h</span>
              </div>
              <div style={{fontSize:'10px',color:C.muted,marginTop:'8px',borderTop:'1px solid '+C.border,paddingTop:'8px'}}>Periode : {modulation?.period_start?.slice(0,10)} → {modulation?.period_end?.slice(0,10)}</div>
            </div>
            <div style={{background:C.card,border:'1px solid '+C.border,borderRadius:'10px',padding:'16px',marginBottom:'12px',boxShadow:C.shadow+' 0 2px 8px'}}>
              <div style={{fontSize:'11px',color:C.muted,letterSpacing:'0.08em',marginBottom:'14px'}}>REALISE VS PLANIFIE</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
                <div style={{textAlign:'center',padding:'14px',background:C.greenLight,border:'1px solid '+C.green+'44',borderRadius:'8px'}}>
                  <div style={{fontSize:'26px',fontWeight:600,color:C.green}}>{heuresRealisees.toFixed(1)}h</div>
                  <div style={{fontSize:'10px',color:C.muted,marginTop:'4px',letterSpacing:'0.06em'}}>REALISEES</div>
                </div>
                <div style={{textAlign:'center',padding:'14px',background:C.purpleLight,border:'1px solid '+C.purple+'44',borderRadius:'8px'}}>
                  <div style={{fontSize:'26px',fontWeight:600,color:C.purple}}>{heuresPlanifieesAnnuelles.toFixed(1)}h</div>
                  <div style={{fontSize:'10px',color:C.muted,marginTop:'4px',letterSpacing:'0.06em'}}>PLANIFIEES</div>
                </div>
              </div>
              {heuresPlanifieesAnnuelles>0&&<div style={{marginTop:'12px',fontSize:'12px',color:C.muted,textAlign:'center'}}>{heuresRealisees>heuresPlanifieesAnnuelles?<span style={{color:C.amber}}>+{(heuresRealisees-heuresPlanifieesAnnuelles).toFixed(1)}h au-dessus</span>:<span>{(heuresPlanifieesAnnuelles-heuresRealisees).toFixed(1)}h restantes</span>}</div>}
            </div>
            <div style={{background:C.card,border:'1px solid '+C.border,borderRadius:'10px',padding:'16px',boxShadow:C.shadow+' 0 2px 8px'}}>
              <div style={{fontSize:'11px',color:C.muted,letterSpacing:'0.08em',marginBottom:'10px'}}>CETTE SEMAINE</div>
              <div style={{fontSize:'24px',fontWeight:600,color:C.purple}}>{heuresPlanifiees.toFixed(1)}h</div>
              <div style={{fontSize:'11px',color:C.muted,marginTop:'4px'}}>planifiees · {shifts.length} creneau(x)</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
