import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useTheme } from '../ThemeContext';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import supabase from '../supabase';
import { ABSENCE_TYPES, ABSENCE_STATUS, absenceType, absencePeriod, absenceDays } from '../absences';

// Types de documents (memes que l'ecran Documents cote manager), dans l'ordre d'affichage
const DOC_GROUPS = [
  { id: 'bulletin_paie', label: 'Bulletins de paie', icon: '💰' },
  { id: 'contrat', label: 'Contrats', icon: '📄' },
  { id: 'avenant', label: 'Avenants', icon: '📝' },
  { id: 'attestation', label: 'Attestations', icon: '✅' },
  { id: 'certificat', label: 'Certificats', icon: '🏅' },
  { id: 'autre', label: "Dossier d'embauche et autres", icon: '📎' },
];
const MOIS = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Aout','Septembre','Octobre','Novembre','Decembre'];
// "2026-05" -> "Mai 2026" (sinon texte tel quel)
function formatPeriode(p){const m=/^(\d{4})-(\d{2})$/.exec(p||'');return m?MOIS[parseInt(m[2],10)-1]+' '+m[1]:(p||'');}

const API = 'https://mon-planning-production.up.railway.app/api';
const SHIFTS = [
  { id: 'matin', label: 'Matin', bg: '#EEF2FF', border: '#7C6FCD', text: '#4338CA' },
  { id: 'apres_midi', label: 'Apres-midi', bg: '#F0FDF4', border: '#2DB87A', text: '#166534' },
  { id: 'journee', label: 'Journee', bg: '#FFFBEB', border: '#F5A623', text: '#92400E' },
  { id: 'soir', label: 'Soir', bg: '#FEF2F2', border: '#E85D5D', text: '#991B1B' },
  { id: 'custom', label: 'Personnalise', bg: '#EFF6FF', border: '#3B82F6', text: '#1E40AF' },
  { id: 'repos', label: 'Repos', bg: '#F3F4F6', border: '#9CA3AF', text: '#6B7280' },
];
const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const months = ['jan','fev','mars','avr','mai','juin','juil','aout','sep','oct','nov','dec'];
const AVATAR_COLORS = ['#7C6FCD','#2DB87A','#F5A623','#E85D5D','#5B9BD5','#F090D0'];
function fmtDate(d){const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
function addDays(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r;}
function getMonday(offset){const now=new Date();const day=now.getDay();const diff=now.getDate()-day+(day===0?-6:1)+offset*7;const mon=new Date(now);mon.setDate(diff);mon.setHours(0,0,0,0);return mon;}
function initials(f,l){return(f?.[0]||'')+(l?.[0]||'');}

export default function EspaceSalarie({ profile }) {
  const { colors: C } = useTheme();
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';
  const ownEmployee = profile?.employees || null;
  const [employees,setEmployees]=useState([]);
  const [selectedEmp,setSelectedEmp]=useState(null);
  const [tab,setTab]=useState('planning');
  const [weekOffset,setWeekOffset]=useState(0);
  const [shifts,setShifts]=useState([]);
  const [modulation,setModulation]=useState(null);
  const [docs,setDocs]=useState([]);
  const [docsLoading,setDocsLoading]=useState(false);
  const [absences,setAbsences]=useState([]);
  const [absForm,setAbsForm]=useState({type:'conge_paye',start_date:'',end_date:'',comment:''});
  const [absSaving,setAbsSaving]=useState(false);
  const [absMsg,setAbsMsg]=useState(null);
  const [exportingPDF,setExportingPDF]=useState(false);
  const planningRef = useRef(null);
  const mon=getMonday(weekOffset);
  const endMon=addDays(mon,6);
  const weekLabel=mon.getDate()+' '+months[mon.getMonth()]+' -> '+endMon.getDate()+' '+months[endMon.getMonth()];

  // Un salarie ne voit que sa propre fiche ; seuls les managers peuvent choisir un autre salarie
  useEffect(()=>{
    if(!isManager){ if(ownEmployee){setEmployees([ownEmployee]);setSelectedEmp(ownEmployee);} return; }
    axios.get(API+'/employees').then(r=>{setEmployees(r.data);if(r.data.length>0)setSelectedEmp(r.data[0]);}).catch(()=>{});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[isManager, ownEmployee?.id]);
  useEffect(()=>{if(!selectedEmp)return;axios.get(API+'/schedules?week='+fmtDate(mon)).then(r=>{setShifts(r.data.filter(s=>s.employee_id===selectedEmp.id));}).catch(()=>{});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selectedEmp,weekOffset]);
  useEffect(()=>{if(!selectedEmp)return;axios.get(API+'/timeclock/modulation/'+selectedEmp.id).then(r=>setModulation(r.data)).catch(()=>{});},[selectedEmp]);

  // Documents du salarie (la base limite l'acces a 3 mois apres la fin du contrat)
  useEffect(()=>{
    if(tab!=='documents'||!selectedEmp)return;
    setDocsLoading(true);
    supabase.from('documents').select('*').eq('employee_id',selectedEmp.id).order('created_at',{ascending:false})
      .then(({data})=>setDocs(data||[])).finally(()=>setDocsLoading(false));
  },[tab,selectedEmp]);

  // Demandes d'absence du salarie
  function loadAbsences(){
    if(!selectedEmp)return;
    supabase.from('absence_requests').select('*').eq('employee_id',selectedEmp.id).order('start_date',{ascending:false}).then(({data})=>setAbsences(data||[]));
  }
  useEffect(()=>{if(tab==='absences')loadAbsences();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[tab,selectedEmp]);

  async function submitAbsence(){
    setAbsMsg(null);
    const f=absForm;
    if(!f.start_date){setAbsMsg({err:true,text:'Indiquez la date de debut.'});return;}
    const end=f.end_date||f.start_date;
    if(end<f.start_date){setAbsMsg({err:true,text:'La date de fin doit etre apres la date de debut.'});return;}
    setAbsSaving(true);
    try{
      const {data,error}=await supabase.from('absence_requests').insert({employee_id:selectedEmp.id,type:f.type,start_date:f.start_date,end_date:end,comment:f.comment.trim()||null}).select().single();
      if(error)throw error;
      axios.post(API+'/absences/notify',{request_id:data.id,event:'created'}).catch(()=>{});
      setAbsForm({type:'conge_paye',start_date:'',end_date:'',comment:''});
      setAbsMsg({err:false,text:'Demande envoyee : votre responsable a ete prevenu.'});
      loadAbsences();
    }catch(err){setAbsMsg({err:true,text:'Erreur : '+err.message});}
    finally{setAbsSaving(false);}
  }

  async function cancelAbsence(a){
    if(!window.confirm('Annuler cette demande ?'))return;
    const {error}=await supabase.from('absence_requests').update({status:'annulee'}).eq('id',a.id);
    if(error){setAbsMsg({err:true,text:'Erreur : '+error.message});return;}
    loadAbsences();
  }

  async function openDoc(doc){
    // Onglet ouvert tout de suite (sinon bloque sur mobile), puis redirige vers le lien temporaire
    const w=window.open('','_blank');
    const {data,error}=await supabase.storage.from('documents-rh').createSignedUrl(doc.file_path,60);
    if(error||!data){if(w)w.close();alert('Document indisponible.');return;}
    if(w)w.location.href=data.signedUrl;else window.location.href=data.signedUrl;
  }

  function getShiftsForDay(dayIdx){const date=fmtDate(addDays(mon,dayIdx));return shifts.filter(s=>s.work_date&&s.work_date.slice(0,10)===date).sort((a,b)=>(a.start_time||'').localeCompare(b.start_time||''));}
  function getNextShift(){const today=new Date();today.setHours(0,0,0,0);for(let i=0;i<14;i++){const d=addDays(today,i);const date=fmtDate(d);const found=shifts.filter(s=>s.work_date&&s.work_date.slice(0,10)===date&&s.shift_type!=='repos').sort((a,b)=>(a.start_time||'').localeCompare(b.start_time||''))[0];if(found)return{shift:found,date:d,daysAway:i};}return null;}
  // Heures nettes de la semaine : pauses deduites, creneau apres minuit gere (meme calcul que le planning manager)
  function calcH(){return shifts.reduce((t,s)=>{if(!s.start_time||!s.end_time||s.shift_type==='repos')return t;const[sh,sm]=s.start_time.slice(0,5).split(':').map(Number);const[eh,em]=s.end_time.slice(0,5).split(':').map(Number);let mins=eh*60+em-sh*60-sm;if(mins<0)mins+=24*60;return t+Math.max(0,mins-parseInt(s.break_minutes||0))/60;},0);}

  async function exportPDF() {
    if (!planningRef.current) return;
    setExportingPDF(true);
    try {
      const canvas = await html2canvas(planningRef.current, {
        scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const ratio = pdfWidth / canvas.width * 10;
      pdf.setFontSize(10);
      pdf.setTextColor(100);
      pdf.text('Planning de ' + (selectedEmp?.first_name||'') + ' ' + (selectedEmp?.last_name||'') + ' · ' + weekLabel, 14, 10);
      pdf.text('Le Bout du Monde · ' + new Date().toLocaleDateString('fr-FR'), pdfWidth - 14, 10, { align: 'right' });
      pdf.addImage(imgData, 'PNG', 14, 16, canvas.width * ratio / 10, canvas.height * ratio / 10);
      pdf.save('planning-' + (selectedEmp?.first_name||'').toLowerCase() + '-' + fmtDate(mon) + '.pdf');
    } catch (err) { console.error(err); }
    finally { setExportingPDF(false); }
  }

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
          {isManager&&(
            <select style={{...inp,width:'auto',fontSize:'12px',padding:'5px 10px'}} value={selectedEmp.id} onChange={e=>setSelectedEmp(employees.find(em=>em.id===e.target.value))}>
              {employees.map(emp=><option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>)}
            </select>
          )}
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
          {[{id:'planning',label:'Planning'},{id:'heures',label:'Mes heures'},{id:'absences',label:'Absences'},{id:'documents',label:'Mes documents'}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:'8px 16px',background:'none',border:'none',borderBottom:'2px solid '+(tab===t.id?C.purple:'transparent'),color:tab===t.id?C.purple:C.muted,cursor:'pointer',fontSize:'11px',fontFamily:'inherit',letterSpacing:'0.06em',fontWeight:tab===t.id?600:400}}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{padding:'16px 20px',maxWidth:'700px',margin:'0 auto'}}>
        {tab==='planning'&&(
          <div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px',flexWrap:'wrap',gap:'8px'}}>
              <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                <button onClick={()=>setWeekOffset(w=>w-1)} style={{background:'none',border:'1px solid '+C.border,borderRadius:'6px',color:C.text,cursor:'pointer',padding:'4px 10px',fontFamily:'inherit'}}>{'<'}</button>
                <span style={{fontSize:'12px',color:C.muted}}>{weekLabel}</span>
                <button onClick={()=>setWeekOffset(w=>w+1)} style={{background:'none',border:'1px solid '+C.border,borderRadius:'6px',color:C.text,cursor:'pointer',padding:'4px 10px',fontFamily:'inherit'}}>{'>'}</button>
              </div>
              <button onClick={exportPDF} disabled={exportingPDF}
                style={{background:C.purpleLight,border:'1px solid '+C.purple+'66',borderRadius:'6px',padding:'6px 14px',color:C.purple,cursor:exportingPDF?'not-allowed':'pointer',fontSize:'11px',fontFamily:'inherit',fontWeight:600,opacity:exportingPDF?0.7:1}}>
                {exportingPDF?'...':'↓ PDF'}
              </button>
            </div>
            <div style={{fontSize:'11px',color:C.muted,marginBottom:'10px'}}>{heuresPlanifiees.toFixed(1)}h planifiees cette semaine</div>

            <div ref={planningRef} style={{display:'flex',flexDirection:'column',gap:'6px'}}>
              {DAYS.map((d,di)=>{
                const day=addDays(mon,di);const dayShifts=getShiftsForDay(di);const isToday=fmtDate(day)===fmtDate(new Date());
                return(
                  <div key={di} style={{display:'flex',alignItems:'center',gap:'12px',padding:'10px 14px',background:isToday?C.purpleLight:C.card,border:'1px solid '+(isToday?C.purple+'44':C.border),borderRadius:'8px',boxShadow:C.shadow+' 0 1px 4px'}}>
                    <div style={{minWidth:'70px'}}>
                      <div style={{fontSize:'11px',color:isToday?C.purple:C.muted}}>{d}</div>
                      <div style={{fontSize:'16px',fontWeight:600,color:isToday?C.purple:C.text}}>{day.getDate()}</div>
                    </div>
                    {dayShifts.length>0?(
                      // Un jour peut avoir plusieurs creneaux (service coupe / double shift)
                      <div style={{flex:1,display:'flex',gap:'18px',flexWrap:'wrap'}}>
                        {dayShifts.map(shift=>{const shDef=SHIFTS.find(s=>s.id===shift.shift_type)||SHIFTS[4];return(
                          <div key={shift.id}>
                            <div style={{display:'inline-block',padding:'2px 10px',borderRadius:'20px',background:shDef.bg,border:'1px solid '+shDef.border,color:shDef.text,fontSize:'11px',fontWeight:500,marginBottom:'3px'}}>{shDef.label}</div>
                            {shift.shift_type !== 'repos' && <div style={{fontSize:'12px',color:C.text}}>{shift.start_time?.slice(0,5)} – {shift.end_time?.slice(0,5)}</div>}
                            {shift.note&&<div style={{fontSize:'11px',color:C.muted,fontStyle:'italic',marginTop:'2px'}}>{shift.note}</div>}
                            {shift.is_published&&<div style={{fontSize:'10px',color:C.green,marginTop:'2px'}}>Publie</div>}
                          </div>
                        );})}
                      </div>
                    ):(
                      <div style={{flex:1,fontSize:'12px',color:C.border}}>—</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {tab==='absences'&&(
          <div>
            <div style={{fontSize:'11px',color:C.muted,letterSpacing:'0.08em',marginBottom:'14px'}}>DEMANDER UNE ABSENCE</div>
            <div style={{background:C.card,border:'1px solid '+C.border,borderRadius:'10px',padding:'16px',marginBottom:'18px'}}>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:'10px',marginBottom:'10px'}}>
                <label style={{fontSize:'10px',color:C.muted}}>TYPE
                  <select style={{...inp,marginTop:'4px'}} value={absForm.type} onChange={e=>setAbsForm(f=>({...f,type:e.target.value}))}>
                    {ABSENCE_TYPES.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </label>
                <label style={{fontSize:'10px',color:C.muted}}>DU
                  <input type="date" style={{...inp,marginTop:'4px'}} value={absForm.start_date} onChange={e=>setAbsForm(f=>({...f,start_date:e.target.value}))}/>
                </label>
                <label style={{fontSize:'10px',color:C.muted}}>AU (inclus)
                  <input type="date" style={{...inp,marginTop:'4px'}} value={absForm.end_date} min={absForm.start_date||undefined} onChange={e=>setAbsForm(f=>({...f,end_date:e.target.value}))}/>
                </label>
              </div>
              <input style={{...inp,marginBottom:'10px'}} placeholder="Commentaire (facultatif)" value={absForm.comment} onChange={e=>setAbsForm(f=>({...f,comment:e.target.value}))}/>
              {absMsg&&<div style={{fontSize:'12px',color:absMsg.err?C.red:C.green,marginBottom:'10px'}}>{absMsg.text}</div>}
              <button onClick={submitAbsence} disabled={absSaving} style={{background:C.purple,border:'none',borderRadius:'6px',padding:'8px 18px',color:'#fff',fontSize:'12px',fontFamily:'inherit',fontWeight:600,cursor:absSaving?'not-allowed':'pointer',opacity:absSaving?0.7:1}}>{absSaving?'Envoi...':'Envoyer la demande'}</button>
            </div>

            <div style={{fontSize:'11px',color:C.muted,letterSpacing:'0.08em',marginBottom:'10px'}}>MES DEMANDES</div>
            {absences.length===0?(
              <div style={{color:C.muted,fontSize:'12px',textAlign:'center',padding:'20px'}}>Aucune demande pour le moment.</div>
            ):(
              <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                {absences.map(a=>{const t=absenceType(a.type);const st=ABSENCE_STATUS[a.status];return(
                  <div key={a.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'10px',padding:'10px 14px',background:C.card,border:'1px solid '+C.border,borderLeft:'4px solid '+t.color,borderRadius:'8px',flexWrap:'wrap'}}>
                    <div>
                      <div style={{fontSize:'12px',fontWeight:500,color:C.text}}>{t.label} · {absencePeriod(a)} <span style={{color:C.muted}}>({absenceDays(a)} j)</span></div>
                      {a.manager_comment&&<div style={{fontSize:'11px',color:C.muted,marginTop:'2px'}}>Responsable : {a.manager_comment}</div>}
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                      <span style={{background:st.bg,color:st.color,padding:'2px 10px',borderRadius:'10px',fontSize:'11px',fontWeight:600}}>{st.label}</span>
                      {a.status==='en_attente'&&<button onClick={()=>cancelAbsence(a)} style={{background:'none',border:'1px solid '+C.border,borderRadius:'6px',padding:'4px 10px',color:C.muted,fontSize:'11px',fontFamily:'inherit',cursor:'pointer'}}>Annuler</button>}
                    </div>
                  </div>
                );})}
              </div>
            )}
          </div>
        )}
        {tab==='documents'&&(
          <div>
            <div style={{fontSize:'11px',color:C.muted,letterSpacing:'0.08em',marginBottom:'14px'}}>MES DOCUMENTS</div>
            {docsLoading?(
              <div style={{color:C.muted,fontSize:'12px',textAlign:'center',padding:'30px'}}>Chargement...</div>
            ):docs.length===0?(
              <div style={{background:C.card,border:'1px solid '+C.border,borderRadius:'10px',padding:'24px',textAlign:'center',color:C.muted,fontSize:'12px',lineHeight:1.6}}>
                Aucun document disponible pour le moment.<br/>Vos bulletins de paie et documents RH apparaitront ici.
                {selectedEmp?.contract_end_date&&<><br/><span style={{fontSize:'11px'}}>Les documents restent consultables jusqu'a 3 mois apres la fin du contrat.</span></>}
              </div>
            ):DOC_GROUPS.map(g=>{
              const list=docs.filter(d=>(DOC_GROUPS.some(x=>x.id===d.type)?d.type:'autre')===g.id)
                .sort((a,b)=>(b.periode||'').localeCompare(a.periode||'')||new Date(b.created_at)-new Date(a.created_at));
              if(!list.length)return null;
              return(
                <div key={g.id} style={{marginBottom:'16px'}}>
                  <div style={{fontSize:'12px',fontWeight:600,color:C.text,marginBottom:'8px'}}>{g.icon} {g.label} ({list.length})</div>
                  <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                    {list.map(doc=>(
                      <div key={doc.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'10px',padding:'10px 14px',background:C.card,border:'1px solid '+C.border,borderRadius:'8px'}}>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:'12px',color:C.text,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{doc.periode?formatPeriode(doc.periode):(doc.title||doc.file_name)}</div>
                          <div style={{fontSize:'10px',color:C.muted}}>{doc.periode&&doc.title?doc.title+' · ':''}Depose le {new Date(doc.created_at).toLocaleDateString('fr-FR')}</div>
                        </div>
                        <button onClick={()=>openDoc(doc)} style={{background:C.purpleLight,border:'1px solid '+C.purple+'44',borderRadius:'6px',padding:'6px 12px',color:C.purple,cursor:'pointer',fontSize:'11px',fontFamily:'inherit',whiteSpace:'nowrap'}}>Ouvrir</button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
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
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'12px'}}>
              <div style={{textAlign:'center',padding:'14px',background:C.greenLight,border:'1px solid '+C.green+'44',borderRadius:'8px'}}>
                <div style={{fontSize:'26px',fontWeight:600,color:C.green}}>{heuresRealisees.toFixed(1)}h</div>
                <div style={{fontSize:'10px',color:C.muted,marginTop:'4px',letterSpacing:'0.06em'}}>REALISEES</div>
              </div>
              <div style={{textAlign:'center',padding:'14px',background:C.purpleLight,border:'1px solid '+C.purple+'44',borderRadius:'8px'}}>
                <div style={{fontSize:'26px',fontWeight:600,color:C.purple}}>{heuresPlanifieesAnnuelles.toFixed(1)}h</div>
                <div style={{fontSize:'10px',color:C.muted,marginTop:'4px',letterSpacing:'0.06em'}}>PLANIFIEES</div>
              </div>
            </div>
            <div style={{background:C.card,border:'1px solid '+C.border,borderRadius:'10px',padding:'16px',boxShadow:C.shadow+' 0 2px 8px'}}>
              <div style={{fontSize:'11px',color:C.muted,letterSpacing:'0.08em',marginBottom:'10px'}}>CETTE SEMAINE</div>
              <div style={{fontSize:'24px',fontWeight:600,color:C.purple}}>{heuresPlanifiees.toFixed(1)}h</div>
              <div style={{fontSize:'11px',color:C.muted,marginTop:'4px'}}>planifiees · {shifts.filter(s=>s.shift_type!=='repos').length} creneau(x)</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
