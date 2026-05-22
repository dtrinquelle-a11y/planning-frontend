import React, { useState } from 'react';
import Dashboard from './components/Dashboard';
import Planning from './components/Planning';

const C = {
  bg: '#0F1117',
  card: '#1A1D27',
  border: '#2A2D3A',
  text: '#E8E6DC',
  muted: '#6B6E82',
  purple: '#7C6FCD',
};

export default function App() {
  const [page, setPage] = useState('dashboard');

  return (
    <div style={{ fontFamily: "'DM Mono','Courier New',monospace" }}>
      <nav style={{
        background: C.card,
        borderBottom: `1px solid ${C.border}`,
        padding: '10px 24px',
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
      }}>
        <span style={{ color: C.purple, fontWeight: 600, marginRight: '16px', fontSize: '13px' }}>
          ▸ PLANNING HPA
        </span>
        {[
          { id: 'dashboard', label: 'Dashboard' },
          { id: 'planning', label: 'Planning' },
        ].map(p => (
          <button key={p.id} onClick={() => setPage(p.id)} style={{
            padding: '5px 14px',
            borderRadius: '6px',
            border: `1px solid ${page === p.id ? C.purple : C.border}`,
            background: page === p.id ? C.purple + '22' : 'none',
            color: page === p.id ? C.purple : C.muted,
            cursor: 'pointer',
            fontSize: '11px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontFamily: 'inherit',
          }}>{p.label}</button>
        ))}
      </nav>
      {page === 'dashboard' ? <Dashboard /> : <Planning />}
    </div>
  );
}
