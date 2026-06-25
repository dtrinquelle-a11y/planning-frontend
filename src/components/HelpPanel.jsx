import React, { useState, useEffect } from 'react';
import { useTheme } from '../ThemeContext';
import supabase from '../supabase';

export default function HelpPanel({ isAdmin }) {
  const { colors: C } = useTheme();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('news');
  const [changelog, setChangelog] = useState([]);
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [saving, setSaving] = useState(false);
  const [addingEntry, setAddingEntry] = useState(false);
  const [newEntry, setNewEntry] = useState({ date: new Date().toISOString().slice(0,10), items: '' });

  useEffect(() => {
    if (open) {
      if (tab === 'news') loadChangelog();
      if (tab === 'notes') loadNotes();
    }
  }, [open, tab]);

  async function loadChangelog() {
    const { data } = await supabase.from('changelog').select('*').order('date', { ascending: false });
    setChangelog(data || []);
  }

  async function loadNotes() {
    const { data } = await supabase.from('dev_notes').select('*').order('created_at', { ascending: false }).limit(20);
    setNotes(data || []);
  }

  async function addNote() {
    if (!newNote.trim()) return;
    setSaving(true);
    try {
      await supabase.from('dev_notes').insert({ content: newNote.trim(), author: authorName.trim() || 'Anonyme' });
      setNewNote('');
      await loadNotes();
    } catch {}
    finally { setSaving(false); }
  }

  async function deleteNote(id) {
    await supabase.from('dev_notes').delete().eq('id', id);
    setNotes(prev => prev.filter(n => n.id !== id));
  }

  async function addChangelogEntry() {
    if (!newEntry.items.trim()) return;
    setSaving(true);
    try {
      const items = newEntry.items.split('\n').map(s => s.trim()).filter(Boolean);
      await supabase.from('changelog').insert({ date: newEntry.date, items });
      setNewEntry({ date: new Date().toISOString().slice(0,10), items: '' });
      setAddingEntry(false);
      await loadChangelog();
    } catch {}
    finally { setSaving(false); }
  }

  async function deleteEntry(id) {
    await supabase.from('changelog').delete().eq('id', id);
    setChangelog(prev => prev.filter(e => e.id !== id));
  }

  const months = ['jan','fev','mars','avr','mai','juin','juil','aout','sep','oct','nov','dec'];
  function fmtDate(d) { const dt = new Date(d); return dt.getDate() + ' ' + months[dt.getMonth()] + ' ' + dt.getFullYear(); }

  const inp = { width: '100%', background: C.bg, border: '1px solid ' + C.border, borderRadius: '6px', padding: '8px 10px', color: C.text, fontSize: '12px', fontFamily: 'inherit', boxSizing: 'border-box' };

  return (
    <>
      <button onClick={() => setOpen(o => !o)}
        style={{ position: 'fixed', bottom: '24px', left: '24px', width: '40px', height: '40px', borderRadius: '50%', background: open ? C.purple : C.card, border: '2px solid ' + C.purple, color: open ? '#fff' : C.purple, fontSize: '16px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', zIndex: 300, boxShadow: '0 4px 12px ' + C.shadow, transition: 'all .2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {open ? '×' : '?'}
      </button>

      {open && (
        <div style={{ position: 'fixed', bottom: '72px', left: '24px', width: '380px', maxHeight: '70vh', background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', boxShadow: '0 8px 32px ' + C.shadow, zIndex: 299, display: 'flex', flexDirection: 'column', fontFamily: "'DM Mono','Courier New',monospace", overflow: 'hidden' }}>

          <div style={{ padding: '14px 16px', borderBottom: '1px solid ' + C.border, background: C.purpleLight }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: C.purple }}>▸ Planning HPA</div>
            <div style={{ fontSize: '10px', color: C.muted, marginTop: '2px' }}>Aide & Notes de développement</div>
          </div>

          <div style={{ display: 'flex', borderBottom: '1px solid ' + C.border }}>
            {[{ id: 'news', label: '🆕 Nouveautés' }, { id: 'notes', label: '📝 Notes dev' }].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ flex: 1, padding: '8px', background: 'none', border: 'none', borderBottom: '2px solid ' + (tab === t.id ? C.purple : 'transparent'), color: tab === t.id ? C.purple : C.muted, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit', fontWeight: tab === t.id ? 600 : 400 }}>
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ overflowY: 'auto', flex: 1, padding: '14px 16px' }}>

            {tab === 'news' && (
              <div>
                {/* Bouton ajout admin */}
                {isAdmin && (
                  <div style={{ marginBottom: '16px' }}>
                    {!addingEntry ? (
                      <button onClick={() => setAddingEntry(true)}
                        style={{ width: '100%', background: 'none', border: '2px dashed ' + C.purple + '66', borderRadius: '8px', padding: '8px', color: C.purple, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }}>
                        + Ajouter une nouveauté
                      </button>
                    ) : (
                      <div style={{ background: C.bg, border: '1px solid ' + C.border, borderRadius: '8px', padding: '12px' }}>
                        <div style={{ fontSize: '10px', color: C.muted, marginBottom: '6px' }}>DATE</div>
                        <input type="date" style={{ ...inp, marginBottom: '8px' }} value={newEntry.date} onChange={e => setNewEntry(f => ({ ...f, date: e.target.value }))} />
                        <div style={{ fontSize: '10px', color: C.muted, marginBottom: '6px' }}>NOUVEAUTÉS (une par ligne)</div>
                        <textarea style={{ ...inp, minHeight: '80px', resize: 'vertical', marginBottom: '8px' }}
                          placeholder={'Fonctionnalité 1\nFonctionnalité 2\n...'}
                          value={newEntry.items} onChange={e => setNewEntry(f => ({ ...f, items: e.target.value }))} />
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => setAddingEntry(false)} style={{ flex: 1, background: 'none', border: '1px solid ' + C.border, borderRadius: '6px', padding: '6px', color: C.muted, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }}>Annuler</button>
                          <button onClick={addChangelogEntry} disabled={saving} style={{ flex: 2, background: C.purple, border: 'none', borderRadius: '6px', padding: '6px', color: '#fff', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit', fontWeight: 600 }}>
                            {saving ? 'Ajout...' : 'Publier'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {changelog.length === 0 ? (
                  <div style={{ color: C.muted, fontSize: '12px', textAlign: 'center', padding: '20px' }}>Chargement...</div>
                ) : changelog.map((entry, i) => (
                  <div key={entry.id} style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '10px', color: C.purple, fontWeight: 600, letterSpacing: '0.08em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ flex: 1, height: '1px', background: C.purple + '33' }} />
                      {fmtDate(entry.date)}
                      {isAdmin && (
                        <button onClick={() => deleteEntry(entry.id)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '11px', padding: '0' }}>×</button>
                      )}
                      <div style={{ flex: 1, height: '1px', background: C.purple + '33' }} />
                    </div>
                    {(entry.items || []).map((item, j) => (
                      <div key={j} style={{ display: 'flex', gap: '8px', padding: '5px 0', fontSize: '12px', color: C.text, borderBottom: j < entry.items.length - 1 ? '1px solid ' + C.border + '44' : 'none' }}>
                        <span style={{ color: C.green, flexShrink: 0 }}>✓</span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {tab === 'notes' && (
              <div>
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '10px', color: C.muted, marginBottom: '8px', letterSpacing: '0.06em' }}>AJOUTER UNE NOTE / IDÉE / BUG</div>
                  <input style={{ ...inp, marginBottom: '6px' }} placeholder="Votre nom (optionnel)" value={authorName} onChange={e => setAuthorName(e.target.value)} />
                  <textarea style={{ ...inp, minHeight: '80px', resize: 'vertical' }} placeholder="Décrivez votre idée, amélioration ou bug..." value={newNote} onChange={e => setNewNote(e.target.value)} />
                  <button onClick={addNote} disabled={!newNote.trim() || saving}
                    style={{ width: '100%', marginTop: '6px', background: C.purple, border: 'none', borderRadius: '6px', padding: '8px', color: '#fff', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600, cursor: !newNote.trim() || saving ? 'not-allowed' : 'pointer', opacity: !newNote.trim() || saving ? 0.7 : 1 }}>
                    {saving ? 'Envoi...' : '+ Ajouter la note'}
                  </button>
                </div>
                <div style={{ fontSize: '10px', color: C.muted, letterSpacing: '0.06em', marginBottom: '10px' }}>NOTES EXISTANTES</div>
                {notes.length === 0 ? (
                  <div style={{ color: C.muted, fontSize: '12px', textAlign: 'center', padding: '20px' }}>Aucune note pour l'instant</div>
                ) : notes.map(note => (
                  <div key={note.id} style={{ background: C.bg, border: '1px solid ' + C.border, borderRadius: '8px', padding: '10px 12px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '12px', color: C.text, lineHeight: 1.5 }}>{note.content}</div>
                        <div style={{ fontSize: '10px', color: C.muted, marginTop: '5px' }}>{note.author} · {fmtDate(note.created_at)}</div>
                      </div>
                      <button onClick={() => deleteNote(note.id)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '12px', padding: '0', flexShrink: 0 }}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
