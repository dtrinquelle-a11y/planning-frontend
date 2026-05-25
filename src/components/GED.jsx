import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import GED from './components/GED';

const API = 'https://mon-planning-production.up.railway.app/api';
const supabase = createClient(
  'https://akulbjtaflucxkuwptjv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrdWxianRhZmx1Y3hrdXdwdGp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTQ1MjAsImV4cCI6MjA5NDY5MDUyMH0.bmG_qktEnmerg_pXp8PqLnMn2Z2EvKX5VTfaYAxEaSg'
);

const C = {
  bg: '#0F1117', card: '#1A1D27', border: '#2A2D3A',
  text: '#E8E6DC', muted: '#6B6E82', purple: '#7C6FCD',
  green: '#2DB87A', amber: '#F5A623', red: '#E85D5D',
};

const DOC_TYPES = [
  { id: 'bulletin_paie', label: 'Bulletin de paie', icon: '💰' },
  { id: 'contrat', label: 'Contrat', icon: '📄' },
  { id: 'avenant', label: 'Avenant', icon: '📝' },
  { id: 'attestation', label: 'Attestation', icon: '✅' },
  { id: 'certificat', label: 'Certificat', icon: '🏅' },
  { id: 'autre', label: 'Autre', icon: '📎' },
];

const AVATAR_COLORS = ['#7C6FCD', '#2DB87A', '#F5A623', '#E85D5D', '#5B9BD5', '#F090D0'];

function initials(f, l) { return (f?.[0] || '') + (l?.[0] || ''); }
function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' o';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' Ko';
  return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
}

const inp = { width: '100%', background: '#0F1117', border: '1px solid #2A2D3A', borderRadius: '6px', padding: '8px 10px', color: '#E8E6DC', fontSize: '12px', fontFamily: 'inherit', boxSizing: 'border-box' };
const lbl = { display: 'block', fontSize: '10px', color: '#6B6E82', letterSpacing: '0.08em', marginBottom: '4px' };

