import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useTheme } from '../ThemeContext';

const supabase = createClient(
  'https://akulbjtaflucxkuwptjv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrdWxianRhZmx1Y3hrdXdwdGp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTQ1MjAsImV4cCI6MjA5NDY5MDUyMH0.bmG_qktEnmerg_pXp8PqLnMn2Z2EvKX5VTfaYAxEaSg'
);

const AVATAR_COLORS = ['#7C6FCD','#2DB87A','#F5A623','#E85D5D','#5B9BD5','#F090D0'];
function initials(f,l){return(f?.[0]||'')+(l?.[0]||'');}

export default function DossiersRH() {
  const { colors: C } = useTheme();
  const [employees, setEmployees] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [responses, setResponses] = useState([]);
  const [fields] = useState([]); // eslint-disable-line no-unused-vars
  const [documents, setDocuments] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [codeEdit, setCodeEdit] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [empRes, fieldRes, codeRes] = await Promise.all([
      supabase.from('employees').select('*').order('last_name'),
      supabase.from('onboarding_fields').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('onboarding_invitations').select('*').eq('is_active', true).limit(1),
    ]);
    setEmployees(empRes.data || []);
    setFields(fieldRes.data || []);
    if (codeRes.data?.[0]) setCode(codeRes.data[0].code);
    setLoading(false);
  }

  async function loadEmpDetails(emp) {
    setSelectedEmp(emp);
    const [respRes, docsRes] = await Promise.all([
      supabase.from('onboarding_responses').select('*, onboarding_fields(label, field_type)').eq('employee_id', emp.id),
      supabase.from('documents').select('*').eq('employee_id', emp.id),
    ]);
    setResponses(respRes.data || []);
    setDocuments(docsRes.data || []);
  }

  async function validateEmployee(emp) {
    await supabase.from('employees').update({ is_active: true }).eq('id', emp.id);
    setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, is_active: true } : e));
    if (selectedEmp?.id === emp.id) setSelectedEmp(e => ({ ...e, is_active: true }));
  }

  async function updateCode() {
    await supabase.from('onboarding_invitations').update({ code: code.toUpperCase() }).eq('is_active', true);
    setCodeEdit(false);
  }

  async function downloadDoc(doc) {
    const { data } = await supabase.storage.from('documents-rh').createSignedUrl(doc.file_path, 60);
    if (data) window.open(data.signedUrl, '_blank');
  }

  const filtered = employees.filter(e => {
    if (filter === 'pending') return e.onboarding_completed && !e.is_active;
    if (filter === 'active') return e.is_active;
    if (filter === 'incomplete') return !e.onboarding_completed;
    return true;
  });

  const pendingCount = employees.filter(e => e.onboarding_completed && !e.is_active).length;

  const inp = { background: C.bg, border: '1px solid ' + C.border, borderRadius: '6px', padding: '6px 10px', color: C.text, fontSize: '12px', fontFamily: 'inherit' };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Mono','Courier New',monospace" }}>
      <div style={{ background: C.card, borderBottom: '1px solid ' + C.border, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '11px', color: C.muted, letterSpacing: '0.1em', marginBottom: '2px' }}>ADMINISTRATION</div>
          <div style={{ fontSize: '18px', fontWeight: 600, color: C.text }}>Dossiers RH</div>
        </div>

        {/* Code d'invitation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: C.purpleLight, border: '1px solid ' + C.purple + '44', borderRadius: '8px', padding: '8px 14px' }}>
          <span style={{ fontSize: '11px', color: C.purple }}>Lien onboarding :</span>
          <span style={{ fontSize: '11px', color: C.muted }}>planning-frontend-production.up.railway.app/onboarding</span>
          <span style={{ fontSize: '11px', color: C.purple }}>· Code :</span>
          {codeEdit ? (
            <>
              <input style={{ ...inp, width: '100px', textTransform: 'uppercase' }} value={code} onChange={e => setCode(e.target.value.toUpperCase())} />
              <button onClick={updateCode} style={{ background: C.purple, border: 'none', borderRadius: '5px', padding: '4px 10px', color: '#fff', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }}>Sauver</button>
            </>
          ) : (
            <>
              <span style={{ fontWeight: 700, color: C.purple, letterSpacing: '0.1em' }}>{code}</span>
              <button onClick={() => setCodeEdit(true)} style={{ background: 'none', border: '1px solid ' + C.purple + '44', borderRadius: '5px', padding: '3px 8px', color: C.purple, cursor: 'pointer', fontSize: '10px', fontFamily: 'inherit' }}>Modifier</button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', minHeight: 'calc(100vh - 80px)' }}>

        {/* Liste salariés */}
        <div style={{ borderRight: '1px solid ' + C.border, padding: '16px' }}>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '14px', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'Tous' },
              { id: 'pending', label: 'A valider ' + (pendingCount > 0 ? '(' + pendingCount + ')' : '') },
              { id: 'active', label: 'Actifs' },
              { id: 'incomplete', label: 'Incomplets' },
            ].map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                style={{ padding: '3px 10px', borderRadius: '20px', border: '1px solid ' + (filter === f.id ? C.purple : C.border), background: filter === f.id ? C.purpleLight : 'none', color: filter === f.id ? C.purple : C.muted, cursor: 'pointer', fontSize: '10px', fontFamily: 'inherit' }}>
                {f.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ color: C.muted, fontSize: '12px', textAlign: 'center', padding: '20px' }}>Chargement...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {filtered.map((emp, i) => (
                <div key={emp.id} onClick={() => loadEmpDetails(emp)}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '8px', border: '1px solid ' + (selectedEmp?.id === emp.id ? C.purple : 'transparent'), background: selectedEmp?.id === emp.id ? C.purpleLight : 'transparent', cursor: 'pointer', transition: 'all .15s' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: AVATAR_COLORS[i % AVATAR_COLORS.length] + '22', border: '1px solid ' + AVATAR_COLORS[i % AVATAR_COLORS.length] + '44', color: AVATAR_COLORS[i % AVATAR_COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600, flexShrink: 0 }}>
                    {initials(emp.first_name, emp.last_name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 500, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.first_name} {emp.last_name}</div>
                    <div style={{ fontSize: '10px', color: C.muted }}>{emp.service}</div>
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    {emp.onboarding_completed && !emp.is_active && <span style={{ fontSize: '9px', background: '#FEF3C7', color: '#D97706', padding: '2px 6px', borderRadius: '10px', fontWeight: 600 }}>A VALIDER</span>}
                    {emp.is_active && <span style={{ fontSize: '9px', background: '#DCFCE7', color: '#16A34A', padding: '2px 6px', borderRadius: '10px', fontWeight: 600 }}>ACTIF</span>}
                    {!emp.onboarding_completed && <span style={{ fontSize: '9px', background: '#F3F4F6', color: '#6B7280', padding: '2px 6px', borderRadius: '10px' }}>INCOMPLET</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Détail salarié */}
        <div style={{ padding: '20px 24px' }}>
          {!selectedEmp ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', color: C.muted, fontSize: '13px' }}>
              Selectionnez un salarie pour voir son dossier
            </div>
          ) : (
            <div>
              {/* En-tête salarié */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: C.purpleLight, border: '1px solid ' + C.purple + '44', color: C.purple, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 600 }}>
                    {initials(selectedEmp.first_name, selectedEmp.last_name)}
                  </div>
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: 600, color: C.text }}>{selectedEmp.first_name} {selectedEmp.last_name}</div>
                    <div style={{ fontSize: '12px', color: C.muted }}>{selectedEmp.email} · {selectedEmp.service} · {selectedEmp.contract_type}</div>
                  </div>
                </div>
                {!selectedEmp.is_active && selectedEmp.onboarding_completed && (
                  <button onClick={() => validateEmployee(selectedEmp)}
                    style={{ background: C.green, border: 'none', borderRadius: '8px', padding: '10px 20px', color: '#fff', fontSize: '13px', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer' }}>
                    ✓ Valider le compte
                  </button>
                )}
                {selectedEmp.is_active && (
                  <span style={{ background: '#DCFCE7', color: '#16A34A', padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600 }}>✓ Compte actif</span>
                )}
              </div>

              {/* Informations renseignées */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '16px' }}>
                  <div style={{ fontSize: '11px', color: C.muted, letterSpacing: '0.08em', marginBottom: '14px' }}>INFORMATIONS PERSONNELLES</div>
                  {responses.filter(r => r.onboarding_fields?.field_type !== 'file').map(r => (
                    <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid ' + C.border + '66', fontSize: '12px' }}>
                      <span style={{ color: C.muted }}>{r.onboarding_fields?.label}</span>
                      <span style={{ color: C.text, fontWeight: 500, textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{r.value}</span>
                    </div>
                  ))}
                  {responses.filter(r => r.onboarding_fields?.field_type !== 'file').length === 0 && (
                    <div style={{ color: C.muted, fontSize: '12px' }}>Aucune information renseignee</div>
                  )}
                </div>

                <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '16px' }}>
                  <div style={{ fontSize: '11px', color: C.muted, letterSpacing: '0.08em', marginBottom: '14px' }}>PIECES JUSTIFICATIVES</div>
                  {documents.length === 0 ? (
                    <div style={{ color: C.muted, fontSize: '12px' }}>Aucun document</div>
                  ) : documents.map(doc => (
                    <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid ' + C.border + '66' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: C.text, fontWeight: 500 }}>{doc.title}</div>
                        <div style={{ fontSize: '10px', color: C.muted }}>{doc.file_name} · {Math.round((doc.file_size || 0) / 1024)} Ko</div>
                      </div>
                      <button onClick={() => downloadDoc(doc)}
                        style={{ background: C.purpleLight, border: '1px solid ' + C.purple + '44', borderRadius: '5px', padding: '4px 10px', color: C.purple, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                        Ouvrir
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
