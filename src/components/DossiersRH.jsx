import React, { useState, useEffect } from 'react';
import supabase from '../supabase';
import { useTheme } from '../ThemeContext';


const AVATAR_COLORS = ['#7C6FCD','#2DB87A','#F5A623','#E85D5D','#5B9BD5','#F090D0'];
function initials(f,l){return(f?.[0]||'')+(l?.[0]||'');}

export default function DossiersRH() {
  const { colors: C } = useTheme();
  const [employees, setEmployees] = useState([]);
  const [tempEmployees, setTempEmployees] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [responses, setResponses] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [codeEdit, setCodeEdit] = useState(false);
  const [mergeModal, setMergeModal] = useState(false);
  const [selectedTempId, setSelectedTempId] = useState('');
  const [merging, setMerging] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = React.useRef(null);

  useEffect(() => { loadAll(); }, []);

  function showToast(msg, color) {
    setToast({ msg, color: color || C.green });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  }

  async function loadAll() {
    setLoading(true);
    const [empRes, codeRes, tempRes] = await Promise.all([
      supabase.from('employees').select('*').eq('is_temp', false).order('last_name'),
      supabase.from('onboarding_invitations').select('*').eq('is_active', true).limit(1),
      supabase.from('employees').select('*').eq('is_temp', true).order('first_name'),
    ]);
    setEmployees(empRes.data || []);
    setTempEmployees(tempRes.data || []);
    if (codeRes.data?.[0]) setCode(codeRes.data[0].code);
    setLoading(false);
  }

  async function loadEmpDetails(emp) {
    setSelectedEmp(emp);
    setMergeModal(false);
    setSelectedTempId('');
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
    showToast('Compte valide !');
  }

  async function mergeWithTemp() {
    if (!selectedTempId || !selectedEmp) return;
    setMerging(true);
    try {
      // 1. Réattribuer tous les créneaux du temp au vrai salarié
      const { data: schedules } = await supabase
        .from('schedules')
        .select('id')
        .eq('employee_id', selectedTempId);

      if (schedules && schedules.length > 0) {
        await supabase
          .from('schedules')
          .update({ employee_id: selectedEmp.id })
          .eq('employee_id', selectedTempId);
      }

      // 2. Réattribuer les pointages éventuels
      await supabase.from('timeclock').update({ employee_id: selectedEmp.id }).eq('employee_id', selectedTempId);

      // 3. Supprimer l'équipier temp
      await supabase.from('employees').delete().eq('id', selectedTempId).eq('is_temp', true);

      setTempEmployees(prev => prev.filter(t => t.id !== selectedTempId));
      setMergeModal(false);
      setSelectedTempId('');
      showToast('Fusion reussie ! ' + (schedules?.length||0) + ' creneau(x) transfere(s)');
    } catch (err) {
      showToast('Erreur : ' + err.message, C.red);
    } finally { setMerging(false); }
  }

  async function updateCode() {
    await supabase.from('onboarding_invitations').update({ code: code.toUpperCase() }).eq('is_active', true);
    setCodeEdit(false);
    showToast('Code mis a jour');
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
      {/* Header */}
      <div style={{ background: C.card, borderBottom: '1px solid ' + C.border, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '11px', color: C.muted, letterSpacing: '0.1em', marginBottom: '2px' }}>ADMINISTRATION</div>
          <div style={{ fontSize: '18px', fontWeight: 600, color: C.text }}>Dossiers RH</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: C.purpleLight, border: '1px solid ' + C.purple + '44', borderRadius: '8px', padding: '8px 14px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: C.purple }}>Lien onboarding :</span>
          <span style={{ fontSize: '10px', color: C.muted }}>...up.railway.app/onboarding</span>
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
              { id: 'pending', label: 'A valider' + (pendingCount > 0 ? ' (' + pendingCount + ')' : '') },
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

          {/* Section équipiers temp */}
          {tempEmployees.length > 0 && (
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid ' + C.border }}>
              <div style={{ fontSize: '10px', color: C.muted, letterSpacing: '0.08em', marginBottom: '10px' }}>ÉQUIPIERS TEMPORAIRES</div>
              {tempEmployees.map((t, i) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', borderRadius: '8px', background: C.purpleLight, border: '1px solid ' + C.purple + '33', marginBottom: '4px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: C.purple + '22', border: '1px solid ' + C.purple + '44', color: C.purple, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 600, flexShrink: 0 }}>
                    {initials(t.first_name, t.last_name)} <span style={{ fontSize: '7px' }}>T</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '11px', fontWeight: 500, color: C.text }}>{t.first_name} {t.last_name}</div>
                    <div style={{ fontSize: '9px', color: C.muted }}>{t.service}</div>
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
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {!selectedEmp.is_active && selectedEmp.onboarding_completed && (
                    <button onClick={() => validateEmployee(selectedEmp)}
                      style={{ background: C.green, border: 'none', borderRadius: '8px', padding: '10px 20px', color: '#fff', fontSize: '13px', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer' }}>
                      ✓ Valider le compte
                    </button>
                  )}
                  {selectedEmp.is_active && (
                    <span style={{ background: '#DCFCE7', color: '#16A34A', padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600 }}>✓ Compte actif</span>
                  )}
                  {tempEmployees.length > 0 && (
                    <button onClick={() => setMergeModal(true)}
                      style={{ background: C.purpleLight, border: '1px solid ' + C.purple + '66', borderRadius: '8px', padding: '10px 16px', color: C.purple, fontSize: '12px', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer' }}>
                      🔀 Fusionner avec un temp
                    </button>
                  )}
                </div>
              </div>

              {/* Modal fusion */}
              {mergeModal && (
                <div style={{ background: C.amberLight, border: '1px solid ' + C.amber + '66', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: C.text, marginBottom: '8px' }}>🔀 Fusionner avec un équipier temporaire</div>
                  <div style={{ fontSize: '12px', color: C.muted, marginBottom: '12px' }}>
                    Tous les créneaux planifiés de l'équipier temporaire seront transférés à <strong>{selectedEmp.first_name} {selectedEmp.last_name}</strong>. L'équipier temp sera supprimé.
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select style={{ ...inp, flex: 1, minWidth: '200px' }} value={selectedTempId} onChange={e => setSelectedTempId(e.target.value)}>
                      <option value="">-- Choisir l'équipier temp --</option>
                      {tempEmployees.map(t => (
                        <option key={t.id} value={t.id}>{t.first_name} {t.last_name} · {t.service}</option>
                      ))}
                    </select>
                    <button onClick={mergeWithTemp} disabled={!selectedTempId || merging}
                      style={{ background: C.purple, border: 'none', borderRadius: '8px', padding: '8px 16px', color: '#fff', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600, cursor: !selectedTempId || merging ? 'not-allowed' : 'pointer', opacity: !selectedTempId || merging ? 0.7 : 1 }}>
                      {merging ? 'Fusion...' : 'Confirmer la fusion'}
                    </button>
                    <button onClick={() => { setMergeModal(false); setSelectedTempId(''); }}
                      style={{ background: 'none', border: '1px solid ' + C.border, borderRadius: '8px', padding: '8px 12px', color: C.muted, fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer' }}>
                      Annuler
                    </button>
                  </div>
                </div>
              )}

              {/* Informations */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '16px' }}>
                  <div style={{ fontSize: '11px', color: C.muted, letterSpacing: '0.08em', marginBottom: '14px' }}>INFORMATIONS PERSONNELLES</div>
                  {responses.filter(r => r.onboarding_fields?.field_type !== 'file').length === 0 ? (
                    <div style={{ color: C.muted, fontSize: '12px' }}>Aucune information renseignee</div>
                  ) : responses.filter(r => r.onboarding_fields?.field_type !== 'file').map(r => (
                    <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid ' + C.border + '66', fontSize: '12px' }}>
                      <span style={{ color: C.muted }}>{r.onboarding_fields?.label}</span>
                      <span style={{ color: C.text, fontWeight: 500, textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{r.value}</span>
                    </div>
                  ))}
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

      {toast && <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: C.card, border: '1px solid ' + (toast.color || C.green), borderRadius: '8px', padding: '10px 16px', fontSize: '12px', color: toast.color || C.green, zIndex: 200, boxShadow: '0 4px 12px ' + C.shadow }}>{toast.msg}</div>}
    </div>
  );
}
