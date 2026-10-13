import React, { useState } from 'react';
import { useTheme } from '../ThemeContext';
import ExportPaie from './ExportPaie';
import RegistrePersonnel from './RegistrePersonnel';

// Outil des bulletins groupes : charge seulement a l'ouverture (bibliotheque PDF volumineuse)
const BulletinsGroupes = React.lazy(() => import('./BulletinsGroupes'));

// Page Paie : export des elements variables et depot des bulletins de paie
export default function PaiePage() {
  const { colors: C } = useTheme();
  const [tab, setTab] = useState('export');
  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <div style={{ display: 'flex', gap: '4px', padding: '10px 24px 0', background: C.card, borderBottom: '1px solid ' + C.border }}>
        {[{ id: 'export', label: 'Export de paie' }, { id: 'bulletins', label: '📑 Bulletins de paie groupés' }, { id: 'registre', label: '📒 Registre du personnel' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '8px 14px', background: 'none', border: 'none', borderBottom: '2px solid ' + (tab === t.id ? C.purple : 'transparent'), color: tab === t.id ? C.purple : C.muted, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', fontWeight: tab === t.id ? 600 : 500 }}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'export' ? <ExportPaie /> : tab === 'registre' ? <RegistrePersonnel /> : (
        <React.Suspense fallback={<div style={{ padding: '30px', color: C.muted, fontSize: '13px' }}>Chargement...</div>}>
          <BulletinsGroupes inline onClose={() => setTab('export')} />
        </React.Suspense>
      )}
    </div>
  );
}