export default function GED({ isManager }) {
  const [employees, setEmployees] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [filterType, setFilterType] = useState('tous');
  const [uploadModal, setUploadModal] = useState(false);
  const [uploadForm, setUploadForm] = useState({ type: 'bulletin_paie', title: '', periode: '', file: null });
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState('');
  const fileRef = useRef(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    if (isManager) {
      axios.get(API + '/employees').then(r => {
        setEmployees(r.data);
        if (r.data.length > 0) setSelectedEmp(r.data[0]);
      }).catch(() => {});
    }
  }, [isManager]);

  useEffect(() => {
    if (selectedEmp) loadDocuments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmp]);

  function showToast(msg, color) {
    setToast({ msg, color: color || C.green });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  }

  async function loadDocuments() {
    if (!selectedEmp) return;
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('employee_id', selectedEmp.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setDocuments(data || []);
    } catch (err) {
      console.error('Erreur chargement documents:', err);
    }
  }

  async function handleUpload() {
    if (!uploadForm.file || !uploadForm.title || !selectedEmp) {
      showToast('Remplis tous les champs', C.amber);
      return;
    }
    setUploading(true);
    try {
      const file = uploadForm.file;
      const ext = file.name.split('.').pop();
      const filePath = selectedEmp.id + '/' + Date.now() + '.' + ext;

      const { error: uploadError } = await supabase.storage
        .from('documents-rh')
        .upload(filePath, file, { contentType: file.type });

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('documents')
        .insert({
          employee_id: selectedEmp.id,
          type: uploadForm.type,
          title: uploadForm.title,
          file_path: filePath,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          periode: uploadForm.periode || null,
        });

      if (dbError) throw dbError;

      showToast('Document depose avec succes');
      setUploadModal(false);
      setUploadForm({ type: 'bulletin_paie', title: '', periode: '', file: null });
      await loadDocuments();
    } catch (err) {
      showToast('Erreur : ' + err.message, C.red);
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(doc) {
    try {
      const { data, error } = await supabase.storage
        .from('documents-rh')
        .createSignedUrl(doc.file_path, 60);
      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (err) {
      showToast('Erreur telechargement', C.red);
    }
  }

  async function handleDelete(doc) {
    if (!window.confirm('Supprimer ce document ?')) return;
    try {
      await supabase.storage.from('documents-rh').remove([doc.file_path]);
      await supabase.from('documents').delete().eq('id', doc.id);
      showToast('Document supprime');
      await loadDocuments();
    } catch (err) {
      showToast('Erreur suppression', C.red);
    }
  }

  const filtered = filterType === 'tous' ? documents : documents.filter(d => d.type === filterType);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Mono','Courier New',monospace", padding: '24px' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>

        <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ fontSize: '11px', color: C.muted, letterSpacing: '0.1em', marginBottom: '4px' }}>GED</div>
            <div style={{ fontSize: '18px', fontWeight: 600 }}>Documents RH</div>
          </div>
          {isManager && (
            <button onClick={() => setUploadModal(true)}
              style={{ background: C.purple, border: 'none', borderRadius: '8px', padding: '8px 16px', color: '#fff', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer' }}>
              + Deposer un document
            </button>
          )}
        </div>

        {/* Sélecteur salarié (manager uniquement) */}
        {isManager && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {employees.map((emp, i) => (
              <button key={emp.id}
                onClick={() => setSelectedEmp(emp)}
                style={{ padding: '6px 12px', borderRadius: '20px', border: '1px solid ' + (selectedEmp?.id === emp.id ? C.purple : C.border), background: selectedEmp?.id === emp.id ? C.purple + '22' : 'none', color: selectedEmp?.id === emp.id ? C.purple : C.muted, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: AVATAR_COLORS[i % AVATAR_COLORS.length] + '22', color: AVATAR_COLORS[i % AVATAR_COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 600 }}>
                  {initials(emp.first_name, emp.last_name)}
                </div>
                {emp.first_name} {emp.last_name}
              </button>
            ))}
          </div>
        )}

        {/* Filtres par type */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <button onClick={() => setFilterType('tous')}
            style={{ padding: '4px 12px', borderRadius: '20px', border: '1px solid ' + (filterType === 'tous' ? C.purple : C.border), background: filterType === 'tous' ? C.purple + '22' : 'none', color: filterType === 'tous' ? C.purple : C.muted, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }}>
            Tous ({documents.length})
          </button>
          {DOC_TYPES.map(t => {
            const count = documents.filter(d => d.type === t.id).length;
            if (count === 0) return null;
            return (
              <button key={t.id} onClick={() => setFilterType(t.id)}
                style={{ padding: '4px 12px', borderRadius: '20px', border: '1px solid ' + (filterType === t.id ? C.purple : C.border), background: filterType === t.id ? C.purple + '22' : 'none', color: filterType === t.id ? C.purple : C.muted, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }}>
                {t.icon} {t.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Liste des documents */}
        {filtered.length === 0 ? (
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '40px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', marginBottom: '10px' }}>📂</div>
            <div style={{ fontSize: '13px', color: C.muted }}>Aucun document pour l'instant</div>
            {isManager && <div style={{ fontSize: '11px', color: C.border, marginTop: '6px' }}>Cliquez sur "Deposer un document" pour commencer</div>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map((doc) => {
              const docType = DOC_TYPES.find(t => t.id === doc.type);
              return (
                <div key={doc.id} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ fontSize: '24px', flexShrink: 0 }}>{docType?.icon || '📎'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '3px' }}>{doc.title}</div>
                    <div style={{ fontSize: '11px', color: C.muted, display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <span>{docType?.label}</span>
                      {doc.periode && <span>Periode : {doc.periode}</span>}
                      {doc.file_size && <span>{formatSize(doc.file_size)}</span>}
                      <span>{new Date(doc.created_at).toLocaleDateString('fr-FR')}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button onClick={() => handleDownload(doc)}
                      style={{ background: C.purple + '22', border: '1px solid ' + C.purple + '44', borderRadius: '6px', padding: '6px 12px', color: C.purple, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit', fontWeight: 500 }}>
                      Ouvrir
                    </button>
                    {isManager && (
                      <button onClick={() => handleDelete(doc)}
                        style={{ background: 'none', border: '1px solid ' + C.border, borderRadius: '6px', padding: '6px 10px', color: C.muted, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }}>
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal upload */}
      {uploadModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }} onClick={() => setUploadModal(false)}>
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '360px' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Deposer un document</div>
            {selectedEmp && (
              <div style={{ fontSize: '12px', color: C.muted, marginBottom: '14px', padding: '8px 10px', background: C.bg, borderRadius: '6px' }}>
                Pour : {selectedEmp.first_name} {selectedEmp.last_name}
              </div>
            )}
            <div style={{ marginBottom: '10px' }}>
              <label style={lbl}>TYPE</label>
              <select style={inp} value={uploadForm.type} onChange={e => setUploadForm(f => ({ ...f, type: e.target.value }))}>
                {DOC_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label style={lbl}>TITRE</label>
              <input style={inp} placeholder="Ex: Bulletin mai 2026" value={uploadForm.title} onChange={e => setUploadForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label style={lbl}>PERIODE (optionnel)</label>
              <input style={inp} placeholder="Ex: 2026-05" value={uploadForm.periode} onChange={e => setUploadForm(f => ({ ...f, periode: e.target.value }))} />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={lbl}>FICHIER (PDF, image...)</label>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={e => setUploadForm(f => ({ ...f, file: e.target.files[0] }))} style={{ ...inp, padding: '6px' }} />
              {uploadForm.file && (
                <div style={{ fontSize: '11px', color: C.green, marginTop: '4px' }}>
                  {uploadForm.file.name} ({formatSize(uploadForm.file.size)})
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setUploadModal(false)} style={{ flex: 1, background: 'none', border: '1px solid ' + C.border, borderRadius: '6px', padding: '8px', color: C.muted, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>Annuler</button>
              <button onClick={handleUpload} disabled={uploading} style={{ flex: 1, background: C.purple, border: 'none', borderRadius: '6px', padding: '8px', color: '#fff', cursor: uploading ? 'not-allowed' : 'pointer', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600, opacity: uploading ? 0.7 : 1 }}>
                {uploading ? 'Envoi...' : 'Deposer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: C.card, border: '1px solid ' + (toast.color || C.green), borderRadius: '8px', padding: '10px 16px', fontSize: '12px', color: toast.color || C.green, zIndex: 200 }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
