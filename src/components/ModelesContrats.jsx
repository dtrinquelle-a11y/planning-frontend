import React, { useEffect, useRef, useState } from 'react';
import supabase from '../supabase';
import { useTheme } from '../ThemeContext';
import { FIELDS, CONDITIONS, FREE_EXAMPLES, inspectTemplate, templateError, downloadBlob } from '../contracts';

// Parametrage > Contrats : modeles Word avec champs de fusion
export default function ModelesContrats() {
  const { colors: C } = useTheme();
  const [list, setList] = useState([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState('');
  const fileRef = useRef(null);

  async function load() {
    const { data } = await supabase.from('contract_templates').select('*').order('name');
    setList(data || []);
  }
  useEffect(() => { load(); }, []);

  async function upload(file) {
    setMsg(null);
    if (!file) return;
    if (!/\.docx$/i.test(file.name)) { setMsg({ err: true, text: 'Le modèle doit être un fichier Word .docx (Fichier › Enregistrer sous › Document Word).' }); return; }
    setBusy(true);
    try {
      // Verification du modele avant depot : champs detectes, accolades correctes
      const info = inspectTemplate(await file.arrayBuffer());
      const known = new Set([...FIELDS.map(f => f.key), ...CONDITIONS.map(c => c.key)]);
      const free = info.fields.filter(f => !known.has(f));
      const id = crypto.randomUUID();
      const path = id + '.docx';
      const { error: ue } = await supabase.storage.from('modeles-contrats').upload(path, file, { contentType: file.type || undefined });
      if (ue) throw ue;
      const { error } = await supabase.from('contract_templates').insert({ id, name: name.trim() || file.name.replace(/\.docx$/i, ''), file_path: path, file_name: file.name });
      if (error) throw error;
      setName('');
      setMsg({ err: false, text: 'Modèle ajouté : ' + info.fields.length + ' champ(s) détecté(s)' + (free.length ? ', dont ' + free.length + ' à compléter à chaque édition (' + free.join(', ') + ')' : '') + '.' });
      load();
    } catch (err) {
      setMsg({ err: true, text: 'Modèle refusé : ' + templateError(err) });
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function download(t) {
    const { data, error } = await supabase.storage.from('modeles-contrats').download(t.file_path);
    if (error) { setMsg({ err: true, text: 'Erreur : ' + error.message }); return; }
    downloadBlob(data, t.file_name);
  }

  async function remove(t) {
    if (!window.confirm('Supprimer le modèle « ' + t.name + ' » ?\nLes contrats déjà édités ne sont pas touchés.')) return;
    await supabase.storage.from('modeles-contrats').remove([t.file_path]);
    await supabase.from('contract_templates').delete().eq('id', t.id);
    load();
  }

  async function rename(t) {
    const n = window.prompt('Nom du modèle', t.name);
    if (!n || !n.trim()) return;
    await supabase.from('contract_templates').update({ name: n.trim() }).eq('id', t.id);
    load();
  }

  function copy(text) {
    navigator.clipboard?.writeText(text).then(() => { setCopied(text); setTimeout(() => setCopied(''), 1500); }).catch(() => {});
  }

  const btn = { background: C.card, border: '1px solid ' + C.border, borderRadius: '6px', padding: '5px 10px', color: C.text, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' };
  const chip = k => (
    <button key={k} onClick={() => copy('{' + k + '}')} title="Copier"
      style={{ background: copied === '{' + k + '}' ? C.greenLight : C.bg, border: '1px solid ' + C.border, borderRadius: '6px', padding: '3px 8px', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '12px', color: copied === '{' + k + '}' ? C.green : C.purple, cursor: 'pointer' }}>
      {copied === '{' + k + '}' ? '✓ copié' : '{' + k + '}'}
    </button>
  );
  const groups = [...new Set(FIELDS.map(f => f.group))];

  return (
    <div>
      <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px', color: C.text }}>Modèles de contrat</div>
      <div style={{ fontSize: '12px', color: C.muted, marginBottom: '20px', lineHeight: 1.6 }}>
        Déposez vos modèles Word (.docx) en y plaçant des champs entre accolades, par exemple <code>{'{prenom}'}</code>. Depuis la fiche d'un salarié
        (Dossiers RH › « Éditer un contrat »), l'application remplit automatiquement les champs connus et vous demande les autres.
      </div>

      {/* Depot */}
      <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '16px', display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={{ display: 'block', fontSize: '10px', color: C.muted, letterSpacing: '0.08em', marginBottom: '4px' }}>NOM DU MODÈLE</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex : CDD saisonnier"
            style={{ width: '100%', background: C.bg, border: '1px solid ' + C.border, borderRadius: '6px', padding: '8px 10px', color: C.text, fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        </div>
        <input ref={fileRef} type="file" accept=".docx" style={{ display: 'none' }} onChange={e => upload(e.target.files[0])} />
        <button onClick={() => fileRef.current?.click()} disabled={busy}
          style={{ background: C.purple, border: 'none', borderRadius: '8px', padding: '9px 16px', color: '#fff', fontSize: '13px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Vérification...' : '📤 Déposer un modèle .docx'}
        </button>
      </div>
      {msg && <div style={{ fontSize: '12px', color: msg.err ? C.red : C.green, marginBottom: '14px', lineHeight: 1.6 }}>{msg.text}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '26px' }}>
        {list.length === 0 ? (
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '20px', textAlign: 'center', color: C.muted, fontSize: '12px' }}>Aucun modèle pour le moment.</div>
        ) : list.map(t => (
          <div key={t.id} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '20px' }}>📄</span>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: C.text }}>{t.name}</div>
              <div style={{ fontSize: '11px', color: C.muted }}>{t.file_name} · ajouté le {new Date(t.created_at).toLocaleDateString('fr-FR')}</div>
            </div>
            <button onClick={() => rename(t)} style={btn} title="Renommer">✏️</button>
            <button onClick={() => download(t)} style={btn}>↓ Télécharger</button>
            <button onClick={() => remove(t)} style={{ ...btn, color: C.red }}>Supprimer</button>
          </div>
        ))}
      </div>

      {/* Aide-memoire des champs */}
      <div style={{ fontSize: '14px', fontWeight: 600, color: C.text, marginBottom: '6px' }}>Champs disponibles</div>
      <div style={{ fontSize: '12px', color: C.muted, marginBottom: '12px' }}>Cliquez sur un champ pour le copier, puis collez-le dans votre document Word.</div>
      <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {groups.map(g => (
          <div key={g}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: C.muted, letterSpacing: '0.06em', marginBottom: '6px' }}>{g.toUpperCase()}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '6px' }}>
              {FIELDS.filter(f => f.group === g).map(f => (
                <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: C.text }}>{chip(f.key)} <span style={{ color: C.muted }}>{f.label}</span></div>
              ))}
            </div>
          </div>
        ))}
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: C.muted, letterSpacing: '0.06em', marginBottom: '6px' }}>À COMPLÉTER À CHAQUE ÉDITION</div>
          <div style={{ fontSize: '12px', color: C.text, lineHeight: 1.7 }}>
            Tout autre nom entre accolades devient un champ que l'application vous demandera (la dernière valeur saisie est reprise), par exemple :{' '}
            <span style={{ display: 'inline-flex', gap: '6px', flexWrap: 'wrap' }}>{FREE_EXAMPLES.map(chip)}</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: C.muted, letterSpacing: '0.06em', marginBottom: '6px' }}>PARAGRAPHES CONDITIONNELS</div>
          <div style={{ fontSize: '12px', color: C.text, lineHeight: 1.7 }}>
            Un texte entre <code>{'{#cdd}'}</code> et <code>{'{/cdd}'}</code> n'apparaît que pour un CDD ; entre <code>{'{^cdd}'}</code> et <code>{'{/cdd}'}</code>, seulement si ce n'est pas un CDD.
            {CONDITIONS.map(c => <div key={c.key}><code style={{ color: C.purple }}>{'#' + c.key}</code> : {c.label}</div>)}
          </div>
        </div>
        <div style={{ fontSize: '11px', color: C.muted, lineHeight: 1.6 }}>
          Conseil Word : tapez chaque champ d'un seul trait (ou collez-le), sans changer la mise en forme au milieu des accolades. Si un champ est mal écrit, le modèle est refusé au dépôt avec l'explication.
        </div>
      </div>
    </div>
  );
}
