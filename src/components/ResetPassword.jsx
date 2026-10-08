import React, { useEffect, useState } from 'react';
import supabase from '../supabase';

// Page /reinitialiser : ouverte depuis le lien de l'email "mot de passe oublie".
// Supabase lit le jeton present dans l'URL et ouvre une session de recuperation.
const C = { bg: '#F5F6FA', card: '#FFFFFF', border: '#E5E7EF', text: '#111827', muted: '#6B7280', purple: '#5B4FD6', green: '#16A34A', red: '#DC2626', redLight: '#FEF2F2', greenLight: '#F0FDF4' };
const inp = { width: '100%', background: C.bg, border: '1px solid ' + C.border, borderRadius: '8px', padding: '10px 12px', color: C.text, fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' };
const lbl = { display: 'block', fontSize: '10px', color: C.muted, letterSpacing: '0.08em', marginBottom: '5px' };

export default function ResetPassword() {
  const [status, setStatus] = useState('checking'); // checking | ready | invalid | done
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Lien expire ou deja utilise : Supabase renvoie l'erreur dans l'URL
    const params = new URLSearchParams(window.location.hash.slice(1) + '&' + window.location.search.slice(1));
    if (params.get('error') || params.get('error_code')) { setStatus('invalid'); return; }

    // Pas d'appel Supabase attendu dans ce callback (risque de blocage du verrou de session)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (session && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN'))) setStatus('ready');
      else if (event === 'INITIAL_SESSION' && !session) setStatus(s => (s === 'checking' ? 'invalid' : s));
    });
    const timer = setTimeout(() => setStatus(s => (s === 'checking' ? 'invalid' : s)), 10000);
    return () => { subscription.unsubscribe(); clearTimeout(timer); };
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Le mot de passe doit contenir au moins 6 caracteres.'); return; }
    if (password !== confirm) { setError('Les deux mots de passe ne correspondent pas.'); return; }
    setLoading(true);
    try {
      const { error: updError } = await supabase.auth.updateUser({ password });
      if (updError) throw updError;
      await supabase.auth.signOut();
      setStatus('done');
    } catch (err) {
      setError(err.message || 'Erreur lors du changement de mot de passe.');
    } finally { setLoading(false); }
  }

  const card = { background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '24px', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' };
  const btn = { width: '100%', background: C.purple, border: 'none', borderRadius: '8px', padding: '10px', color: '#fff', fontSize: '13px', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer', textAlign: 'center', textDecoration: 'none', display: 'block', boxSizing: 'border-box' };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '360px' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px', fontSize: '20px', fontWeight: 600, color: C.text }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}><span style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'linear-gradient(135deg, #6D5EF0, #4F46E5)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, boxShadow: '0 4px 12px rgba(79,70,229,0.35)' }}>HPA</span><span style={{ letterSpacing: '-0.01em' }}>Planning</span></span>
        </div>

        {status === 'checking' && <div style={{ ...card, textAlign: 'center', color: C.muted, fontSize: '13px' }}>Verification du lien...</div>}

        {status === 'invalid' && (
          <div style={{ ...card, textAlign: 'center' }}>
            <div style={{ fontSize: '15px', fontWeight: 600, color: C.text, marginBottom: '10px' }}>Lien invalide ou expiré</div>
            <div style={{ fontSize: '12px', color: C.muted, lineHeight: 1.6, marginBottom: '18px' }}>Ce lien de réinitialisation n'est plus valable. Faites une nouvelle demande depuis l'écran de connexion.</div>
            <a href="/" style={btn}>Retour à la connexion</a>
          </div>
        )}

        {status === 'ready' && (
          <form onSubmit={submit} style={card}>
            <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '20px', color: C.text }}>Nouveau mot de passe</div>
            <div style={{ marginBottom: '12px' }}>
              <label style={lbl}>NOUVEAU MOT DE PASSE (min. 6 caractères)</label>
              <input type="password" style={inp} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={lbl}>CONFIRMATION</label>
              <input type="password" style={inp} value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" required />
            </div>
            {error && <div style={{ background: C.redLight, border: '1px solid ' + C.red + '44', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: C.red, marginBottom: '14px' }}>{error}</div>}
            <button type="submit" disabled={loading} style={{ ...btn, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Enregistrement...' : 'Changer mon mot de passe'}
            </button>
          </form>
        )}

        {status === 'done' && (
          <div style={{ ...card, textAlign: 'center' }}>
            <div style={{ fontSize: '15px', fontWeight: 600, color: C.green, marginBottom: '10px' }}>✓ Mot de passe modifié</div>
            <div style={{ fontSize: '12px', color: C.muted, marginBottom: '18px' }}>Vous pouvez vous connecter avec votre nouveau mot de passe.</div>
            <a href="/" style={btn}>Se connecter</a>
          </div>
        )}
      </div>
    </div>
  );
}
