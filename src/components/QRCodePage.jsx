import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import { useTheme } from '../ThemeContext';

const API = 'https://mon-planning-production.up.railway.app/api';
const APP_URL = 'https://planning-frontend-production.up.railway.app';

export default function QRCodePage() {
  const { colors: C } = useTheme();
  const [employees, setEmployees] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [mode, setMode] = useState('individual');

  useEffect(() => {
    axios.get(API+'/employees').then(r => {
      setEmployees(r.data);
      if (r.data.length > 0) setSelectedEmp(r.data[0]);
    }).catch(() => {});
  }, []);

  function getQRValue(emp) {
    return APP_URL + '/pointage?emp=' + emp.id + '&name=' + encodeURIComponent(emp.first_name + ' ' + emp.last_name);
  }

  function getSiteQRValue() {
    return APP_URL + '/pointage';
  }

  function printQR() { window.print(); }

  const inp = { background: C.bg, border: '1px solid ' + C.border, borderRadius: '6px', padding: '8px 12px', color: C.text, fontSize: '12px', fontFamily: 'inherit' };
  const lbl = { display: 'block', fontSize: '10px', color: C.muted, letterSpacing: '0.08em', marginBottom: '5px' };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Mono','Courier New',monospace", padding: '24px' }}>
      <style>{`
        @media print {
          nav, .no-print { display: none !important; }
          .print-card { page-break-inside: avoid; }
        }
      `}</style>

      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', color: C.muted, letterSpacing: '0.1em', marginBottom: '4px' }}>POINTEUSE</div>
          <div style={{ fontSize: '18px', fontWeight: 600, color: C.text }}>Gestion des QR Codes</div>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }} className="no-print">
          {[{id:'individual',label:'Par salarie'},{id:'site',label:'QR site'},{id:'all',label:'Tous les QR'}].map(m=>(
            <button key={m.id} onClick={()=>setMode(m.id)}
              style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid '+(mode===m.id?C.purple:C.border), background: mode===m.id?C.purpleLight:'none', color: mode===m.id?C.purple:C.muted, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Mode individuel */}
        {mode === 'individual' && (
          <div>
            <div style={{ marginBottom: '16px' }} className="no-print">
              <label style={lbl}>SALARIE</label>
              <select style={{ ...inp, width: 'auto' }} value={selectedEmp?.id || ''} onChange={e => setSelectedEmp(employees.find(emp => emp.id === e.target.value))}>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name} · {emp.service}</option>)}
              </select>
            </div>
            {selectedEmp && (
              <div className="print-card" style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ background: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid ' + C.border, boxShadow: '0 2px 8px ' + C.shadow, textAlign: 'center' }}>
                  <QRCodeSVG value={getQRValue(selectedEmp)} size={200} bgColor="#ffffff" fgColor="#000000" level="M" />
                  <div style={{ marginTop: '12px', fontSize: '12px', color: '#333', fontWeight: 600 }}>{selectedEmp.first_name} {selectedEmp.last_name}</div>
                  <div style={{ fontSize: '10px', color: '#666' }}>{selectedEmp.service}</div>
                </div>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '16px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px', color: C.text }}>{selectedEmp.first_name} {selectedEmp.last_name}</div>
                    <div style={{ fontSize: '11px', color: C.muted, marginBottom: '12px' }}>{selectedEmp.role} · {selectedEmp.service}</div>
                    <div style={{ fontSize: '10px', color: C.muted, marginBottom: '4px' }}>URL de pointage :</div>
                    <div style={{ fontSize: '10px', background: C.bg, padding: '6px 8px', borderRadius: '5px', wordBreak: 'break-all', color: C.purple, border: '1px solid ' + C.border }}>{getQRValue(selectedEmp)}</div>
                  </div>
                  <button onClick={printQR} className="no-print"
                    style={{ width: '100%', background: C.purple, border: 'none', borderRadius: '8px', padding: '10px', color: '#fff', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer' }}>
                    Imprimer le QR code
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mode site */}
        {mode === 'site' && (
          <div className="print-card" style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '20px', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '8px', color: C.text }}>QR Code du site</div>
            <div style={{ fontSize: '12px', color: C.muted, marginBottom: '16px' }}>Afficher en salle du personnel — tous les salaries scannent ce code unique.</div>
            <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ background: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid ' + C.border, textAlign: 'center' }}>
                <QRCodeSVG value={getSiteQRValue()} size={200} bgColor="#ffffff" fgColor="#000000" level="M" />
                <div style={{ marginTop: '10px', fontSize: '11px', color: '#333', fontWeight: 600 }}>Le Bout du Monde</div>
                <div style={{ fontSize: '10px', color: '#666' }}>Pointage salarié</div>
              </div>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ fontSize: '10px', color: C.muted, marginBottom: '6px' }}>URL :</div>
                <div style={{ fontSize: '11px', background: C.bg, padding: '8px', borderRadius: '6px', color: C.purple, marginBottom: '14px', wordBreak: 'break-all', border: '1px solid ' + C.border }}>{getSiteQRValue()}</div>
                <button onClick={printQR} className="no-print"
                  style={{ width: '100%', background: C.purple, border: 'none', borderRadius: '8px', padding: '10px', color: '#fff', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer' }}>
                  Imprimer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mode tous */}
        {mode === 'all' && (
          <div>
            <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'flex-end' }} className="no-print">
              <button onClick={printQR}
                style={{ background: C.purple, border: 'none', borderRadius: '8px', padding: '8px 16px', color: '#fff', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer' }}>
                Imprimer tous
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
              {employees.map(emp => (
                <div key={emp.id} className="print-card" style={{ background: '#ffffff', border: '1px solid ' + C.border, borderRadius: '10px', padding: '16px', textAlign: 'center', boxShadow: '0 1px 4px ' + C.shadow }}>
                  <QRCodeSVG value={getQRValue(emp)} size={130} bgColor="#ffffff" fgColor="#000000" level="M" />
                  <div style={{ marginTop: '10px', fontSize: '12px', fontWeight: 500, color: '#333' }}>{emp.first_name} {emp.last_name}</div>
                  <div style={{ fontSize: '10px', color: '#666' }}>{emp.service}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
