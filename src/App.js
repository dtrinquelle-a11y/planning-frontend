/* eslint-disable */
import Parametrage from './components/Parametrage';
import React, { useState, useEffect, useRef } from 'react';
import supabase from './supabase';
import { ThemeProvider, useTheme } from './ThemeContext';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Planning from './components/Planning';
import EspaceSalarie from './components/EspaceSalarie';
import Pointeuse from './components/Pointeuse';
import QRCodePage from './components/QRCodePage';
import DocumentsPage from './components/DocumentsPage';
import Timeline from './components/Timeline';
import Onboarding from './components/Onboarding';
import DossiersRH from './components/DossiersRH';
import Confidentialite from './components/Confidentialite';
import ResetPassword from './components/ResetPassword';
import Absences from './components/Absences';
import ExportPaie from './components/ExportPaie';
import Realise from './components/Realise';
import { fetchManagerBadges, fetchEmployeeBadges, Badge } from './badges';
import { fetchTimeclockEnabled } from './declarations';

function AppInner() {
  const { colors: C, darkMode, toggle } = useTheme();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState('Chargement...');
  const [page, setPage] = useState(null);
  const isOnboarding = window.location.pathname === '/onboarding';
  const isConfidentialite = window.location.pathname === '/confidentialite';
  const isReset = window.location.pathname === '/reinitialiser';
  const authRequestId = useRef(0);
  const [badges, setBadges] = useState({}); // pastilles : nombre d'elements a traiter par onglet
  const [timeclockOn, setTimeclockOn] = useState(true); // pointeuse active (sinon : horaires declares)
  const justLoggedInRef = useRef(false);

  useEffect(() => {
    if (isOnboarding || isConfidentialite || isReset) { setLoading(false); return; }

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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, sess) => {
      if (event === 'INITIAL_SESSION') {
        if (done) return;
        done = true;
        clearTimeout(globalTimeout);
        setSession(sess);
        if (sess) {
          authRequestId.current += 1;
          // Differe hors du callback : un appel Supabase attendu ici bloque le verrou de session (recommandation Supabase)
          const reqId = authRequestId.current;
          setTimeout(() => loadProfile(sess, reqId), 0);
        } else {
          setLoading(false);
        }
        return;
      }
      // Evenements ulterieurs (SIGNED_IN apres login manuel, SIGNED_OUT, TOKEN_REFRESHED)
      if (event === 'SIGNED_OUT') {
        authRequestId.current += 1;
        setSession(null); setProfile(null); setPage(null); setLoading(false);
        return;
      }
      if (event === 'TOKEN_REFRESHED') return; // ignorer silencieusement
      if (event === 'SIGNED_IN' && justLoggedInRef.current) {
        // Login manuel deja traite directement par handleLogin: on evite une 2e requete concurrente
        justLoggedInRef.current = false;
        setSession(sess);
        return;
      }
      setSession(sess);
      if (sess) {
        authRequestId.current += 1;
        const reqId = authRequestId.current;
        setTimeout(() => loadProfile(sess, reqId), 0);
      } else { setProfile(null); setLoading(false); }
    });

    return () => {
      clearTimeout(globalTimeout);
      subscription.unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadProfile(sess, requestId) {
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
        if (requestId !== authRequestId.current) return; // une requete plus recente a deja pris le relais
        setProfile(data);
        setPage(data?.role === 'salarie' ? 'salarie' : 'dashboard');
        setLoading(false);
        return;
      } catch (err) {
        attempts++;
        console.error('Tentative ' + attempts + ' echouee:', err.message);
        if (requestId !== authRequestId.current) return; // requete obsolete, on abandonne silencieusement
        if (attempts >= maxAttempts) {
          // Echec total: deconnecter pour eviter un etat incoherent
          console.error('Echec chargement profil - deconnexion');
          await supabase.auth.signOut();
          if (requestId === authRequestId.current) {
            setSession(null); setProfile(null); setPage(null);
            setLoading(false);
          }
          return;
        }
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  function handleLogin({ session, profile }) {
    authRequestId.current += 1; // invalide toute requete de profil en cours (ex: retry sur connexion lente)
    justLoggedInRef.current = true;
    setSession(session); setProfile(profile);
    setPage(profile?.role === 'salarie' ? 'salarie' : 'dashboard');
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setSession(null); setProfile(null); setPage(null);
  }

  // Pastilles : recalculees au chargement, a chaque changement de page, toutes les minutes et sur demande
  const badgeRole = profile?.role;
  const badgeEmpId = profile?.employees?.id || profile?.employee_id;
  useEffect(() => {
    if (!session || !badgeRole) return;
    const manager = badgeRole === 'admin' || badgeRole === 'manager';
    const refresh = () => (manager ? fetchManagerBadges() : fetchEmployeeBadges(badgeEmpId))
      .then(b => setBadges(manager ? b : { salarie: b.absences + b.documents + b.signer + b.horaires, ...b }))
      .catch(() => {});
    refresh();
    fetchTimeclockEnabled().then(setTimeclockOn).catch(() => {});
    const timer = setInterval(refresh, 60 * 1000);
    window.addEventListener('badges-refresh', refresh);
    return () => { clearInterval(timer); window.removeEventListener('badges-refresh', refresh); };
  }, [session, badgeRole, badgeEmpId, page]);

  if (isOnboarding) return <Onboarding />;
  if (isConfidentialite) return <Confidentialite />;
  if (isReset) return <ResetPassword />;

  if (loading) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", gap: '16px' }}>
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
        { id: 'absences', label: 'Absences' },
        { id: 'realise', label: 'Réalisé' },
        { id: 'paie', label: 'Paie' },
        { id: 'salarie', label: 'Espace Salarie' },
        { id: 'qrcode', label: 'QR Codes' },
        { id: 'pointage', label: 'Pointeuse' },
        { id: 'ged', label: 'Documents' },
        { id: 'dossiers', label: 'Dossiers RH' },
        { id: 'parametrage', label: 'Paramétrage' },
      ]
    : [
        { id: 'salarie', label: 'Mon Planning' },
        // Pointeuse desactivee : les horaires se valident dans Mon Planning > Mes horaires
        ...(timeclockOn ? [{ id: 'pointage', label: 'Pointeuse' }] : []),
      ];

  return (
    <div style={{ fontFamily: "'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", background: C.bg, minHeight: '100vh' }}>
      <nav style={{ position: 'sticky', top: 0, zIndex: 90, background: darkMode ? 'rgba(21,24,33,0.85)' : 'rgba(255,255,255,0.85)', backdropFilter: 'saturate(180%) blur(12px)', WebkitBackdropFilter: 'saturate(180%) blur(12px)', borderBottom: '1px solid ' + C.border, padding: '10px 24px', display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '18px' }}>
          <span style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(135deg, #6D5EF0, #4F46E5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, letterSpacing: '0.02em', boxShadow: '0 2px 6px rgba(79,70,229,0.35)' }}>HPA</span>
          <span style={{ color: C.text, fontWeight: 700, fontSize: '14px', letterSpacing: '-0.01em' }}>Planning</span>
        </span>
        {navItems.map(p => (
          <button key={p.id} onClick={() => setPage(p.id)} className={page === p.id ? undefined : 'nav-tab'}
            style={{ position: 'relative', padding: '7px 12px', borderRadius: '999px', border: 'none', background: page === p.id ? C.purpleLight : 'transparent', color: page === p.id ? C.purple : C.muted, cursor: 'pointer', fontSize: '13px', fontWeight: page === p.id ? 600 : 500, fontFamily: 'inherit' }}
          >{p.label}<Badge count={isManager ? (p.id === 'absences' ? badges.absences : p.id === 'dossiers' ? badges.dossiers : 0) : (p.id === 'salarie' ? badges.salarie : 0)} /></button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={toggle} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: C.muted }}>{darkMode ? '☀️' : '🌙'}</button>
          {empName && <span style={{ fontSize: '12px', color: C.muted }}>{empName}</span>}
          <a href="/confidentialite" target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: C.muted }}>Confidentialité</a>
          <button onClick={handleLogout} style={{ padding: '6px 12px', borderRadius: '999px', border: '1px solid ' + C.border, background: C.card, color: C.text, cursor: 'pointer', fontSize: '12px', fontWeight: 500, fontFamily: 'inherit' }}>Déconnexion</button>
        </div>
      </nav>
      <div style={{ padding: '0' }}>
        {page === 'dashboard' && <Dashboard profile={profile} />}
        {page === 'planning' && <Planning profile={profile} />}
        {page === 'timeline' && <Timeline profile={profile} />}
        {page === 'salarie' && <EspaceSalarie profile={profile} />}
        {page === 'qrcode' && isManager && <QRCodePage />}
        {page === 'pointage' && <Pointeuse employeeId={profile?.employees?.id || profile?.employee_id} employeeName={(profile?.employees?.first_name || profile?.first_name || '') + ' ' + (profile?.employees?.last_name || profile?.last_name || '')} />}
        {page === 'ged' && isManager && <DocumentsPage profile={profile} />}
        {page === 'absences' && isManager && <Absences />}
        {page === 'paie' && isManager && <ExportPaie />}
        {page === 'realise' && isManager && <Realise />}
        {page === 'dossiers' && isManager && <DossiersRH profile={profile} />}
        {page === 'parametrage' && <Parametrage />}
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
