import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useTheme } from '../ThemeContext';

const API = 'https://mon-planning-production.up.railway.app/api';
const APP_URL = 'https://planning-frontend-production.up.railway.app';

function QRMatrix({ value, size=200 }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if(!canvasRef.current)return;
    const canvas=canvasRef.current;const ctx=canvas.getContext('2d');const cells=21;const cell=size/cells;
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,size,size);ctx.fillStyle='#000000';
    const data=[];
    for(let i=0;i<cells;i++){data.push([]);for(let j=0;j<cells;j++){const hash=(i*17+j*13+value.charCodeAt((i+j)%value.length))%3;data[i].push(hash===0);}}
    const corners=[[0,0],[0,14],[14,0]];
    corners.forEach(([r,c])=>{for(let i=0;i<7;i++)for(let j=0;j<7;j++){data[r+i][c+j]=i===0||i===6||j===0||j===6||(i>=2&&i<=4&&j>=2&&j<=4);}});
    for(let i=0;i<cells;i++)for(let j=0;j<cells;j++){if(data[i][j])ctx.fillRect(j*cell,i*cell,cell,cell);}
  },[value,size]);
  return <canvas ref={canvasRef} width={size} height={size} style={{display:'block'}}/>;
}

export default function QRCodePage() {
  const { colors: C } = useTheme();
  const [employees,setEmployees]=useState([]);
  const [selectedEmp,setSelectedEmp]=useState(null);
  const [mode,setMode]=useState('individual');

  useEffect(()=>{axios.get(API+'/employees').then(r=>{setEmployees(r.data);if(r.data.length>0)setSelectedEmp(r.data[0]);}).catch(()=>{});},[]);

  function getQRValue(emp){return APP_URL+'/pointage?emp='+emp.id+'&name='+encodeURIComponent(emp.first_name+' '+emp.last_name);}
  function printQR(){window.print();}

  const inp={background:C.bg,border:'1px solid '+C.border,borderRadius:'6px',padding:'8px 12px',color:C.text,fontSize:'12px',fontFamily:'inherit'};
  const lbl={display:'block',fontSize:'10px',color:C.muted,letterSpacing:'0.08em',marginBottom:'5px'};

  return(
    <div style={{minHeight:'100vh',background:C.bg,color:C.text,fontFamily:"'DM Mono','Courier New',monospace",padding:'24px'}}>
      <div style={{maxWidth:'800px',margin:'0 auto'}}>
        <div style={{marginBottom:'20px'}}>
          <div style={{fontSize:'11px',color:C.muted,letterSpacing:'0.1em',marginBottom:'4px'}}>POINTEUSE</div>
          <div style={{fontSize:'18px',fontWeight:600,color:C.text}}>Gestion des QR Codes</div>
        </div>

        <div style={{display:'flex',gap:'8px',marginBottom:'20px'}}>
          {[{id:'individual',label:'Par salarie'},{id:'site',label:'QR site'},{id:'all',label:'Tous les QR'}].map(m=>(
            <button key={m.id} onClick={()=>setMode(m.id)} style={{padding:'6px 16px',borderRadius:'6px',border:'1px solid '+(mode===m.id?C.purple:C.border),background:mode===m.id?C.purpleLight:'none',color:mode===m.id?C.purple:C.muted,cursor:'pointer',fontSize:'11px',fontFamily:'inherit'}}>{m.label}</button>
          ))}
        </div>

        {mode==='individual'&&(
          <div>
            <div style={{marginBottom:'16px'}}><label style={lbl}>SALARIE</label>
              <select style={{...inp,width:'auto'}} value={selectedEmp?.id||''} onChange={e=>setSelectedEmp(employees.find(emp=>emp.id===e.target.value))}>
                {employees.map(emp=><option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name} · {emp.role}</option>)}
              </select>
            </div>
            {selectedEmp&&(
              <div style={{display:'flex',gap:'20px',alignItems:'flex-start',flexWrap:'wrap'}}>
                <div style={{background:'#ffffff',padding:'16px',borderRadius:'12px',display:'inline-block',border:'1px solid '+C.border,boxShadow:C.shadow+' 0 2px 8px'}}><QRMatrix value={getQRValue(selectedEmp)} size={200}/></div>
                <div style={{flex:1,minWidth:'200px'}}>
                  <div style={{background:C.card,border:'1px solid '+C.border,borderRadius:'10px',padding:'16px',marginBottom:'12px',boxShadow:C.shadow+' 0 2px 8px'}}>
                    <div style={{fontSize:'14px',fontWeight:600,marginBottom:'4px',color:C.text}}>{selectedEmp.first_name} {selectedEmp.last_name}</div>
                    <div style={{fontSize:'11px',color:C.muted,marginBottom:'12px'}}>{selectedEmp.role} · {selectedEmp.service}</div>
                    <div style={{fontSize:'10px',color:C.muted,marginBottom:'4px'}}>URL de pointage :</div>
                    <div style={{fontSize:'10px',background:C.bg,padding:'6px 8px',borderRadius:'5px',wordBreak:'break-all',color:C.purple,border:'1px solid '+C.border}}>{getQRValue(selectedEmp)}</div>
                  </div>
                  <button onClick={printQR} style={{width:'100%',background:C.purple,border:'none',borderRadius:'8px',padding:'10px',color:'#fff',fontSize:'12px',fontFamily:'inherit',fontWeight:600,cursor:'pointer'}}>Imprimer le QR code</button>
                </div>
              </div>
            )}
          </div>
        )}

        {mode==='site'&&(
          <div style={{background:C.card,border:'1px solid '+C.border,borderRadius:'10px',padding:'20px',marginBottom:'16px',boxShadow:C.shadow+' 0 2px 8px'}}>
            <div style={{fontSize:'13px',fontWeight:500,marginBottom:'8px',color:C.text}}>QR Code du site</div>
            <div style={{fontSize:'12px',color:C.muted,marginBottom:'16px'}}>Afficher en salle du personnel — tous les salaries scannent ce code unique.</div>
            <div style={{display:'flex',gap:'20px',alignItems:'flex-start',flexWrap:'wrap'}}>
              <div style={{background:'#ffffff',padding:'16px',borderRadius:'12px',display:'inline-block',border:'1px solid '+C.border}}><QRMatrix value={APP_URL+'/pointage'} size={200}/></div>
              <div style={{flex:1,minWidth:'200px'}}>
                <div style={{fontSize:'10px',color:C.muted,marginBottom:'6px'}}>URL :</div>
                <div style={{fontSize:'11px',background:C.bg,padding:'8px',borderRadius:'6px',color:C.purple,marginBottom:'14px',wordBreak:'break-all',border:'1px solid '+C.border}}>{APP_URL+'/pointage'}</div>
                <button onClick={printQR} style={{width:'100%',background:C.purple,border:'none',borderRadius:'8px',padding:'10px',color:'#fff',fontSize:'12px',fontFamily:'inherit',fontWeight:600,cursor:'pointer'}}>Imprimer</button>
              </div>
            </div>
          </div>
        )}

        {mode==='all'&&(
          <div>
            <div style={{marginBottom:'12px',display:'flex',justifyContent:'flex-end'}}>
              <button onClick={printQR} style={{background:C.purple,border:'none',borderRadius:'8px',padding:'8px 16px',color:'#fff',fontSize:'12px',fontFamily:'inherit',fontWeight:600,cursor:'pointer'}}>Imprimer tous</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))',gap:'16px'}}>
              {employees.map(emp=>(
                <div key={emp.id} style={{background:C.card,border:'1px solid '+C.border,borderRadius:'10px',padding:'14px',textAlign:'center',boxShadow:C.shadow+' 0 1px 4px'}}>
                  <div style={{background:'#ffffff',padding:'10px',borderRadius:'8px',display:'inline-block',marginBottom:'10px',border:'1px solid '+C.border}}><QRMatrix value={getQRValue(emp)} size={120}/></div>
                  <div style={{fontSize:'12px',fontWeight:500,color:C.text}}>{emp.first_name} {emp.last_name}</div>
                  <div style={{fontSize:'10px',color:C.muted}}>{emp.role}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
