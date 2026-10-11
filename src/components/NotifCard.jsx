import React, { useEffect, useState } from 'react';
import { useTheme } from '../ThemeContext';
import { notifStatus, enableNotifications, disableNotifications, isIOS } from '../notifications';

// Carte "Activer les notifications" (espace salarie, dashboard) ; une simple ligne quand elles sont activees
export default function NotifCard({ big }) {
  const { colors: C } = useTheme();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { notifStatus().then(setStatus); }, []);

  async function enable() {
    setBusy(true); setMsg('');
    try { await enableNotifications(); setStatus('on'); setMsg('Une notification d\'essai vient d\'être envoyée.'); }
    catch (err) { if (err.message === 'denied') setStatus('denied'); else setMsg('Activation impossible : ' + err.message); }
    finally { setBusy(false); }
  }
  async function disable() {
    setBusy(true);
    try { await disableNotifications(); setStatus('off'); setMsg(''); } finally { setBusy(false); }
  }

  if (!status || status === 'unsupported') return null;
  const card = { background: C.card, border: '1px solid ' + C.border, borderRadius: big ? '16px' : '12px', padding: big ? '16px' : '12px 14px', marginBottom: '14px', fontSize: big ? '14px' : '13px', lineHeight: 1.5 };

  if (status === 'on') return (
    <div style={{ fontSize: '12px', color: C.muted, marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
      🔔 Notifications activées sur cet appareil
      <button onClick={disable} disabled={busy} style={{ background: 'none', border: 'none', color: C.muted, textDecoration: 'underline', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', padding: 0 }}>Désactiver</button>
      {msg && <span style={{ color: C.green }}>{msg}</span>}
    </div>
  );

  if (status === 'ios-install') return (
    <div style={{ ...card, borderColor: C.purple + '66', background: C.purpleLight }}>
      <div style={{ fontWeight: 700, color: C.purple, marginBottom: '6px' }}>🔔 Recevoir les notifications sur l'iPhone</div>
      <div style={{ color: C.text }}>
        1. Touchez <strong>Partager</strong> <span style={{ fontSize: '16px' }}>⎋</span> en bas de Safari<br />
        2. Choisissez <strong>« Sur l'écran d'accueil »</strong><br />
        3. Ouvrez l'application depuis la nouvelle icône, puis revenez ici pour activer les notifications.
      </div>
    </div>
  );

  if (status === 'denied') return (
    <div style={{ ...card, color: C.muted }}>
      🔕 Les notifications sont bloquées pour ce site. Pour les autoriser : {isIOS() ? 'Réglages › Notifications › Planning HPA' : 'cadenas à gauche de l\'adresse › Notifications › Autoriser'}, puis rechargez la page.
    </div>
  );

  return (
    <div style={{ ...card, display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: big ? '28px' : '22px' }}>🔔</span>
      <div style={{ flex: 1, minWidth: '180px' }}>
        <div style={{ fontWeight: 700, color: C.text }}>Activer les notifications</div>
        <div style={{ fontSize: '12px', color: C.muted }}>Planning publié, absences, documents, rappels : directement sur cet appareil.</div>
        {msg && <div style={{ fontSize: '12px', color: C.red, marginTop: '4px' }}>{msg}</div>}
      </div>
      <button onClick={enable} disabled={busy}
        style={{ background: C.purple, border: 'none', borderRadius: big ? '12px' : '8px', padding: big ? '12px 18px' : '8px 14px', color: '#fff', fontWeight: 700, fontSize: big ? '15px' : '13px', cursor: 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>
        {busy ? '...' : 'Activer'}
      </button>
    </div>
  );
}
