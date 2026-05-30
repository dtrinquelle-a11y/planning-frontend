import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://akulbjtaflucxkuwptjv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrdWxianRhZmx1Y3hrdXdwdGp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTQ1MjAsImV4cCI6MjA5NDY5MDUyMH0.bmG_qktEnmerg_pXp8PqLnMn2Z2EvKX5VTfaYAxEaSg'
);

const C = {
  bg: '#F4F6FA', card: '#FFFFFF', border: '#E2E5ED',
  text: '#1A1D27', muted: '#6B7280', purple: '#6C5FCD',
  green: '#16A34A', amber: '#D97706', red: '#DC2626',
  purpleLight: '#EEF2FF', greenLight: '#F0FDF4', redLight: '#FEF2F2',
};

const inp = { width: '100%', background: C.bg, border: '1px solid ' + C.border, borderRadius: '8px', padding: '10px 12px', color: C.text, fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' };
const lbl = { display: 'block', fontSize: '11px', color: C.muted, letterSpacing: '0.06em', marginBottom: '5px', fontWeight: 500 };

const SERVICES = ['Accueil', 'Housekeeping', 'Technique', 'Restauration'];
const CONTRACT_TYPES = ['CDI', 'CDD', 'Saisonnier', 'Interim', 'Stage'];

export default function Onboarding() {
  const [step, setStep] = useState('code'); // code, identity, form, done
  const [fields, setFields] = useState([]);
  const [code, setCode] = useState('');
  const [identity, setIdentity] = useState({ email: '', first_name: '', last_name: '', password: '', service: 'Accueil', contract_type: 'CDD' });
  const [responses, setResponses] = useState({});
  const [files, setFiles] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [employeeId, setEmployeeId] = useState(null);

  useEffect(() => {
    supabase.from('onboarding_fields').select('*').eq('is_active', true).order('sort_order').then(({ data }) => {
      if (data) setFields(data);
    });
  }, []);

  async function validateCode() {
    setError(''); setLoading(true);
    try {
      const { data } = await supabase.from('onboarding_invitations').select('*').eq('code', code.trim().toUpperCase()).eq('is_active', true).single();
      if (!data) { setError('Code invalide. Verifiez le code fourni par votre employeur.'); return; }
      setStep('identity');
    } catch { setError('Code invalide.'); }
    finally { setLoading(false); }
  }

  async function createAccount() {
    setError(''); setLoading(true);
    try {
      if (!identity.email || !identity.first_name || !identity.last_name || !identity.password) {
        setError('Tous les champs sont obligatoires.'); return;
      }
      if (identity.password.length < 6) { setError('Le mot de passe doit contenir au moins 6 caracteres.'); return; }

      // Créer le compte Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: identity.email,
        password: identity.password,
      });
      if (authError) throw authError;

      // Créer le salarié dans employees
      const { data: emp, error: empError } = await supabase.from('employees').insert({
        first_name: identity.first_name,
        last_name: identity.last_name,
        email: identity.email,
        service: identity.service,
        contract_type: identity.contract_type,
        role: 'Employe',
        contract_hours: 35,
        hire_date: new Date().toISOString().slice(0, 10),
        is_active: false, // En attente de validation admin
        onboarding_completed: false,
      }).select().single();
      if (empError) throw empError;

      // Lier le profil auth au salarié
      await supabase.from('user_profiles').update({ employee_id: emp.id, role: 'salarie' }).eq('id', authData.user.id);

      // Initialiser le compteur de modulation
      await supabase.from('modulation_counter').insert({ employee_id: emp.id, period_start: '2025-11-01', period_end: '2026-10-31' });

      setEmployeeId(emp.id);
      setStep('form');
    } catch (err) {
      setError(err.message || 'Erreur lors de la creation du compte.');
    } finally { setLoading(false); }
  }

  async function submitForm() {
    setError(''); setLoading(true);
    try {
      // Sauvegarder les réponses texte
      const textFields = fields.filter(f => f.field_type !== 'file');
      for (const field of textFields) {
        if (responses[field.id]) {
          await supabase.from('onboarding_responses').upsert({
            employee_id: employeeId,
            field_id: field.id,
            value: responses[field.id],
          });
        }
      }

      // Uploader les fichiers dans documents-rh
      const fileFields = fields.filter(f => f.field_type === 'file');
      for (const field of fileFields) {
        const file = files[field.id];
        if (!file) continue;
        const maxBytes = (field.max_file_size_kb || 2048) * 1024;
        if (file.size > maxBytes) {
          setError('Fichier "' + field.label + '" trop volumineux (max ' + field.max_file_size_kb + ' Ko).');
          setLoading(false); return;
        }
        const ext = file.name.split('.').pop();
        const filePath = employeeId + '/onboarding/' + field.id + '.' + ext;
        const { error: uploadError } = await supabase.storage.from('documents-rh').upload(filePath, file, { contentType: file.type, upsert: true });
        if (uploadError) throw uploadError;

        // Enregistrer dans documents
        await supabase.from('documents').upsert({
          employee_id: employeeId,
          type: 'autre',
          title: field.label,
          file_path: filePath,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
        });

        // Sauvegarder le chemin dans onboarding_responses
        await supabase.from('onboarding_responses').upsert({
          employee_id: employeeId,
          field_id: field.id,
          value: filePath,
        });
      }

      // Marquer l'onboarding comme complété
      await supabase.from('employees').update({ onboarding_completed: true }).eq('id', employeeId);

      setStep('done');
    } catch (err) {
      setError(err.message || 'Erreur lors de la soumission.');
    } finally { setLoading(false); }
  }

  const textFields = fields.filter(f => f.field_type !== 'file');
  const fileFields = fields.filter(f => f.field_type === 'file');

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'DM Mono','Courier New',monospace", padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: '560px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px', paddingTop: '20px' }}>
          <div style={{ fontSize: '20px', fontWeight: 600, color: C.text, marginBottom: '6px' }}>
            <span style={{ color: C.purple }}>▸</span> PLANNING HPA
          </div>
          <div style={{ fontSize: '12px', color: C.muted }}>Le Bout du Monde · Dossier d'embauche</div>
        </div>

        {/* Indicateur étapes */}
        {step !== 'done' && (
          <div style={{ display: 'flex', gap: '4px', marginBottom: '24px' }}>
            {['code', 'identity', 'form'].map((s, i) => (
              <div key={s} style={{ flex: 1, height: '4px', borderRadius: '2px', background: ['code','identity','form'].indexOf(step) >= i ? C.purple : C.border, transition: 'background .3s' }} />
            ))}
          </div>
        )}

        {/* ÉTAPE 1 : Code */}
        {step === 'code' && (
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px', color: C.text }}>Bienvenue !</div>
            <div style={{ fontSize: '13px', color: C.muted, marginBottom: '24px', lineHeight: 1.6 }}>
              Entrez le code d'invitation fourni par votre employeur pour commencer votre dossier d'embauche.
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={lbl}>CODE D'INVITATION</label>
              <input style={{ ...inp, fontSize: '18px', textAlign: 'center', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600 }}
                placeholder="HPA-2026"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && validateCode()}
              />
            </div>
            {error && <div style={{ background: C.redLight, border: '1px solid ' + C.red + '44', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: C.red, marginBottom: '14px' }}>{error}</div>}
            <button onClick={validateCode} disabled={loading || !code}
              style={{ width: '100%', background: C.purple, border: 'none', borderRadius: '8px', padding: '12px', color: '#fff', fontSize: '13px', fontFamily: 'inherit', fontWeight: 600, cursor: loading || !code ? 'not-allowed' : 'pointer', opacity: loading || !code ? 0.7 : 1 }}>
              {loading ? 'Verification...' : 'Continuer →'}
            </button>
          </div>
        )}

        {/* ÉTAPE 2 : Identité */}
        {step === 'identity' && (
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px', color: C.text }}>Vos informations</div>
            <div style={{ fontSize: '13px', color: C.muted, marginBottom: '24px' }}>Creez votre espace personnel.</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div><label style={lbl}>PRENOM *</label><input style={inp} value={identity.first_name} onChange={e => setIdentity(i => ({ ...i, first_name: e.target.value }))} placeholder="Jean" /></div>
              <div><label style={lbl}>NOM *</label><input style={inp} value={identity.last_name} onChange={e => setIdentity(i => ({ ...i, last_name: e.target.value }))} placeholder="Dupont" /></div>
            </div>
            <div style={{ marginBottom: '12px' }}><label style={lbl}>EMAIL *</label><input type="email" style={inp} value={identity.email} onChange={e => setIdentity(i => ({ ...i, email: e.target.value }))} placeholder="jean.dupont@email.com" /></div>
            <div style={{ marginBottom: '12px' }}><label style={lbl}>MOT DE PASSE * (min. 6 caracteres)</label><input type="password" style={inp} value={identity.password} onChange={e => setIdentity(i => ({ ...i, password: e.target.value }))} placeholder="••••••••" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div><label style={lbl}>SERVICE</label>
                <select style={inp} value={identity.service} onChange={e => setIdentity(i => ({ ...i, service: e.target.value }))}>
                  {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div><label style={lbl}>TYPE CONTRAT</label>
                <select style={inp} value={identity.contract_type} onChange={e => setIdentity(i => ({ ...i, contract_type: e.target.value }))}>
                  {CONTRACT_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {error && <div style={{ background: C.redLight, border: '1px solid ' + C.red + '44', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: C.red, marginBottom: '14px' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setStep('code')} style={{ flex: 1, background: 'none', border: '1px solid ' + C.border, borderRadius: '8px', padding: '10px', color: C.muted, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>← Retour</button>
              <button onClick={createAccount} disabled={loading} style={{ flex: 2, background: C.purple, border: 'none', borderRadius: '8px', padding: '10px', color: '#fff', fontSize: '13px', fontFamily: 'inherit', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Creation...' : 'Creer mon compte →'}
              </button>
            </div>
          </div>
        )}

        {/* ÉTAPE 3 : Formulaire */}
        {step === 'form' && (
          <div>
            <div style={{ background: C.greenLight, border: '1px solid ' + C.green + '44', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: C.green }}>
              ✓ Compte cree ! Completez maintenant votre dossier d'embauche.
            </div>

            {/* Informations texte */}
            <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '24px', marginBottom: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '20px', color: C.text }}>Informations personnelles</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {textFields.map(field => (
                  <div key={field.id} style={{ gridColumn: field.field_type === 'text' && field.label.toLowerCase().includes('adresse') ? 'span 2' : 'span 1' }}>
                    <label style={lbl}>{field.label.toUpperCase()} {field.required ? '*' : ''}</label>
                    {field.field_type === 'select' ? (
                      <select style={inp} value={responses[field.id] || ''} onChange={e => setResponses(r => ({ ...r, [field.id]: e.target.value }))}>
                        <option value="">-- Choisir --</option>
                        {(field.options || '').split(',').map(o => <option key={o} value={o.trim()}>{o.trim()}</option>)}
                      </select>
                    ) : (
                      <input type={field.field_type} style={inp} value={responses[field.id] || ''} onChange={e => setResponses(r => ({ ...r, [field.id]: e.target.value }))} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Pièces justificatives */}
            <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '24px', marginBottom: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px', color: C.text }}>Pieces justificatives</div>
              <div style={{ fontSize: '12px', color: C.muted, marginBottom: '20px' }}>Taille max par fichier : 2 Mo · Formats acceptes : PDF, JPG, PNG</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {fileFields.map(field => (
                  <div key={field.id}>
                    <label style={lbl}>{field.label.toUpperCase()} {field.required ? '*' : ''}</label>
                    <div style={{ border: '2px dashed ' + (files[field.id] ? C.green : C.border), borderRadius: '8px', padding: '12px', background: files[field.id] ? C.greenLight : C.bg, transition: 'all .2s' }}>
                      <input type="file" accept={field.accepted_formats || '.pdf,.jpg,.jpeg,.png'}
                        onChange={e => { const f = e.target.files[0]; if (f) setFiles(fs => ({ ...fs, [field.id]: f })); }}
                        style={{ width: '100%', fontSize: '12px', color: C.text, fontFamily: 'inherit', cursor: 'pointer' }} />
                      {files[field.id] && (
                        <div style={{ fontSize: '11px', color: C.green, marginTop: '6px' }}>
                          ✓ {files[field.id].name} ({Math.round(files[field.id].size / 1024)} Ko)
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {error && <div style={{ background: C.redLight, border: '1px solid ' + C.red + '44', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: C.red, marginBottom: '14px' }}>{error}</div>}

            <button onClick={submitForm} disabled={loading}
              style={{ width: '100%', background: C.purple, border: 'none', borderRadius: '10px', padding: '14px', color: '#fff', fontSize: '14px', fontFamily: 'inherit', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Envoi en cours...' : 'Soumettre mon dossier ✓'}
            </button>
          </div>
        )}

        {/* ÉTAPE 4 : Terminé */}
        {step === 'done' && (
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>
            <div style={{ fontSize: '18px', fontWeight: 600, color: C.text, marginBottom: '10px' }}>Dossier soumis !</div>
            <div style={{ fontSize: '13px', color: C.muted, lineHeight: 1.7, marginBottom: '24px' }}>
              Votre dossier a bien ete transmis au responsable RH.<br />
              Vous recevrez un email de confirmation une fois votre compte valide.<br />
              Vous pourrez ensuite vous connecter sur l'application.
            </div>
            <div style={{ background: C.greenLight, border: '1px solid ' + C.green + '44', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', color: C.green }}>
              ✓ Dossier complet enregistre
            </div>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '11px', color: C.muted }}>
          Le Bout du Monde · 2 chemin de Rhodes, 11400 Verdun-en-Lauragais
        </div>
      </div>
    </div>
  );
}
