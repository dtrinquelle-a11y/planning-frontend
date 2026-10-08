import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase';
import { SignaturePad, buildDispensePdf, dispenseText } from './DispenseMutuelle';

// Photo trop lourde (telephone) : redimensionnee a 2000 px max et recompressee en JPEG pour passer sous la limite
async function compressImage(file, maxBytes) {
  if (!file.type.startsWith('image/') || file.size <= Math.min(maxBytes, 1.5 * 1024 * 1024)) return file;
  const img = await new Promise((resolve, reject) => {
    const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = URL.createObjectURL(file);
  });
  const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(img.src);
  for (const q of [0.8, 0.65, 0.5]) {
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size <= maxBytes) return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  }
  return file;
}

// Options d'un champ select : separees par "|" (ou "," pour les anciens champs)
function fieldOptions(field) {
  const raw = field.options || '';
  return raw.split(raw.includes('|') ? '|' : ',').map(o => o.trim()).filter(Boolean);
}

// Client dedie a l'onboarding : session en memoire, isolee de l'application.
// Evite d'attendre le verrou de session d'un autre onglet et de deconnecter un manager connecte.
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storageKey: 'sb-onboarding', persistSession: false, detectSessionInUrl: false },
});

// Evite un chargement infini si le reseau ne repond pas
function withTimeout(promise, ms = 15000) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('Le serveur ne repond pas, veuillez reessayer.')), ms))]);
}

const C = {
  bg: '#F5F6FA', card: '#FFFFFF', border: '#E5E7EF',
  text: '#111827', muted: '#6B7280', purple: '#5B4FD6',
  green: '#16A34A', amber: '#D97706', red: '#DC2626',
  purpleLight: '#EEF2FF', greenLight: '#F0FDF4', redLight: '#FEF2F2',
};

