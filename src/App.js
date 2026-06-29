/* eslint-disable */
import HelpPanel from './components/HelpPanel';
import React, { useState, useEffect } from 'react';
import supabase from './supabase';
import { ThemeProvider, useTheme } from './ThemeContext';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Planning from './components/Planning';
import EspaceSalarie from './components/EspaceSalarie';
import Pointeuse from './components/Pointeuse';
import QRCodePage from './components/QRCodePage';
import GED from './components/GED';
import Timeline from './components/Timeline';
import Onboarding from './components/Onboarding';
import DossiersRH from './components/DossiersRH';

function AppInner() {
  const { colors: C, darkMode, toggle } = useTheme();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState('Chargement...');
  const [page, setPage] = useState(null);
  const isOnboarding = window.location.pathname === '/onboarding';

  useEffect(() => {
    if (isOnboarding) { setLoading(false); return; }

    // Strategie simplifiee: utiliser UNIQUEMENT onAuthStateChange.
    // L'evenement INITIAL_SESSION est fiable et arrive toujours en premier.
    // On pose un timeout global de 12s au cas ou Supabase ne repond pas du tout.
    let done = false;
    const globalTimeout = setTimeout(() => {
      if (!done) {
        done = true;
        console.warn('Timeout global 12s - passage au login');
        setLoading(false);
      }
    }, 12000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, sess) => {
      if (_event === 'INITIAL_SESSION') {
        if (done) return;
        done = true;
        clearTimeout(globalTimeout);
        setSession(sess);
        if (sess) {
          await loadProfile(sess);
        } else {
          setLoading(false);
        }
        return;
      }
      // Evenements ulterieurs (SIGNED_IN apres login manuel, SIGNED_OUT, TOKEN_REFRESHED)
      if (_event === 'SIGNED_OUT') {
        setSession(null); setProfile(null); setPage(null); setLoading(false);
        return;
      }
      if (_event === 'TOKEN_REFRESHED') return; // ignorer silencieusement
      setSession(sess);
      if (sess) await loadProfile(sess);
      else { setProfile(null); setLoading(false); }
    });

    return () => {
      clearTimeout(globalTimeout);
      subscription.unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadProfile(sess) {
    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
      try {
        if (attempts > 0) setLoadingMsg('Connexion lente, nouvelle tentative...');
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout profil (8s)')), 8000)
        );
        const queryPromise = supabase
          .from('user_profiles')
          .select('*, employees(*)')
          .eq('id', sess.user.id)
          .single();
        const { data, error } = await Promise.race([queryPromise, timeoutPromise]);
        if (error) throw error;
        setProfile(data);
        setPage(data?.role === 'salarie' ? 'salarie' : 'dashboard');
        setLoading(false);
        return;
      } catch (err) {
        attempts++;
        console.error('Tentative ' + attempts + ' echouee:', err.message);
        if (attempts >= maxAttempts) {
          // Echec total: deconnecter pour eviter un etat incoherent
          console.error('Echec chargement profil - deconnexion');
          await supabase.auth.signOut();
          setSession(null); setProfile(null); setPage(null);
          setLoading(false);
          return;
        }
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  function handleLogin({ session, profile }) {
    setSession(session); setProfile(profile);
    setPage(profile?.role === 'salarie' ? 'salarie' : 'dashboard');
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setSession(null); setProfile(null); setPage(null);
  }

  if (isOnboarding) return <Onboarding />;

  if (loading) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono','Courier New',monospace", gap: '16px' }}>
      <div style={{ color: C.muted, fontSize: '13px' }}>{loadingMsg}</div>
      <div style={{ display: 'flex', gap: '6px' }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: C.purple, animation: 'pulse 1.2s ease-in-out ' + (i*0.2) + 's infinite alternate', opacity: 0.4 }}/>
        ))}
      </div>
      <style>{`@keyframes pulse { from { opacity: 0.2; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }`}</style>
    </div>
  );

  if (!session) return <Login onLogin={handleLogin} />;

  const isManager = profile?.role === 'admin' || profile?.role === 'manager';
  const empName = profile?.employees ? profile.employees.first_name + ' ' + profile.employees.last_name : '';

  const navItems = isManager
    ? [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'planning', label: 'Planning' },
        { id: 'timeline', label: 'Timeline' },
        { id: 'salarie', label: 'Espace Salarie' },
        { id: 'qrcode', label: 'QR Codes' },
        { id: 'pointage', label: 'Pointeuse' },
        { id: 'ged', label: 'Documents' },
        { id: 'dossiers', label: 'Dossiers RH' },
      ]
    : [
        { id: 'salarie', label: 'Mon Planning' },
        { id: 'pointage', label: 'Pointeuse' },
      ];

  return (
    <div style={{ fontFamily: "'DM Mono','Courier New',monospace", background: C.bg, minHeight: '100vh' }}>
      <nav style={{ background: C.card, borderBottom: '1px solid ' + C.border, padding: '10px 24px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', boxShadow: C.shadow + ' 0 1px 4px' }}>
        <span style={{ color: C.purple, fontWeight: 600, marginRight: '16px', fontSize: '13px' }}>▸ PLANNING HPA</span>
        {navItems.map(p => (
          <button key={p.id} onClick={() => setPage(p.id)}
            style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: page === p.id ? C.purple : 'transparent', color: page === p.id ? '#fff' : C.muted, cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}
          >{p.label}</button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={toggle} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: C.muted }}>{darkMode ? '☀️' : '🌙'}</button>
          {empName && <span style={{ fontSize: '12px', color: C.muted }}>{empName}</span>}
          <button onClick={handleLogout} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid ' + C.border, background: 'none', color: C.muted, cursor: 'pointer', fontSize: '11px' }}>Déconnexion</button>
          <HelpPanel />
        </div>
      </nav>
      <div style={{ padding: '0' }}>
        {page === 'dashboard' && <Dashboard profile={profile} />}
        {page === 'planning' && <Planning profile={profile} />}
        {page === 'timeline' && <Timeline profile={profile} />}
        {page === 'salarie' && <EspaceSalarie profile={profile} />}
        {page === 'qrcode' && isManager && <QRCodePage />}
        {page === 'pointage' && <Pointeuse employeeId={profile?.employees?.id || profile?.employee_id} employeeName={(profile?.employees?.first_name || profile?.first_name || '') + ' ' + (profile?.employees?.last_name || profile?.last_name || '')} />}
        {page === 'ged' && isManager && <GED profile={profile} />}
        {page === 'dossiers' && isManager && <DossiersRH profile={profile} />}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}
