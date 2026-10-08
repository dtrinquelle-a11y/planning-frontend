import React, { useState, useEffect } from 'react';
import supabase from '../supabase';
import { useTheme } from '../ThemeContext';


const AVATAR_COLORS = ['#7C6FCD','#2DB87A','#F5A623','#E85D5D','#5B9BD5','#F090D0'];
const SERVICES = ['Accueil', 'Housekeeping', 'Technique', 'Restauration', 'Animation', 'Managers'];
const CONTRATS = ['CDI', 'CDD', 'Saisonnier', 'Apprentissage', 'Stage', 'Extra'];

// Valeurs de l'encadre "Affectation et contrat" a partir d'une fiche salarie
function contractFormFrom(emp) {
  return {
    service: emp.service || 'Non defini',
    services_secondaires: (emp.services_secondaires || '').split(',').map(s => s.trim()).filter(Boolean),
    role: emp.role || '',
    contract_type: emp.contract_type || 'Non defini',
    contract_hours: emp.contract_hours ?? 35,
    hire_date: emp.hire_date ? String(emp.hire_date).slice(0, 10) : '',
    contract_end_date: emp.contract_end_date ? String(emp.contract_end_date).slice(0, 10) : '',
  };
}
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
  const [accountIds, setAccountIds] = useState(new Set()); // salaries ayant deja un compte
  const [accessLink, setAccessLink] = useState(null); // { empId, url }
  const [creatingLink, setCreatingLink] = useState(false);
  const [contractForm, setContractForm] = useState(null);
  const [savingContract, setSavingContract] = useState(false);
  const toastTimer = React.useRef(null);

  useEffect(() => { loadAll(); }, []);

  function showToast(msg, color) {
    setToast({ msg, color: color || C.green });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  }

  async function loadAll() {
    setLoading(true);
    const [empRes, codeRes, tempRes, profRes] = await Promise.all([
      supabase.from('employees').select('*').eq('is_temp', false).order('last_name'),
      supabase.from('onboarding_invitations').select('*').eq('is_active', true).limit(1),
      supabase.from('employees').select('*').eq('is_temp', true).order('first_name'),
      supabase.from('user_profiles').select('employee_id').not('employee_id', 'is', null),
    ]);
    setEmployees(empRes.data || []);
    setAccountIds(new Set((profRes.data || []).map(p => p.employee_id)));
    setTempEmployees(tempRes.data || []);
    if (codeRes.data?.[0]) setCode(codeRes.data[0].code);
    setLoading(false);
  }

  async function loadEmpDetails(emp) {
    setSelectedEmp(emp);
    setContractForm(contractFormFrom(emp));
    setMergeModal(false);
    setSelectedTempId('');
    const [respRes, docsRes] = await Promise.all([
      supabase.from('onboarding_responses').select('*, onboarding_fields(label, field_type)').eq('employee_id', emp.id),
      supabase.from('documents').select('*').eq('employee_id', emp.id),
    ]);
    setResponses(respRes.data || []);
    setDocuments(docsRes.data || []);
  }

  // Enregistre l'affectation (service, poste) et les infos de contrat d'un salarie
  async function saveContract() {
    if (!contractForm.service || contractForm.service === 'Non defini') { showToast('Choisissez un service', C.red); return; }
    setSavingContract(true);
    try {
      const patch = {
        service: contractForm.service,
        services_secondaires: contractForm.services_secondaires.filter(s => s !== contractForm.service).join(',') || null,
        role: contractForm.role.trim() || 'Employe',
        contract_type: contractForm.contract_type,
        contract_hours: parseFloat(contractForm.contract_hours) || 35,
        hire_date: contractForm.hire_date || null,
        contract_end_date: contractForm.contract_end_date || null,
      };
      const { data, error } = await supabase.from('employees').update(patch).eq('id', selectedEmp.id).select().single();
      if (error) throw error;
      setEmployees(prev => prev.map(e => e.id === data.id ? data : e));
      setSelectedEmp(data);
      setContractForm(contractFormFrom(data));
      showToast('Affectation enregistree');
    } catch (err) {
      showToast('Erreur : ' + err.message, C.red);
    } finally { setSavingContract(false); }
  }

  async function validateEmployee(emp) {
    if (!emp.service || emp.service === 'Non defini') { showToast("Choisissez d'abord un service dans « Affectation et contrat »", C.red); return; }
    await supabase.from('employees').update({ is_active: true }).eq('id', emp.id);
    setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, is_active: true } : e));
    if (selectedEmp?.id === emp.id) setSelectedEmp(e => ({ ...e, is_active: true }));
    showToast('Compte valide !');
    window.dispatchEvent(new Event('badges-refresh')); // met a jour les pastilles du menu
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

  // Lien personnel de premier acces (7 jours, usage unique) pour un salarie existant sans compte
  async function createAccessLink(emp) {
    setCreatingLink(true);
    try {
      const { data: token, error } = await supabase.rpc('create_access_link', { p_employee_id: emp.id });
      if (error) throw error;
      setAccessLink({ empId: emp.id, url: window.location.origin + '/onboarding?acces=' + token });
    } catch (err) {
      showToast('Erreur : ' + err.message, C.red);
    } finally { setCreatingLink(false); }
  }

  async function copyAccessLink() {
    try { await navigator.clipboard.writeText(accessLink.url); showToast('Lien copie !'); }
    catch { showToast('Copie impossible, selectionnez le lien manuellement', C.red); }
  }

  // Suppression d'une fiche saisie par erreur (fonction delete_employee en base : refuse si pointages)
  async function deleteEmployee(emp) {
    const msg = 'Supprimer definitivement la fiche de ' + emp.first_name + ' ' + emp.last_name + ' ?\n\n'
      + "Seront aussi supprimes : ses creneaux, ses reponses d'onboarding, ses documents et son compte de connexion.\n"
      + 'Cette action est irreversible.';
    if (!window.confirm(msg)) return;
    try {
      const { data: files, error } = await supabase.rpc('delete_employee', { p_employee_id: emp.id });
      if (error) throw error;
      if (files && files.length) await supabase.storage.from('documents-rh').remove(files);
      setEmployees(prev => prev.filter(e => e.id !== emp.id));
      if (selectedEmp?.id === emp.id) { setSelectedEmp(null); setContractForm(null); }
      showToast('Fiche supprimee');
    } catch (err) {
      showToast('Erreur : ' + err.message, C.red);
    }
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

  // Candidat qui n'a pas termine l'onboarding : affiche a part, pas dans la liste principale
  const isInscriptionEnCours = e => !e.is_active && !e.onboarding_completed;
  const inscriptions = employees.filter(isInscriptionEnCours);
  const filtered = employees.filter(e => !isInscriptionEnCours(e)).filter(e => {
    if (filter === 'pending') return e.onboarding_completed && !e.is_active;
    if (filter === 'active') return e.is_active;
    if (filter === 'incomplete') return !e.onboarding_completed;
    return true;
  });

  const pendingCount = employees.filter(e => e.onboarding_completed && !e.is_active).length;
  const inp = { background: C.bg, border: '1px solid ' + C.border, borderRadius: '6px', padding: '6px 10px', color: C.text, fontSize: '12px', fontFamily: 'inherit' };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" }}>
      {/* Header */}
      <div style={{ background: C.card, borderBottom: '1px solid ' + C.border, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '11px', color: C.muted, letterSpacing: '0.1em', marginBottom: '2px' }}>ADMINISTRATION</div>
          <div style={{ fontSize: '18px', fontWeight: 600, color: C.text }}>Dossiers RH</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: C.purpleLight, border: '1px solid ' + C.purple + '44', borderRadius: '8px', padding: '8px 14px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: C.purple }}>Lien onboarding :</span>
          <span style={{ fontSize: '10px', color: C.muted }}>{window.location.host}/onboarding</span>
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
                    {!accountIds.has(emp.id) && <span style={{ display: 'block', marginTop: '3px', fontSize: '9px', background: '#FEF2F2', color: '#DC2626', padding: '2px 6px', borderRadius: '10px', textAlign: 'center' }}>SANS ACCÈS</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Inscriptions en cours (onboarding non termine) */}
          {inscriptions.length > 0 && (
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid ' + C.border }}>
              <div style={{ fontSize: '10px', color: C.muted, letterSpacing: '0.08em', marginBottom: '10px' }}>INSCRIPTIONS EN COURS ({inscriptions.length})</div>
              {inscriptions.map(emp => (
                <div key={emp.id} onClick={() => loadEmpDetails(emp)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', borderRadius: '8px', border: '1px solid ' + (selectedEmp?.id === emp.id ? C.purple : C.border), background: selectedEmp?.id === emp.id ? C.purpleLight : 'transparent', marginBottom: '4px', cursor: 'pointer' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '11px', fontWeight: 500, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.first_name} {emp.last_name}</div>
                    <div style={{ fontSize: '9px', color: C.muted }}>Dossier non terminé · {emp.email}</div>
                  </div>
                  <button title="Supprimer" onClick={e => { e.stopPropagation(); deleteEmployee(emp); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', padding: '2px 4px' }}>🗑️</button>
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
                  {!accountIds.has(selectedEmp.id) && (
                    <button onClick={() => createAccessLink(selectedEmp)} disabled={creatingLink}
                      style={{ background: C.purple, border: 'none', borderRadius: '8px', padding: '10px 16px', color: '#fff', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600, cursor: creatingLink ? 'not-allowed' : 'pointer', opacity: creatingLink ? 0.7 : 1 }}>
                      {creatingLink ? '...' : "🔗 Créer un lien d'accès"}
                    </button>
                  )}
                  {accountIds.has(selectedEmp.id) && (
                    <span style={{ background: C.purpleLight, color: C.purple, padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600 }}>✓ Accès application</span>
                  )}
                  <button title="Supprimer cette fiche" onClick={() => deleteEmployee(selectedEmp)}
                    style={{ background: C.redLight, border: '1px solid ' + C.red + '44', borderRadius: '8px', padding: '10px 14px', color: C.red, fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer' }}>
                    🗑️ Supprimer
                  </button>
                  {tempEmployees.length > 0 && (
                    <button onClick={() => setMergeModal(true)}
                      style={{ background: C.purpleLight, border: '1px solid ' + C.purple + '66', borderRadius: '8px', padding: '10px 16px', color: C.purple, fontSize: '12px', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer' }}>
                      🔀 Fusionner avec un temp
                    </button>
                  )}
                </div>
              </div>

              {/* Lien de premier acces genere */}
              {accessLink && accessLink.empId === selectedEmp.id && (
                <div style={{ background: C.purpleLight, border: '1px solid ' + C.purple + '66', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: C.text, marginBottom: '6px' }}>🔗 Lien d'accès pour {selectedEmp.first_name}</div>
                  <div style={{ fontSize: '12px', color: C.muted, marginBottom: '10px' }}>
                    Envoyez ce lien au salarié (SMS, WhatsApp, email). Valable 7 jours, utilisable une seule fois. Générer un nouveau lien annule le précédent.
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <input readOnly value={accessLink.url} onFocus={e => e.target.select()} style={{ ...inp, flex: 1, minWidth: '240px' }} />
                    <button onClick={copyAccessLink}
                      style={{ background: C.purple, border: 'none', borderRadius: '8px', padding: '8px 16px', color: '#fff', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer' }}>
                      Copier
                    </button>
                  </div>
                </div>
              )}

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

              {/* Affectation et contrat (modifiable par le manager) */}
              {contractForm && (
                <div style={{ background: C.card, border: '1px solid ' + (contractForm.service === 'Non defini' ? C.amber : C.border), borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
                  <div style={{ fontSize: '11px', color: C.muted, letterSpacing: '0.08em', marginBottom: '4px' }}>AFFECTATION ET CONTRAT</div>
                  {contractForm.service === 'Non defini' && (
                    <div style={{ fontSize: '12px', color: C.amber, marginBottom: '10px' }}>⚠️ Aucun service : ce salarié n'apparaît dans aucun planning. Choisissez son service puis enregistrez.</div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginTop: '10px' }}>
                    <label style={{ fontSize: '11px', color: C.muted }}>SERVICE *
                      <select style={{ ...inp, width: '100%', marginTop: '4px' }} value={contractForm.service} onChange={e => setContractForm(f => ({ ...f, service: e.target.value }))}>
                        <option value="Non defini">-- Choisir --</option>
                        {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>
                    <label style={{ fontSize: '11px', color: C.muted }}>POSTE
                      <input style={{ ...inp, width: '100%', marginTop: '4px', boxSizing: 'border-box' }} value={contractForm.role} placeholder="Ex : Agent accueil" onChange={e => setContractForm(f => ({ ...f, role: e.target.value }))} />
                    </label>
                    <label style={{ fontSize: '11px', color: C.muted }}>TYPE DE CONTRAT
                      <select style={{ ...inp, width: '100%', marginTop: '4px' }} value={contractForm.contract_type} onChange={e => setContractForm(f => ({ ...f, contract_type: e.target.value }))}>
                        <option value="Non defini">-- Choisir --</option>
                        {CONTRATS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                    <label style={{ fontSize: '11px', color: C.muted }}>HEURES / SEMAINE
                      <input type="number" min="1" max="48" step="0.5" style={{ ...inp, width: '100%', marginTop: '4px', boxSizing: 'border-box' }} value={contractForm.contract_hours} onChange={e => setContractForm(f => ({ ...f, contract_hours: e.target.value }))} />
                    </label>
                    <label style={{ fontSize: '11px', color: C.muted }}>DATE D'EMBAUCHE
                      <input type="date" style={{ ...inp, width: '100%', marginTop: '4px', boxSizing: 'border-box' }} value={contractForm.hire_date} onChange={e => setContractForm(f => ({ ...f, hire_date: e.target.value }))} />
                    </label>
                    <label style={{ fontSize: '11px', color: C.muted }}>FIN DE CONTRAT / SORTIE
                      <input type="date" style={{ ...inp, width: '100%', marginTop: '4px', boxSizing: 'border-box' }} value={contractForm.contract_end_date} onChange={e => setContractForm(f => ({ ...f, contract_end_date: e.target.value }))} />
                      <span style={{ display: 'block', fontSize: '10px', marginTop: '3px' }}>Vide pour un CDI en cours. Documents visibles par le salarié jusqu'à 3 mois après.</span>
                    </label>
                  </div>
                  <div style={{ marginTop: '12px', fontSize: '11px', color: C.muted }}>SERVICES SECONDAIRES (apparaît aussi dans ces plannings)</div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                    {SERVICES.filter(s => s !== contractForm.service).map(s => {
                      const on = contractForm.services_secondaires.includes(s);
                      return (
                        <button key={s} type="button" onClick={() => setContractForm(f => ({ ...f, services_secondaires: on ? f.services_secondaires.filter(x => x !== s) : [...f.services_secondaires, s] }))}
                          style={{ padding: '4px 10px', borderRadius: '20px', border: '1px solid ' + (on ? C.purple : C.border), background: on ? C.purpleLight : 'none', color: on ? C.purple : C.muted, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }}>
                          {on ? '✓ ' : ''}{s}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: '14px', textAlign: 'right' }}>
                    <button onClick={saveContract} disabled={savingContract}
                      style={{ background: C.purple, border: 'none', borderRadius: '8px', padding: '8px 18px', color: '#fff', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600, cursor: savingContract ? 'not-allowed' : 'pointer', opacity: savingContract ? 0.7 : 1 }}>
                      {savingContract ? 'Enregistrement...' : 'Enregistrer'}
                    </button>
                  </div>
                </div>
              )}

              {/* Informations */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '16px' }}>
                  <div style={{ fontSize: '11px', color: C.muted, letterSpacing: '0.08em', marginBottom: '14px' }}>INFORMATIONS PERSONNELLES</div>
                  {responses.filter(r => !['file','signature'].includes(r.onboarding_fields?.field_type)).length === 0 ? (
                    <div style={{ color: C.muted, fontSize: '12px' }}>Aucune information renseignee</div>
                  ) : responses.filter(r => !['file','signature'].includes(r.onboarding_fields?.field_type)).map(r => (
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
