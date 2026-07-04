import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useTheme } from '../ThemeContext';

const API = 'https://mon-planning-production.up.railway.app/api';

function getDistanceMeters(lat1,lon1,lat2,lon2){const R=6371000;const dLat=(lat2-lat1)*Math.PI/180;const dLon=(lon2-lon1)*Math.PI/180;const a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}

export default function Pointeuse({ employeeId, employeeName }) {
  const { colors: C } = useTheme();
  const [lastAction, setLastAction] = useState(null);
  const [geoStatus, setGeoStatus] = useState('unknown');
  const [position, setPosition] = useState(null);
  const [distance, setDistance] = useState(null);
  const [todayLogs, setTodayLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [step, setStep] = useState('main');
  const [pendingAction, setPendingAction] = useState(null);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [photoEnabled, setPhotoEnabled] = useState(true); // reglage admin, mode test
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const toastTimer = useRef(null);
  const SITE_LAT=43.37729, SITE_LON=2.074415, SITE_RADIUS=300;

  useEffect(() => {
    loadTodayLogs();
    checkGeolocation();
    loadPhotoSetting();
    return () => stopCamera();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(msg, color, duration=3000) {
    setToast({ msg, color: color || C.green });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), duration);
  }

    async function loadPhotoSetting() {
        try {
            const r = await axios.get(API+'/settings/pointeuse_photo_enabled');
            setPhotoEnabled(r.data.value === null ? true : r.data.value === 'true');
        } catch (e) { setPhotoEnabled(true); }
    }

  async function loadTodayLogs() {
    try {
      const r = await axios.get(API+'/timeclock/today');
      const ml = r.data.filter(l => l.employee_id === employeeId || !employeeId);
      setTodayLogs(ml);
      if (ml.length > 0) setLastAction(ml[0].action);
    } catch {}
  }

  function checkGeolocation() {
    if (!navigator.geolocation) { setGeoStatus('unavailable'); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      const lat=pos.coords.latitude, lon=pos.coords.longitude;
      setPosition({lat, lon});
      const dist = getDistanceMeters(lat, lon, SITE_LAT, SITE_LON);
      setDistance(Math.round(dist));
      setGeoStatus(dist <= SITE_RADIUS ? 'ok' : 'far');
    }, () => setGeoStatus('denied'), { enableHighAccuracy: true, timeout: 10000 });
  }

  async function startCamera(action) {
    setPendingAction(action);
    setCapturedPhoto(null);
    setCameraError('');
    setStep('camera');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
    } catch (err) {
      setCameraError(err.message);
    }
  }

  function stopCamera() {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  }

  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    setCapturedPhoto(canvas.toDataURL('image/jpeg', 0.6)); // 0.6 pour réduire la taille
    stopCamera();
    setStep('preview');
  }

  function retakePhoto() { setCapturedPhoto(null); startCamera(pendingAction); }
  function cancelPhoto() { stopCamera(); setCapturedPhoto(null); setPendingAction(null); setStep('main'); }

  async function confirmAndPoint(actionOverride, photoOverride){
    if (loading) return;
    setLoading(true);
      const actionToUse = actionOverride !== undefined ? actionOverride : pendingAction;
      const photoToUse = photoOverride !== undefined ? photoOverride : capturedPhoto;

    try {
      // Envoyer photo en base64 au backend — c'est lui qui gère l'upload Supabase
      const body = {
        employee_id: employeeId,
        action: actionToUse,
        photo_base64: photoToUse || null, // base64 JPEG ou null
      };
      if (position) {
        body.latitude = position.lat;
        body.longitude = position.lon;
        body.geo_valid = geoStatus === 'ok';
      }

      const r = await axios.post(API+'/timeclock/scan', body);
      setLastAction(actionToUse);

      if (r.data.photo_warning) {
        showToast('⚠️ Photo non sauvegardée — pointage enregistré', C.amber, 5000);
      } else if (photoToUse) {
        showToast('✓ ' + (r.data.message || 'Pointage enregistré') + ' · Photo OK', C.green);
      } else {
        showToast(r.data.message || 'Pointage enregistré');
      }

      await loadTodayLogs();
      setStep('main');
      setCapturedPhoto(null);
      setPendingAction(null);
    } catch (err) {
      showToast('❌ ' + (err.response?.data?.error || err.message), C.red, 5000);
    } finally { setLoading(false); }
  }

    function handlePointClick(action) {
        if (photoEnabled) { startCamera(action); }
        else { setPendingAction(action); confirmAndPoint(action, null); }
    }

  const canPointIn = !lastAction || lastAction === 'out';
  const canPointOut = lastAction === 'in';
  const geoColor = geoStatus==='ok'?C.green:geoStatus==='far'?C.amber:C.muted;
  const geoLabel = geoStatus==='ok'?'Sur site ('+distance+'m)':geoStatus==='far'?'Hors site ('+distance+'m)':geoStatus==='denied'?'Géoloc refusée':'Localisation...';
  const now = new Date();
  const timeStr = now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');

  return (
    <div style={{minHeight:'100vh',background:C.bg,color:C.text,fontFamily:"'DM Mono','Courier New',monospace",padding:'20px',display:'flex',flexDirection:'column',alignItems:'center'}}>
      <canvas ref={canvasRef} style={{display:'none'}}/>

      {step === 'main' && (
        <>
          <div style={{width:'100%',maxWidth:'400px',marginBottom:'24px',textAlign:'center'}}>
            <div style={{fontSize:'11px',color:C.muted,letterSpacing:'0.1em',marginBottom:'6px'}}>POINTEUSE · LE BOUT DU MONDE</div>
            <div style={{fontSize:'28px',fontWeight:600,color:C.text}}>{timeStr}</div>
            <div style={{fontSize:'12px',color:C.muted,marginTop:'4px'}}>{now.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})}</div>
          </div>

          <div style={{width:'100%',maxWidth:'400px',background:C.card,border:'1px solid '+C.border,borderRadius:'12px',padding:'16px',marginBottom:'16px',display:'flex',alignItems:'center',gap:'14px',boxShadow:'0 2px 8px '+C.shadow}}>
            <div style={{width:'44px',height:'44px',borderRadius:'50%',background:C.purpleLight,border:'1px solid '+C.purple+'44',color:C.purple,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px',fontWeight:600,flexShrink:0}}>
              {employeeName?employeeName.split(' ').map(n=>n[0]).join(''):'?'}
            </div>
            <div>
              <div style={{fontSize:'14px',fontWeight:500,color:C.text}}>{employeeName||'Salarié'}</div>
              <div style={{fontSize:'11px',color:C.muted,marginTop:'2px'}}>{lastAction==='in'?'🟢 En poste':lastAction==='out'?'⚪ Sorti':'⚫ Non pointé'}</div>
            </div>
          </div>

          <div style={{width:'100%',maxWidth:'400px',background:geoColor+'11',border:'1px solid '+geoColor+'44',borderRadius:'10px',padding:'10px 14px',marginBottom:'16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontSize:'12px',color:geoColor}}>{geoLabel}</div>
            <button onClick={checkGeolocation} style={{background:'none',border:'1px solid '+C.border,borderRadius:'5px',padding:'3px 8px',color:C.muted,cursor:'pointer',fontSize:'10px',fontFamily:'inherit'}}>↻</button>
          </div>

          {geoStatus==='far'&&(
            <div style={{width:'100%',maxWidth:'400px',background:C.amberLight,border:'1px solid '+C.amber,borderRadius:'10px',padding:'10px 14px',marginBottom:'16px',fontSize:'12px',color:C.amber}}>
              ⚠️ Hors périmètre ({distance}m) — votre manager sera alerté.
            </div>
          )}

          <div style={{width:'100%',maxWidth:'400px',display:'flex',flexDirection:'column',gap:'10px',marginBottom:'20px'}}>
            <button onClick={()=>handlePointClick('in')} disabled={!canPointIn}
              style={{width:'100%',padding:'18px',borderRadius:'12px',border:'none',background:canPointIn?C.green:C.border,color:canPointIn?'#fff':C.muted,fontSize:'15px',fontWeight:600,cursor:canPointIn?'pointer':'not-allowed',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:'10px'}}>
              📷 Pointer l'arrivée
            </button>
            <button onClick={()=>handlePointClick('out')} disabled={!canPointOut}
              style={{width:'100%',padding:'18px',borderRadius:'12px',border:'none',background:canPointOut?C.red:C.border,color:canPointOut?'#fff':C.muted,fontSize:'15px',fontWeight:600,cursor:canPointOut?'pointer':'not-allowed',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:'10px'}}>
              📷 Pointer le départ
            </button>
          </div>

          {todayLogs.length > 0 && (
            <div style={{width:'100%',maxWidth:'400px'}}>
              <div style={{fontSize:'10px',color:C.muted,letterSpacing:'0.1em',marginBottom:'10px'}}>HISTORIQUE DU JOUR</div>
              <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                {todayLogs.slice(0,6).map((log,i)=>(
                  <div key={i} style={{background:C.card,border:'1px solid '+C.border,borderRadius:'8px',padding:'10px 14px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                      <div style={{width:'8px',height:'8px',borderRadius:'50%',background:log.action==='in'?C.green:C.red,flexShrink:0}}/>
                      <span style={{fontSize:'12px',color:C.text}}>{log.action==='in'?'Arrivée':'Départ'}</span>
                      {log.photo_path?<span style={{fontSize:'10px',color:C.green}}>📷</span>:<span style={{fontSize:'10px',color:C.muted}}>sans photo</span>}
                      {log.is_late&&<span style={{fontSize:'10px',color:C.amber,background:C.amberLight,padding:'1px 6px',borderRadius:'10px'}}>Retard</span>}
                      {log.geo_valid===false&&log.latitude&&<span style={{fontSize:'10px',color:C.red,background:C.redLight,padding:'1px 6px',borderRadius:'10px'}}>Hors site</span>}
                    </div>
                    <span style={{fontSize:'12px',color:C.muted}}>{log.scanned_at?new Date(log.scanned_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {step === 'camera' && (
        <div style={{width:'100%',maxWidth:'400px'}}>
          <div style={{textAlign:'center',marginBottom:'16px'}}>
            <div style={{fontSize:'14px',fontWeight:600,color:C.text}}>{pendingAction==='in'?'📷 Photo d\'arrivée':'📷 Photo de départ'}</div>
            <div style={{fontSize:'12px',color:C.muted,marginTop:'4px'}}>Placez-vous face à la caméra</div>
          </div>
          {cameraError ? (
            <div style={{background:C.amberLight,border:'1px solid '+C.amber,borderRadius:'10px',padding:'16px',textAlign:'center',marginBottom:'16px'}}>
              <div style={{fontSize:'12px',color:C.amber,marginBottom:'4px'}}>⚠️ Caméra indisponible</div>
              <div style={{fontSize:'11px',color:C.muted,marginBottom:'12px'}}>Le pointage sera enregistré sans photo.</div>
              <button onClick={()=>setStep('preview')}
                style={{background:C.purple,border:'none',borderRadius:'8px',padding:'10px 20px',color:'#fff',fontSize:'12px',fontFamily:'inherit',fontWeight:600,cursor:'pointer'}}>
                Pointer sans photo →
              </button>
            </div>
          ) : (
            <div style={{background:'#000',borderRadius:'12px',overflow:'hidden',marginBottom:'16px',position:'relative'}}>
              <video ref={videoRef} autoPlay playsInline muted style={{width:'100%',display:'block',minHeight:'300px',objectFit:'cover'}}/>
              <div style={{position:'absolute',bottom:'10px',left:0,right:0,display:'flex',justifyContent:'center'}}>
                <button onClick={capturePhoto} style={{width:'64px',height:'64px',borderRadius:'50%',background:'#fff',border:'4px solid '+C.purple,cursor:'pointer',fontSize:'24px',display:'flex',alignItems:'center',justifyContent:'center'}}>📷</button>
              </div>
            </div>
          )}
          <button onClick={cancelPhoto} style={{width:'100%',background:'none',border:'1px solid '+C.border,borderRadius:'8px',padding:'12px',color:C.muted,fontSize:'13px',fontFamily:'inherit',cursor:'pointer'}}>Annuler</button>
        </div>
      )}

      {step === 'preview' && (
        <div style={{width:'100%',maxWidth:'400px'}}>
          <div style={{textAlign:'center',marginBottom:'16px'}}>
            <div style={{fontSize:'14px',fontWeight:600,color:C.text}}>Valider le pointage ?</div>
            <div style={{fontSize:'12px',color:C.muted,marginTop:'4px'}}>{pendingAction==='in'?'Arrivée':'Départ'} · {timeStr}</div>
          </div>
          {capturedPhoto ? (
            <div style={{borderRadius:'12px',overflow:'hidden',marginBottom:'16px',border:'2px solid '+C.purple}}>
              <img src={capturedPhoto} alt="Apercu" style={{width:'100%',display:'block'}}/>
            </div>
          ) : (
            <div style={{background:C.amberLight,border:'1px solid '+C.amber,borderRadius:'10px',padding:'14px',textAlign:'center',marginBottom:'16px'}}>
              <div style={{fontSize:'13px',color:C.amber}}>⚠️ Sans photo</div>
              <div style={{fontSize:'11px',color:C.muted,marginTop:'4px'}}>Le pointage sera enregistré sans photo.</div>
            </div>
          )}
          <div style={{display:'flex',gap:'10px',marginBottom:'10px'}}>
            {capturedPhoto&&<button onClick={retakePhoto} style={{flex:1,background:'none',border:'1px solid '+C.border,borderRadius:'8px',padding:'12px',color:C.muted,fontSize:'13px',fontFamily:'inherit',cursor:'pointer'}}>🔄 Reprendre</button>}
            <button onClick={confirmAndPoint} disabled={loading}
              style={{flex:2,background:pendingAction==='in'?C.green:C.red,border:'none',borderRadius:'8px',padding:'12px',color:'#fff',fontSize:'13px',fontFamily:'inherit',fontWeight:600,cursor:loading?'not-allowed':'pointer',opacity:loading?0.7:1}}>
              {loading?'Envoi...':'✓ Valider et pointer'}
            </button>
          </div>
          <button onClick={cancelPhoto} style={{width:'100%',background:'none',border:'1px solid '+C.border,borderRadius:'8px',padding:'10px',color:C.muted,fontSize:'12px',fontFamily:'inherit',cursor:'pointer'}}>Annuler</button>
        </div>
      )}

      {toast&&<div style={{position:'fixed',bottom:'80px',left:'50%',transform:'translateX(-50%)',background:C.card,border:'1px solid '+(toast.color||C.green),borderRadius:'10px',padding:'12px 20px',fontSize:'13px',color:toast.color||C.green,zIndex:200,boxShadow:'0 4px 12px '+C.shadow,maxWidth:'320px',textAlign:'center'}}>{toast.msg}</div>}
    </div>
  );
}
