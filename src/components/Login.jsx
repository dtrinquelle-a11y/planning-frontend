import React, { useState } from 'react';
import supabase from '../supabase';
import { useTheme } from '../ThemeContext';

export default function Login({ onLogin }) {
  const { colors: C, darkMode, toggle } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      const { data: profile } = await supabase.from('user_profiles').select('*, employees(*)').eq('id', data.user.id).single();
      onLogin({ session: data.session, profile });
    } catch (err) {
      setError('Email ou mot de passe incorrect');
    } finally { setLoading(false); }
  }

  const inp = { width: '100%', background: C.bg, border: '1px solid ' + C.border, borderRadius: '8px', padding: '10px 12px', color: C.text, fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono','Courier New',monospace", padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '360px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '20px', fontWeight: 600, color: C.text, marginBottom: '6px' }}>
            <span style={{ color: C.purple }}>▸</span> PLANNING HPA
          </div>
          <div style={{ fontSize: '12px', color: C.muted }}>Hotellerie de Plein Air · IDCC 1631</div>
        </div>
        <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '24px', boxShadow: '0 4px 16px ' + C.shadow }}>
          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '20px', color: C.text }}>Connexion</div>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '10px', color: C.muted, letterSpacing: '0.08em', marginBottom: '5px' }}>EMAIL</label>
              <input type="email" style={inp} value={email} onChange={e => setEmail(e.target.value)} placeholder="votre@email.com" required />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '10px', color: C.muted, letterSpacing: '0.08em', marginBottom: '5px' }}>MOT DE PASSE</label>
              <input type="password" style={inp} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            {error && <div style={{ background: C.redLight, border: '1px solid ' + C.red + '44', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: C.red, marginBottom: '14px' }}>{error}</div>}
            <button type="submit" disabled={loading}
              style={{ width: '100%', background: loading ? C.border : C.purple, border: 'none', borderRadius: '8px', padding: '10px', color: '#fff', fontSize: '13px', fontFamily: 'inherit', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
        </div>
        <div style={{ textAlign: 'center', marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <span style={{ fontSize: '11px', color: C.muted }}>Mot de passe oublie ? Contactez votre manager.</span>
          <button onClick={toggle} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </div>
    </div>
  );
}
