/* eslint-disable */
import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ThemeProvider, useTheme } from './ThemeContext';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Planning from './components/Planning';
import EspaceSalarie from './components/EspaceSalarie';
import Pointeuse from './components/Pointeuse';
import QRCodePage from './components/QRCodePage';
import GED from './components/GED';
import Timeline from './components/Timeline';

const supabase = createClient(
  'https://akulbjtaflucxkuwptjv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrdWxianRhZmx1Y3hrdXdwdGp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTQ1MjAsImV4cCI6MjA5NDY5MDUyMH0.bmG_qktEnmerg_pXp8PqLnMn2Z2EvKX5VTfaYAxEaSg'
);

function AppInner() {
  const { colors: C, darkMode, toggle } = useTheme();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadProfile();
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) { setProfile(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadProfile() {
    try {
      const { data } = await supabase.from('user_profiles').select('*, employees(*)').single();
      setProfile(data);
      setPage(data?.role === 'salarie' ? 'salarie' : 'dashboard');
    } catch (err) { console.error('Erreur profil:', err); }
    finally { setLoading(false); }
  }

  function handleLogin({ session, profile }) {
    setSession(session); setProfile(profile);
    setPage(profile?.role === 'salarie' ? 'salarie' : 'dashboard');
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setSession(null); setProfile(null); setPage(null);
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono','Courier New',monospace", color: C.muted, fontSize: '13px' }}>
      Chargement...
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
          <button key={p.id} onClick={() => setPage(p.id)} style={{ padding: '5px 14px', borderRadius: '6px', border: '1px solid ' + (page === p.id ? C.purple : C.border), background: page === p.id ? C.purpleLight : 'none', color: page === p.id ? C.purple : C.muted, cursor: 'pointer', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'inherit', transition: 'all .15s' }}>
            {p.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '11px', color: C.muted }}>{empName} · {profile?.role}</span>
          <button onClick={toggle} title={darkMode ? 'Mode clair' : 'Mode sombre'}
            style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid ' + C.border, background: 'none', color: C.muted, cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit' }}>
            {darkMode ? '☀️' : '🌙'}
          </button>
          <button onClick={handleLogout} style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid ' + C.border, background: 'none', color: C.muted, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }}>
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
    </div>
  );
}

export default function App() {
  return <ThemeProvider><AppInner /></ThemeProvider>;
}
