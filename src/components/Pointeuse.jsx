import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useTheme } from '../ThemeContext';

const API = 'https://mon-planning-production.up.railway.app/api';

function getDistanceMeters(lat1,lon1,lat2,lon2){const R=6371000;const dLat=(lat2-lat1)*Math.PI/180;const dLon=(lon2-lon1)*Math.PI/180;const a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}

export default function Pointeuse({ employeeId, employeeName }) {
  const { colors: C } = useTheme();
  const [lastAction,setLastAction]=useState(null);
  const [geoStatus,setGeoStatus]=useState('unknown');
  const [position,setPosition]=useState(null);
  const [distance,setDistance]=useState(null);
  const [todayLogs,setTodayLogs]=useState([]);
  const [loading,setLoading]=useState(false);
  const [toast,setToast]=useState('');
  const toastTimer=useRef(null);
  const SITE_LAT=43.37729,SITE_LON=2.074415,SITE_RADIUS=300;

  useEffect(()=>{loadTodayLogs();checkGeolocation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  function showToast(msg,color){setToast({msg,color:color||C.green});clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),3000);}

  async function loadTodayLogs(){try{const r=await axios.get(API+'/timeclock/today');const ml=r.data.filter(l=>l.employee_id===employeeId||!employeeId);setTodayLogs(ml);if(ml.length>0)setLastAction(ml[0].action);}catch{}}

  function checkGeolocation(){if(!navigator.geolocation){setGeoStatus('unavailable');return;}
    navigator.geolocation.getCurrentPosition(pos=>{const lat=pos.coords.latitude;const lon=pos.coords.longitude;setPosition({lat,lon});const dist=getDistanceMeters(lat,lon,SITE_LAT,SITE_LON);setDistance(Math.round(dist));setGeoStatus(dist<=SITE_RADIUS?'ok':'far');},()=>setGeoStatus('denied'),{enableHighAccuracy:true,timeout:10000});}

  async function doPointage(action){if(loading)return;setLoading(true);
    try{const body={employee_id:employeeId,action};if(position){body.latitude=position.lat;body.longitude=position.lon;body.geo_valid=geoStatus==='ok';}
      const r=await axios.post(API+'/timeclock/scan',body);setLastAction(action);showToast(r.data.message||(action==='in'?'Arrivee enregistree':'Depart enregistre'));await loadTodayLogs();
    }catch(err){showToast(err.response?.data?.error||'Erreur de pointage',C.red);}finally{setLoading(false);}
  }

  const canPointIn=!lastAction||lastAction==='out';
  const canPointOut=lastAction==='in';
  const geoColor=geoStatus==='ok'?C.green:geoStatus==='far'?C.amber:C.muted;
  const geoLabel=geoStatus==='ok'?'Sur site ('+distance+'m)':geoStatus==='far'?'Hors site ('+distance+'m)':geoStatus==='denied'?'Geoloc refusee':geoStatus==='unavailable'?'Geoloc indisponible':'Localisation...';
  const now=new Date();
  const timeStr=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');

  return(
    <div style={{minHeight:'100vh',background:C.bg,color:C.text,fontFamily:"'DM Mono','Courier New',monospace",padding:'20px',display:'flex',flexDirection:'column',alignItems:'center'}}>
      <div style={{width:'100%',maxWidth:'400px',marginBottom:'24px',textAlign:'center'}}>
        <div style={{fontSize:'11px',color:C.muted,letterSpacing:'0.1em',marginBottom:'6px'}}>POINTEUSE · LE BOUT DU MONDE</div>
        <div style={{fontSize:'28px',fontWeight:600,color:C.text}}>{timeStr}</div>
        <div style={{fontSize:'12px',color:C.muted,marginTop:'4px'}}>{now.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})}</div>
      </div>
      <div style={{width:'100%',maxWidth:'400px',background:C.card,border:'1px solid '+C.border,borderRadius:'12px',padding:'16px',marginBottom:'16px',display:'flex',alignItems:'center',gap:'14px',boxShadow:C.shadow+' 0 2px 8px'}}>
        <div style={{width:'44px',height:'44px',borderRadius:'50%',background:C.purpleLight,border:'1px solid '+C.purple+'44',color:C.purple,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px',fontWeight:600,flexShrink:0}}>
          {employeeName?employeeName.split(' ').map(n=>n[0]).join(''):'?'}
        </div>
        <div>
          <div style={{fontSize:'14px',fontWeight:500,color:C.text}}>{employeeName||'Salarie'}</div>
          <div style={{fontSize:'11px',color:C.muted,marginTop:'2px'}}>{lastAction==='in'?'En poste':lastAction==='out'?'Sorti':'Non pointe'}</div>
        </div>
      </div>
      <div style={{width:'100%',maxWidth:'400px',background:geoColor+'11',border:'1px solid '+geoColor+'44',borderRadius:'10px',padding:'10px 14px',marginBottom:'10px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{fontSize:'12px',color:geoColor}}>{geoLabel}</div>
        <button onClick={checkGeolocation} style={{background:'none',border:'1px solid '+C.border,borderRadius:'5px',padding:'3px 8px',color:C.muted,cursor:'pointer',fontSize:'10px',fontFamily:'inherit'}}>Actualiser</button>
      </div>
      {geoStatus==='far'&&<div style={{width:'100%',maxWidth:'400px',background:C.amberLight,border:'1px solid '+C.amber,borderRadius:'10px',padding:'10px 14px',marginBottom:'10px',fontSize:'12px',color:C.amber}}>Attention : vous etes hors du perimetre ({distance}m). Ce pointage sera signale.</div>}
      {(geoStatus==='denied'||geoStatus==='unavailable')&&<div style={{width:'100%',maxWidth:'400px',background:C.amberLight,border:'1px solid '+C.amber,borderRadius:'10px',padding:'10px 14px',marginBottom:'10px',fontSize:'12px',color:C.amber}}>Geolocalisation non disponible.</div>}
      <div style={{width:'100%',maxWidth:'400px',display:'flex',flexDirection:'column',gap:'10px',marginBottom:'20px'}}>
        <button onClick={()=>doPointage('in')} disabled={!canPointIn||loading} style={{width:'100%',padding:'18px',borderRadius:'12px',border:'none',background:canPointIn?C.green:C.border,color:canPointIn?'#fff':C.muted,fontSize:'15px',fontWeight:600,cursor:canPointIn?'pointer':'not-allowed',fontFamily:'inherit',opacity:loading?0.7:1}}>
          {loading&&canPointIn?'Enregistrement...':"Pointer l'arrivee"}
        </button>
        <button onClick={()=>doPointage('out')} disabled={!canPointOut||loading} style={{width:'100%',padding:'18px',borderRadius:'12px',border:'none',background:canPointOut?C.red:C.border,color:canPointOut?'#fff':C.muted,fontSize:'15px',fontWeight:600,cursor:canPointOut?'pointer':'not-allowed',fontFamily:'inherit',opacity:loading?0.7:1}}>
          {loading&&canPointOut?'Enregistrement...':'Pointer le depart'}
        </button>
      </div>
      {todayLogs.length>0&&(
        <div style={{width:'100%',maxWidth:'400px'}}>
          <div style={{fontSize:'10px',color:C.muted,letterSpacing:'0.1em',marginBottom:'10px'}}>HISTORIQUE DU JOUR</div>
          <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
            {todayLogs.slice(0,6).map((log,i)=>(
              <div key={i} style={{background:C.card,border:'1px solid '+C.border,borderRadius:'8px',padding:'10px 14px',display:'flex',alignItems:'center',justifyContent:'space-between',boxShadow:C.shadow+' 0 1px 4px'}}>
                <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                  <div style={{width:'8px',height:'8px',borderRadius:'50%',background:log.action==='in'?C.green:C.red,flexShrink:0}}/>
                  <span style={{fontSize:'12px',color:C.text}}>{log.action==='in'?'Arrivee':'Depart'}</span>
                  {log.is_late&&<span style={{fontSize:'10px',color:C.amber,background:C.amberLight,padding:'1px 6px',borderRadius:'10px'}}>Retard</span>}
                  {log.geo_valid===false&&log.latitude&&<span style={{fontSize:'10px',color:C.red,background:C.redLight,padding:'1px 6px',borderRadius:'10px'}}>Hors site</span>}
                </div>
                <span style={{fontSize:'12px',color:C.muted}}>{log.scanned_at?new Date(log.scanned_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {toast&&<div style={{position:'fixed',bottom:'24px',left:'50%',transform:'translateX(-50%)',background:C.card,border:'1px solid '+(toast.color||C.green),borderRadius:'10px',padding:'12px 20px',fontSize:'13px',color:toast.color||C.green,zIndex:200,boxShadow:C.shadow+' 0 4px 12px',whiteSpace:'nowrap'}}>{toast.msg}</div>}
    </div>
  );
}
