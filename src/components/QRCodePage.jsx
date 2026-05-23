import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const API = 'https://mon-planning-production.up.railway.app/api';
const APP_URL = 'https://planning-frontend-production.up.railway.app';

const C = {
  bg: '#0F1117', card: '#1A1D27', border: '#2A2D3A',
  text: '#E8E6DC', muted: '#6B6E82', purple: '#7C6FCD',
  green: '#2DB87A', amber: '#F5A623', red: '#E85D5D',
};

function QRMatrix({ value, size = 200 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const cells = 21;
    const cell = size / cells;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000000';

    const data = [];
    for (let i = 0; i < cells; i++) {
      data.push([]);
      for (let j = 0; j < cells; j++) {
        const hash = (i * 17 + j * 13 + value.charCodeAt((i + j) % value.length)) % 3;
        data[i].push(hash === 0);
      }
    }

    const corners = [[0,0],[0,14],[14,0]];
    corners.forEach(([r,c]) => {
      for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) {
        data[r+i][c+j] = i===0||i===6||j===0||j===6||(i>=2&&i<=4&&j>=2&&j<=4);
      }
    });

    for (let i = 0; i < cells; i++) {
      for (let j = 0; j < cells; j++) {
        if (data[i][j]) ctx.fillRect(j * cell, i * cell, cell, cell);
      }
    }
  }, [value, size]);

  return <canvas ref={canvasRef} width={size} height={size} style={{ display: 'block' }} />;
}

export default function QRCodePage() {
  const [employees, setEmployees] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [mode, setMode] = useState('individual');

  useEffect(() => {
    axios.get(API + '/employees').then(r => {
      setEmployees(r.data);
      if (r.data.length > 0) setSelectedEmp(r.data[0]);
    }).catch(() => {});
  }, []);

  function getQRValue(emp) {
    return APP_URL + '/pointage?emp=' + emp.id + '&name=' + encodeURIComponent(emp.first_name + ' ' + emp.last_name);
  }

  function printQR() {
    window.print();
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Mono','Courier New',monospace", padding: '24px' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>

        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', color: C.muted, letterSpacing: '0.1em', marginBottom: '4px' }}>POINTEUSE</div>
          <div style={{ fontSize: '18px', fontWeight: 600 }}>Gestion des QR Codes</div>
        </div>

        {/* Mode selector */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          <button onClick={() => setMode('individual')}
            style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid ' + (mode === 'individual' ? C.purple : C.border), background: mode === 'individual' ? C.purple + '22' : 'none', color: mode === 'individual' ? C.purple : C.muted, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }}>
            Par salarie
          </button>
          <button onClick={() => setMode('site')}
            style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid ' + (mode === 'site' ? C.purple : C.border), background: mode === 'site' ? C.purple + '22' : 'none', color: mode === 'site' ? C.purple : C.muted, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }}>
            QR site (tous les employes)
          </button>
          <button onClick={() => setMode('all')}
            style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid ' + (mode === 'all' ? C.purple : C.border), background: mode === 'all' ? C.purple + '22' : 'none', color: mode === 'all' ? C.purple : C.muted, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }}>
            Tous les QR codes
          </button>
        </div>

        {/* Mode individuel */}
        {mode === 'individual' && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '10px', color: C.muted, letterSpacing: '0.08em', marginBottom: '5px' }}>SALARIE</label>
              <select style={{ background: C.bg, border: '1px solid ' + C.border, borderRadius: '6px', padding: '8px 12px', color: C.text, fontSize: '12px', fontFamily: 'inherit' }}
                value={selectedEmp?.id || ''}
                onChange={e => setSelectedEmp(employees.find(emp => emp.id === e.target.value))}>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name} · {emp.role}</option>
                ))}
              </select>
            </div>

            {selectedEmp && (
              <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ background: '#ffffff', padding: '16px', borderRadius: '12px', display: 'inline-block' }}>
                  <QRMatrix value={getQRValue(selectedEmp)} size={200} />
                </div>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '16px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>{selectedEmp.first_name} {selectedEmp.last_name}</div>
                    <div style={{ fontSize: '11px', color: C.muted, marginBottom: '12px' }}>{selectedEmp.role} · {selectedEmp.service}</div>
                    <div style={{ fontSize: '10px', color: C.muted, marginBottom: '4px' }}>URL de pointage :</div>
                    <div style={{ fontSize: '10px', background: C.bg, padding: '6px 8px', borderRadius: '5px', wordBreak: 'break-all', color: C.purple }}>
                      {getQRValue(selectedEmp)}
                    </div>
                  </div>
                  <button onClick={printQR}
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
          <div>
            <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '20px', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>QR Code du site</div>
              <div style={{ fontSize: '12px', color: C.muted, marginBottom: '16px' }}>
                Ce QR code unique est a afficher en salle du personnel. Chaque salarie le scanne et choisit son nom dans la liste.
              </div>
              <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ background: '#ffffff', padding: '16px', borderRadius: '12px', display: 'inline-block' }}>
                  <QRMatrix value={APP_URL + '/pointage'} size={200} />
                </div>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={{ fontSize: '10px', color: C.muted, marginBottom: '6px' }}>URL :</div>
                  <div style={{ fontSize: '11px', background: C.bg, padding: '8px', borderRadius: '6px', color: C.purple, marginBottom: '14px', wordBreak: 'break-all' }}>
                    {APP_URL + '/pointage'}
                  </div>
                  <button onClick={printQR}
                    style={{ width: '100%', background: C.purple, border: 'none', borderRadius: '8px', padding: '10px', color: '#fff', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer' }}>
                    Imprimer
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mode tous */}
        {mode === 'all' && (
          <div>
            <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={printQR}
                style={{ background: C.purple, border: 'none', borderRadius: '8px', padding: '8px 16px', color: '#fff', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer' }}>
                Imprimer tous les QR codes
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
              {employees.map(emp => (
                <div key={emp.id} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                  <div style={{ background: '#ffffff', padding: '10px', borderRadius: '8px', display: 'inline-block', marginBottom: '10px' }}>
                    <QRMatrix value={getQRValue(emp)} size={120} />
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 500 }}>{emp.first_name} {emp.last_name}</div>
                  <div style={{ fontSize: '10px', color: C.muted }}>{emp.role}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
