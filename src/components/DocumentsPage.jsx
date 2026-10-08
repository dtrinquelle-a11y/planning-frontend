import React, { useState } from 'react';
import { useTheme } from '../ThemeContext';
import GED from './GED';
import DocumentsCommuns from './DocumentsCommuns';

// Page manager "Documents" : documents individuels (GED) et documents communs a signer
export default function DocumentsPage({ profile }) {
  const { colors: C } = useTheme();
  const [tab, setTab] = useState('individuels');
  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <div style={{ display: 'flex', gap: '4px', padding: '10px 24px 0', background: C.card, borderBottom: '1px solid ' + C.border }}>
        {[{ id: 'individuels', label: 'Documents des salariés' }, { id: 'communs', label: '📚 Documents communs' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '8px 14px', background: 'none', border: 'none', borderBottom: '2px solid ' + (tab === t.id ? C.purple : 'transparent'), color: tab === t.id ? C.purple : C.muted, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', fontWeight: tab === t.id ? 600 : 500 }}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'individuels' ? <GED profile={profile} /> : <DocumentsCommuns />}
    </div>
  );
}