const inp = { width: '100%', background: C.bg, border: '1px solid ' + C.border, borderRadius: '8px', padding: '10px 12px', color: C.text, fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' };
const lbl = { display: 'block', fontSize: '11px', color: C.muted, letterSpacing: '0.06em', marginBottom: '5px', fontWeight: 500 };

// Lien de premier acces (?acces=...) : rattache le compte a une fiche salarie existante
const ACCESS_TOKEN = new URLSearchParams(window.location.search).get('acces');

export default function Onboarding() {
  const [step, setStep] = useState(ACCESS_TOKEN ? 'checking' : 'code');
  const [accessName, setAccessName] = useState('');
  const [fields, setFields] = useState([]);
  const [code, setCode] = useState('');
  const [identity, setIdentity] = useState({ email: '', first_name: '', last_name: '', password: '' });
  const [responses, setResponses] = useState({});
  const [files, setFiles] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [employeeId, setEmployeeId] = useState(null);
  const [privacyAck, setPrivacyAck] = useState(false);
  const [signatures, setSignatures] = useState({}); // champ signature -> image PNG
  const [sigAck, setSigAck] = useState({});         // champ signature -> case "je certifie" cochee

  // Un champ conditionnel n'est affiche (et obligatoire) que si la reponse attendue est choisie
  const isVisible = f => !f.show_if_field_id || responses[f.show_if_field_id] === f.show_if_value;
  const fieldByLabel = label => fields.find(f => f.label === label);

  useEffect(() => {
    if (ACCESS_TOKEN) {
      withTimeout(supabase.rpc('check_access_link', { p_token: ACCESS_TOKEN }))
        .then(({ data }) => {
          if (data?.valid) { setAccessName(data.first_name || ''); setStep('identity'); }
          else setStep('invalid');
        })
        .catch(() => setStep('invalid'));
      return;
    }
    supabase.from('onboarding_fields').select('*').eq('is_active', true).order('sort_order').then(({ data }) => {
      if (data) setFields(data);
    });
  }, []);

  async function validateCode() {
    setError(''); setLoading(true);
    try {
      // Verification cote serveur : la table des invitations n'est pas lisible publiquement
      const { data: ok, error: rpcError } = await withTimeout(supabase.rpc('check_invitation_code', { p_code: code }));
      if (rpcError) throw rpcError;
      if (ok !== true) { setError('Code invalide. Verifiez le code fourni par votre employeur.'); return; }
      setStep('identity');
    } catch (err) { setError(err.message || 'Erreur de verification du code.'); }
    finally { setLoading(false); }
  }

  async function createAccount() {
    setError(''); setLoading(true);
    try {
      if (!identity.email || !identity.password || (!ACCESS_TOKEN && (!identity.first_name || !identity.last_name))) {
        setError('Tous les champs sont obligatoires.'); return;
      }
      if (identity.password.length < 6) { setError('Le mot de passe doit contenir au moins 6 caracteres.'); return; }
      if (!privacyAck) { setError('Veuillez prendre connaissance de la politique de confidentialite.'); return; }
      const email = identity.email.trim().toLowerCase();

      // Créer le compte Supabase Auth
      const { data: authData, error: authError } = await withTimeout(supabase.auth.signUp({
        email,
        password: identity.password,
      }));
      if (authError) throw authError;
      // Email deja inscrit : Supabase renvoie un utilisateur sans identite
      if (authData.user && authData.user.identities && authData.user.identities.length === 0) {
        setError('Un compte existe deja avec cet email. Connectez-vous sur l\'application.'); return;
      }
      // Sans session (confirmation email active), l'envoi des pieces justificatives echouerait
      if (!authData.session) {
        setError('Compte cree, mais une confirmation par email est requise. Contactez votre responsable.'); return;
      }

      // Salarie existant : on rattache le compte a sa fiche grace au lien, sans dossier d'embauche
      if (ACCESS_TOKEN) {
        const { error: claimError } = await withTimeout(supabase.rpc('claim_access_link', { p_token: ACCESS_TOKEN }));
        if (claimError) throw claimError;
        setStep('access_done');
        return;
      }

      // Vérifier si l'email existe déjà dans employees
      const { data: existing } = await supabase.from('employees').select('id, first_name, last_name').ilike('email', email).maybeSingle();

      let empId;
      if (existing) {
        // L'email existe déjà — on lie juste le compte auth (et on complete le nom s'il manque)
        empId = existing.id;
        const patch = { onboarding_completed: false };
        if (!existing.first_name) patch.first_name = identity.first_name.trim();
        if (!existing.last_name) patch.last_name = identity.last_name.trim();
        await supabase.from('employees').update(patch).eq('id', empId);
      } else {
        // Créer le salarié
        const { data: emp, error: empError } = await supabase.from('employees').insert({
          first_name: identity.first_name.trim(),
          last_name: identity.last_name.trim(),
          email,
          service: 'Non defini',
          contract_type: 'Non defini',
          role: 'Employe',
          contract_hours: 35,
          hire_date: new Date().toISOString().slice(0, 10),
          is_active: false,
          onboarding_completed: false,
        }).select().single();
        if (empError) throw empError;
        empId = emp.id;
        // Initialiser le compteur de modulation sur la periode CC HPA en cours (1er nov -> 31 oct)
        const now = new Date();
        const startYear = now.getMonth() >= 10 ? now.getFullYear() : now.getFullYear() - 1;
        await supabase.from('modulation_counter').insert({ employee_id: empId, period_start: startYear + '-11-01', period_end: (startYear + 1) + '-10-31' });
      }

      // Lier le profil auth au salarié
      if (authData.user) {
        const { error: profileError } = await supabase.from('user_profiles').update({ employee_id: empId, role: 'salarie' }).eq('id', authData.user.id);
        if (profileError) throw profileError;
      }

      setEmployeeId(empId);
      setStep('form');
    } catch (err) {
      setError(err.message || 'Erreur lors de la creation du compte.');
    } finally { setLoading(false); }
  }

  async function submitForm() {
    setError('');
    const shown = fields.filter(isVisible);
    const missing = shown.filter(f => f.required && (
      f.field_type === 'file' ? !files[f.id]
      : f.field_type === 'signature' ? !(signatures[f.id] && sigAck[f.id])
      : !String(responses[f.id] || '').trim()));
    if (missing.length) { setError('Champs obligatoires manquants : ' + missing.map(f => f.label).join(', ')); return; }
    setLoading(true);
    try {
      const textFields = shown.filter(f => f.field_type !== 'file' && f.field_type !== 'signature');
      for (const field of textFields) {
        if (responses[field.id]) {
          const { error: respError } = await supabase.from('onboarding_responses').upsert({ employee_id: employeeId, field_id: field.id, value: responses[field.id] }, { onConflict: 'employee_id,field_id' });
          if (respError) throw respError;
        }
      }

      // Attestations signees : generation du PDF puis depot dans le dossier du salarie
      for (const field of shown.filter(f => f.field_type === 'signature' && signatures[f.id])) {
        const blob = buildDispensePdf({
          fullName: identity.first_name.trim() + ' ' + identity.last_name.trim(),
          email: identity.email.trim().toLowerCase(),
          motif: responses[fieldByLabel('Motif de dispense')?.id],
          organisme: responses[fieldByLabel('Organisme de votre mutuelle actuelle')?.id],
          signature: signatures[field.id],
        });
        const filePath = employeeId + '/onboarding/' + field.id + '.pdf';
        const { error: upErr } = await supabase.storage.from('documents-rh').upload(filePath, blob, { contentType: 'application/pdf', upsert: true });
        if (upErr) throw upErr;
        const { error: docErr } = await supabase.from('documents').insert({ employee_id: employeeId, type: 'autre', title: field.label, file_path: filePath, file_name: 'dispense-mutuelle-signee.pdf', file_size: blob.size, mime_type: 'application/pdf' });
        if (docErr) throw docErr;
        const { error: respErr } = await supabase.from('onboarding_responses').upsert({ employee_id: employeeId, field_id: field.id, value: filePath }, { onConflict: 'employee_id,field_id' });
        if (respErr) throw respErr;
      }

      const fileFields = shown.filter(f => f.field_type === 'file');
      for (const field of fileFields) {
        const file = files[field.id];
        if (!file) continue;
        const maxBytes = (field.max_file_size_kb || 2048) * 1024;
        if (file.size > maxBytes) { setError('Fichier "' + field.label + '" trop volumineux (max ' + field.max_file_size_kb + ' Ko).'); setLoading(false); return; }
        const ext = file.name.split('.').pop();
        const filePath = employeeId + '/onboarding/' + field.id + '.' + ext;
        const { error: uploadError } = await supabase.storage.from('documents-rh').upload(filePath, file, { contentType: file.type, upsert: true });
        if (uploadError) throw uploadError;
        const { error: docError } = await supabase.from('documents').insert({ employee_id: employeeId, type: 'autre', title: field.label, file_path: filePath, file_name: file.name, file_size: file.size, mime_type: file.type });
        if (docError) throw docError;
        const { error: respError } = await supabase.from('onboarding_responses').upsert({ employee_id: employeeId, field_id: field.id, value: filePath }, { onConflict: 'employee_id,field_id' });
        if (respError) throw respError;
      }

      const { error: doneError } = await supabase.from('employees').update({ onboarding_completed: true }).eq('id', employeeId);
      if (doneError) throw doneError;
      setStep('done');
    } catch (err) {
      setError(err.message || 'Erreur lors de la soumission.');
    } finally { setLoading(false); }
  }

  const textFields = fields.filter(f => isVisible(f) && f.field_type !== 'file' && f.field_type !== 'signature');
  const fileFields = fields.filter(f => isVisible(f) && f.field_type === 'file');
  const signatureFields = fields.filter(f => isVisible(f) && f.field_type === 'signature');

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: '560px' }}>

        <div style={{ textAlign: 'center', marginBottom: '28px', paddingTop: '20px' }}>
          <div style={{ fontSize: '20px', fontWeight: 600, color: C.text, marginBottom: '6px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}><span style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'linear-gradient(135deg, #6D5EF0, #4F46E5)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, boxShadow: '0 4px 12px rgba(79,70,229,0.35)' }}>HPA</span><span style={{ letterSpacing: '-0.01em' }}>Planning</span></span>
          </div>
          <div style={{ fontSize: '12px', color: C.muted }}>Le Bout du Monde · {ACCESS_TOKEN ? 'Premier accès' : "Dossier d'embauche"}</div>
        </div>

        {ACCESS_TOKEN && step === 'checking' && (
          <div style={{ textAlign: 'center', color: C.muted, fontSize: '13px', padding: '40px' }}>Verification du lien...</div>
        )}

        {ACCESS_TOKEN && step === 'invalid' && (
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '28px', textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '10px', color: C.text }}>Lien invalide ou expiré</div>
            <div style={{ fontSize: '13px', color: C.muted, lineHeight: 1.6 }}>
              Ce lien d'accès n'est plus valable (déjà utilisé ou expiré).<br />Demandez un nouveau lien à votre responsable.
            </div>
          </div>
        )}

        {ACCESS_TOKEN && step === 'access_done' && (
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>
            <div style={{ fontSize: '18px', fontWeight: 600, color: C.text, marginBottom: '10px' }}>Votre accès est créé !</div>
            <div style={{ fontSize: '13px', color: C.muted, lineHeight: 1.7, marginBottom: '24px' }}>
              Vous pouvez maintenant vous connecter avec votre email et votre mot de passe<br />pour consulter votre planning et pointer.
            </div>
            <a href="/" style={{ display: 'inline-block', background: C.purple, borderRadius: '8px', padding: '12px 24px', color: '#fff', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>Se connecter →</a>
          </div>
        )}

        {!ACCESS_TOKEN && step !== 'done' && (
          <div style={{ display: 'flex', gap: '4px', marginBottom: '24px' }}>
            {['code', 'identity', 'form'].map((s, i) => (
              <div key={s} style={{ flex: 1, height: '4px', borderRadius: '2px', background: ['code','identity','form'].indexOf(step) >= i ? C.purple : C.border, transition: 'background .3s' }} />
            ))}
          </div>
        )}

        {step === 'code' && (
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px', color: C.text }}>Bienvenue !</div>
            <div style={{ fontSize: '13px', color: C.muted, marginBottom: '24px', lineHeight: 1.6 }}>
              Entrez le code d'invitation fourni par votre employeur pour commencer votre dossier d'embauche.
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={lbl}>CODE D'INVITATION</label>
              <input style={{ ...inp, fontSize: '18px', textAlign: 'center', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600 }}
                placeholder="Votre code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && validateCode()} />
            </div>
            {error && <div style={{ background: C.redLight, border: '1px solid ' + C.red + '44', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: C.red, marginBottom: '14px' }}>{error}</div>}
            <button onClick={validateCode} disabled={loading || !code}
              style={{ width: '100%', background: C.purple, border: 'none', borderRadius: '8px', padding: '12px', color: '#fff', fontSize: '13px', fontFamily: 'inherit', fontWeight: 600, cursor: loading || !code ? 'not-allowed' : 'pointer', opacity: loading || !code ? 0.7 : 1 }}>
              {loading ? 'Verification...' : 'Continuer →'}
            </button>
          </div>
        )}

        {step === 'identity' && (
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px', color: C.text }}>{ACCESS_TOKEN ? 'Bonjour ' + accessName + ' !' : 'Vos informations'}</div>
            <div style={{ fontSize: '13px', color: C.muted, marginBottom: '24px' }}>{ACCESS_TOKEN ? 'Choisissez votre email et votre mot de passe pour accéder à votre planning.' : 'Creez votre espace personnel.'}</div>
            {!ACCESS_TOKEN && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div><label style={lbl}>PRENOM *</label><input style={inp} value={identity.first_name} onChange={e => setIdentity(i => ({ ...i, first_name: e.target.value }))} placeholder="Jean" /></div>
                <div><label style={lbl}>NOM *</label><input style={inp} value={identity.last_name} onChange={e => setIdentity(i => ({ ...i, last_name: e.target.value }))} placeholder="Dupont" /></div>
              </div>
            )}
            <div style={{ marginBottom: '12px' }}><label style={lbl}>EMAIL *</label><input type="email" style={inp} value={identity.email} onChange={e => setIdentity(i => ({ ...i, email: e.target.value }))} placeholder="jean.dupont@email.com" /></div>
            <div style={{ marginBottom: '16px' }}><label style={lbl}>MOT DE PASSE * (min. 6 caracteres)</label><input type="password" style={inp} value={identity.password} onChange={e => setIdentity(i => ({ ...i, password: e.target.value }))} placeholder="••••••••" /></div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '20px', fontSize: '12px', color: C.muted, lineHeight: 1.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={privacyAck} onChange={e => setPrivacyAck(e.target.checked)} style={{ marginTop: '2px', cursor: 'pointer' }} />
              <span>J'ai pris connaissance de la <a href="/confidentialite" target="_blank" rel="noreferrer" style={{ color: C.purple }}>politique de confidentialité</a> et du traitement de mes données{ACCESS_TOKEN ? '' : " pour mon dossier d'embauche"}. *</span>
            </label>
            {error && <div style={{ background: C.redLight, border: '1px solid ' + C.red + '44', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: C.red, marginBottom: '14px' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '8px' }}>
              {!ACCESS_TOKEN && <button onClick={() => setStep('code')} style={{ flex: 1, background: 'none', border: '1px solid ' + C.border, borderRadius: '8px', padding: '10px', color: C.muted, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>← Retour</button>}
              <button onClick={createAccount} disabled={loading} style={{ flex: 2, background: C.purple, border: 'none', borderRadius: '8px', padding: '10px', color: '#fff', fontSize: '13px', fontFamily: 'inherit', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Creation...' : 'Creer mon compte →'}
              </button>
            </div>
          </div>
        )}

        {step === 'form' && (
          <div>
            <div style={{ background: C.greenLight, border: '1px solid ' + C.green + '44', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: C.green }}>
              ✓ Compte cree ! Completez maintenant votre dossier d'embauche.
            </div>
            <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '24px', marginBottom: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '20px', color: C.text }}>Informations personnelles</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {textFields.map(field => (
                  <div key={field.id} style={{ gridColumn: field.label.toLowerCase().includes('adresse') || field.label.length > 30 || fieldOptions(field).some(o => o.length > 25) ? 'span 2' : 'span 1' }}>
                    <label style={lbl}>{field.label.toUpperCase()} {field.required ? '*' : ''}</label>
                    {field.field_type === 'select' ? (
                      <select style={inp} value={responses[field.id] || ''} onChange={e => setResponses(r => ({ ...r, [field.id]: e.target.value }))}>
                        <option value="">-- Choisir --</option>
                        {fieldOptions(field).map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={field.field_type} style={inp} value={responses[field.id] || ''} onChange={e => setResponses(r => ({ ...r, [field.id]: e.target.value }))} />
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '24px', marginBottom: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px', color: C.text }}>Pieces justificatives</div>
              <div style={{ fontSize: '12px', color: C.muted, marginBottom: '20px' }}>Taille max par fichier : 2 Mo · Formats : PDF, JPG, PNG</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {fileFields.map(field => (
                  <div key={field.id}>
                    <label style={lbl}>{field.label.toUpperCase()} {field.required ? '*' : ''}</label>
                    <div style={{ border: '2px dashed ' + (files[field.id] ? C.green : C.border), borderRadius: '8px', padding: '12px', background: files[field.id] ? C.greenLight : C.bg }}>
                      {/* Deux facons d'ajouter la piece : choisir un fichier, ou prendre une photo (ouvre l'appareil photo sur telephone) */}
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <label style={{ flex: 1, minWidth: '140px', textAlign: 'center', padding: '8px', border: '1px solid ' + C.border, borderRadius: '6px', background: C.card, fontSize: '12px', cursor: 'pointer' }}>
                          📁 Choisir un fichier
                          <input type="file" accept={field.accepted_formats || '.pdf,.jpg,.jpeg,.png'} style={{ display: 'none' }}
                            onChange={async e => { const f = e.target.files[0]; if (f) { const c = await compressImage(f, (field.max_file_size_kb || 2048) * 1024); setFiles(fs => ({ ...fs, [field.id]: c })); } e.target.value = ''; }} />
                        </label>
                        <label style={{ flex: 1, minWidth: '140px', textAlign: 'center', padding: '8px', border: '1px solid ' + C.purple + '66', borderRadius: '6px', background: C.purpleLight, color: C.purple, fontSize: '12px', cursor: 'pointer' }}>
                          📷 Prendre une photo
                          <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                            onChange={async e => { const f = e.target.files[0]; if (f) { const c = await compressImage(f, (field.max_file_size_kb || 2048) * 1024); setFiles(fs => ({ ...fs, [field.id]: c })); } e.target.value = ''; }} />
                        </label>
                      </div>
                      {files[field.id] && <div style={{ fontSize: '11px', color: C.green, marginTop: '6px' }}>✓ {files[field.id].name} ({Math.round(files[field.id].size / 1024)} Ko)</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {signatureFields.map(field => {
              const fullName = (identity.first_name + ' ' + identity.last_name).trim();
              const motif = responses[fieldByLabel('Motif de dispense')?.id];
              const organisme = responses[fieldByLabel('Organisme de votre mutuelle actuelle')?.id];
              return (
                <div key={field.id} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '24px', marginBottom: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px', color: C.text }}>{field.label} {field.required ? '*' : ''}</div>
                  <div style={{ fontSize: '12px', color: C.muted, marginBottom: '14px' }}>Relisez l'attestation, signez-la puis cochez la case de certification. Un PDF signé sera ajouté à votre dossier.</div>
                  <div style={{ background: C.bg, border: '1px solid ' + C.border, borderRadius: '8px', padding: '14px', marginBottom: '14px', fontSize: '12px', color: C.text, lineHeight: 1.6 }}>
                    {dispenseText({ fullName, motif, organisme }).map((p, i) => <p key={i} style={{ margin: '0 0 8px' }}>{p}</p>)}
                    {(!motif || !organisme) && <div style={{ color: C.amber, fontSize: '11px' }}>Renseignez le motif de dispense et l'organisme de votre mutuelle ci-dessus pour compléter l'attestation.</div>}
                  </div>
                  <SignaturePad color={C.green} onChange={img => setSignatures(s => ({ ...s, [field.id]: img }))} />
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '12px', fontSize: '12px', color: C.text, lineHeight: 1.5, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!sigAck[field.id]} onChange={e => setSigAck(a => ({ ...a, [field.id]: e.target.checked }))} style={{ marginTop: '2px', cursor: 'pointer' }} />
                    <span>Je certifie sur l'honneur l'exactitude des informations ci-dessus et signe cette attestation électroniquement. *</span>
                  </label>
                </div>
              );
            })}
            {error && <div style={{ background: C.redLight, border: '1px solid ' + C.red + '44', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: C.red, marginBottom: '14px' }}>{error}</div>}
            <button onClick={submitForm} disabled={loading}
              style={{ width: '100%', background: C.purple, border: 'none', borderRadius: '10px', padding: '14px', color: '#fff', fontSize: '14px', fontFamily: 'inherit', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Envoi en cours...' : 'Soumettre mon dossier ✓'}
            </button>
          </div>
        )}

        {step === 'done' && (
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>
            <div style={{ fontSize: '18px', fontWeight: 600, color: C.text, marginBottom: '10px' }}>Dossier soumis !</div>
            <div style={{ fontSize: '13px', color: C.muted, lineHeight: 1.7, marginBottom: '24px' }}>
              Votre dossier a bien ete transmis au responsable RH.<br />
              Vous recevrez une confirmation une fois votre compte valide.<br />
              Vous pourrez ensuite vous connecter sur l'application.
            </div>
            <div style={{ background: C.greenLight, border: '1px solid ' + C.green + '44', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', color: C.green }}>
              ✓ Dossier complet enregistre
            </div>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '11px', color: C.muted }}>
          Le Bout du Monde · 2 chemin de Rhodes, 11400 Verdun-en-Lauragais
          <br /><a href="/confidentialite" target="_blank" rel="noreferrer" style={{ color: C.muted }}>Politique de confidentialité</a>
        </div>
      </div>
    </div>
  );
}
