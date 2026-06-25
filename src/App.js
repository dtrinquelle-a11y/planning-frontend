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
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session) await loadProfile(session);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session) await loadProfile(session);
      else { setProfile(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadProfile(session) {
    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
      try {
        if (attempts > 0) setLoadingMsg('Reconnexion en cours... (' + attempts + '/' + maxAttempts + ')');
        const { data, error } = await supabase
          .from('user_profiles')
          .select('*, employees(*)')
          .eq('id', session.user.id)
          .single();
        if (error) throw error;
        setProfile(data);
        setPage(data?.role === 'salarie' ? 'salarie' : 'dashboard');
        setLoading(false);
        return;
      } catch (err) {
        attempts++;
        console.error('Tentative ' + attempts + ' echouee:', err.message);
        if (attempts < maxAttempts) {
          setLoadingMsg('Connexion lente, nouvelle tentative...');
          await new Promise(r => setTimeout(r, 2000));
        } else {
          console.error('Echec apres ' + maxAttempts + ' tentatives');
          setLoading(false);
        }
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
            style={{ padding: '5px 14px', borderRadius: '6px', border: '1px solid ' + (page === p.id ? C.purple : C.border), background: page === p.id ? C.purpleLight : 'none', color: page === p.id ? C.purple : C.muted, cursor: 'pointer', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'inherit', transition: 'all .15s' }}>
            {p.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '11px', color: C.muted }}>{empName} · {profile?.role}</span>
          <button onClick={toggle} title={darkMode ? 'Mode clair' : 'Mode sombre'}
            style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid ' + C.border, background: 'none', color: C.muted, cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit' }}>
            {darkMode ? '☀️' : '🌙'}
          </button>
          <button onClick={handleLogout}
            style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid ' + C.border, background: 'none', color: C.muted, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }}>
            Deconnexion
          </button>
        </div>
      </nav>
      {page === 'dashboard' && <Dashboard />}
      {page === 'planning' && <Planning />}
      {page === 'timeline' && <Timeline />}
      {page === 'salarie' && <EspaceSalarie />}
      {page === 'qrcode' && <QRCodePage />}
      {page === 'pointage' && <Pointeuse employeeId={profile?.employee_id} employeeName={empName} />}
      {page === 'ged' && <GED isManager={isManager} />}
      {page === 'dossiers' && <DossiersRH />}
      <HelpPanel />
    </div>
  );
}

export default function App() {
  return <ThemeProvider><AppInner /></ThemeProvider>;
}
