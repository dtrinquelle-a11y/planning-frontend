import React, { useEffect, useState } from 'react';
import axios from 'axios';
import supabase from '../supabase';
import { useTheme } from '../ThemeContext';
import { API } from '../config';
import { PERM_GROUPS } from '../permissions';

const ROLES = [{ id: 'admin', label: 'Administrateur' }, { id: 'manager', label: 'Manager' }, { id: 'salarie', label: 'Salarié' }];

// Parametrage > Roles et droits (administrateurs) : fonctions autorisees par role, et role de chaque compte
export default function RolesDroits() {
  const { colors: C } = useTheme();
  const [cfg, setCfg] = useState({ manager: {}, salarie: {} });
  const [dirty, setDirty] = useState(false);
  const [accounts, setAccounts] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [filter, setFilter] = useState('');
  const [log, setLog] = useState(null); // journal des consultations des donnees sensibles
  const [names, setNames] = useState({});

  async function load() {
    const [s, a] = await Promise.all([
      supabase.from('app_settings').select('value').eq('key', 'roles_droits').maybeSingle(),
      supabase.rpc('list_accounts'),
    ]);
    setCfg({ manager: {}, salarie: {}, ...(s.data?.value || {}) });
    if (a.error) setMsg({ err: true, text: a.error.message }); else setAccounts(a.data || []);
  }
  useEffect(() => { load(); }, []);

  async function loadLog() {
    const [l, e] = await Promise.all([
      supabase.from('sensitive_access_log').select('*').order('at', { ascending: false }).limit(50),
      supabase.from('employees').select('id, first_name, last_name'),
    ]);
    setLog(l.data || []);
    setNames(Object.fromEntries((e.data || []).map(x => [x.id, x.first_name + ' ' + x.last_name])));
  }

  // Copie de secours de la cle de chiffrement : indispensable pour relire les donnees apres une restauration
  async function downloadKey() {
    if (!window.confirm('Télécharger la clé de secours ?\n\nRangez-la dans votre gestionnaire de mots de passe, jamais dans le Drive avec les sauvegardes.')) return;
    const { data, error } = await supabase.rpc('get_encryption_key');
    if (error) { setMsg({ err: true, text: error.message }); return; }
    const txt = [
      'Planning HPA - cle de chiffrement des donnees sensibles',
      'Generee le ' + new Date().toLocaleDateString('fr-FR'),
      '',
      data,
      '',
      'A conserver dans un gestionnaire de mots de passe, SEPAREMENT des sauvegardes.',
      "Restauration (voir PLAN_DE_REPRISE.md) : INSERT INTO public.server_secrets (key, value) VALUES ('cle_donnees_sensibles', '<cle>') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;",
    ].join('\r\n') + '\r\n';
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' })); a.download = 'cle-secours-planning-hpa.txt';
    document.body.appendChild(a); a.click(); a.remove();
    loadLog();
  }

  const on = (role, key) => cfg[role]?.[key] !== false;
  function toggle(role, key) {
    setCfg(c => ({ ...c, [role]: { ...(c[role] || {}), [key]: !on(role, key) } }));
    setDirty(true); setMsg(null);
  }

  async function save() {
    setBusy(true); setMsg(null);
    try {
      await axios.patch(API + '/settings/roles_droits', cfg);
      setDirty(false);
      setMsg({ err: false, text: 'Droits enregistrés. Ils s’appliquent à la prochaine ouverture de l’application par chaque utilisateur.' });
    } catch (err) { setMsg({ err: true, text: 'Erreur : ' + (err.response?.data?.error || err.message) }); }
    finally { setBusy(false); }
  }

  async function changeRole(acc, role) {
    const name = acc.first_name ? acc.first_name + ' ' + acc.last_name : acc.email;
    if (!window.confirm('Donner le rôle « ' + ROLES.find(r => r.id === role).label + ' » à ' + name + ' ?')) { load(); return; }
    const { error } = await supabase.rpc('set_user_role', { p_user: acc.user_id, p_role: role });
    if (error) setMsg({ err: true, text: error.message });
    else setMsg({ err: false, text: name + ' est maintenant ' + ROLES.find(r => r.id === role).label.toLowerCase() + '.' });
    load();
  }

  const cell = { padding: '8px 10px', borderBottom: '1px solid ' + C.border + '88', fontSize: '12px', textAlign: 'center' };
  const box = (checked, onChange, disabled) => (
    <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} style={{ width: '17px', height: '17px', accentColor: C.purple, cursor: disabled ? 'not-allowed' : 'pointer' }} />
  );
  const seen = iso => (iso ? new Date(iso).toLocaleDateString('fr-FR') : 'jamais');
  const list = (accounts || []).filter(a => !filter || (a.first_name + ' ' + a.last_name + ' ' + a.email).toLowerCase().includes(filter.toLowerCase()));

  return (
    <div>
      <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px', color: C.text }}>Rôles et droits</div>
      <div style={{ fontSize: '12px', color: C.muted, marginBottom: '20px', lineHeight: 1.6 }}>
        Chaque compte a un rôle. L'<strong>administrateur</strong> a tous les droits ; vous choisissez ici ce que peuvent faire les <strong>managers</strong> et les <strong>salariés</strong>.
        Les droits sont appliqués par le serveur et la base de données, pas seulement en masquant les menus.
      </div>

      {/* Grille des droits */}
      <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', overflow: 'hidden', marginBottom: '14px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: C.bg }}>
              <th style={{ ...cell, textAlign: 'left', color: C.muted, fontWeight: 600 }}>Fonction</th>
              {ROLES.map(r => <th key={r.id} style={{ ...cell, color: C.muted, fontWeight: 600, width: '110px' }}>{r.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {PERM_GROUPS.map(g => (
              <React.Fragment key={g.id}>
                <tr><td colSpan={4} style={{ ...cell, textAlign: 'left', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', color: C.purple, background: C.purpleLight + '66' }}>{g.label.toUpperCase()}</td></tr>
                {g.perms.map(p => (
                  <tr key={p.key}>
                    <td style={{ ...cell, textAlign: 'left' }}>
                      <div style={{ fontWeight: 500, color: C.text }}>{p.label}</div>
                      <div style={{ fontSize: '11px', color: C.muted }}>{p.desc}</div>
                    </td>
                    <td style={cell}>{box(true, () => {}, true)}</td>
                    <td style={cell}>{g.roles.includes('manager') ? box(!p.adminOnly && on('manager', p.key), () => toggle('manager', p.key), !!p.adminOnly) : <span style={{ color: C.border }}>—</span>}</td>
                    <td style={cell}>{g.roles.includes('salarie') ? box(on('salarie', p.key), () => toggle('salarie', p.key)) : <span style={{ color: C.border }}>—</span>}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '30px', flexWrap: 'wrap' }}>
        <button onClick={save} disabled={busy || !dirty}
          style={{ background: C.purple, border: 'none', borderRadius: '8px', padding: '10px 24px', color: '#fff', fontSize: '13px', fontFamily: 'inherit', fontWeight: 600, cursor: busy || !dirty ? 'not-allowed' : 'pointer', opacity: busy || !dirty ? 0.6 : 1 }}>
          {busy ? 'Enregistrement...' : '💾 Enregistrer les droits'}
        </button>
        {msg && <span style={{ fontSize: '12px', color: msg.err ? C.red : C.green }}>{msg.text}</span>}
      </div>

      {/* Comptes et roles */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: C.text }}>Comptes</div>
          <div style={{ fontSize: '12px', color: C.muted }}>Changez le rôle d'un compte avec le menu. Il reste toujours au moins un administrateur.</div>
        </div>
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Rechercher…"
          style={{ background: C.bg, border: '1px solid ' + C.border, borderRadius: '8px', padding: '7px 10px', color: C.text, fontSize: '12px', fontFamily: 'inherit', width: '200px' }} />
      </div>
      {accounts === null ? <div style={{ fontSize: '12px', color: C.muted }}>Chargement...</div> : (
        <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', overflow: 'hidden' }}>
          {list.map((a, i) => (
            <div key={a.user_id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 14px', borderTop: i ? '1px solid ' + C.border + '88' : 'none', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: C.text }}>{a.first_name ? a.first_name + ' ' + a.last_name : <span style={{ color: C.muted }}>Compte sans fiche</span>}</div>
                <div style={{ fontSize: '11px', color: C.muted }}>{a.email} · dernière activité : {seen(a.last_seen)}</div>
              </div>
              <select value={a.role} onChange={e => changeRole(a, e.target.value)}
                style={{ background: a.role === 'admin' ? C.purpleLight : a.role === 'manager' ? C.amberLight : C.bg, border: '1px solid ' + C.border, borderRadius: '8px', padding: '6px 10px', color: C.text, fontSize: '12px', fontFamily: 'inherit', fontWeight: 600 }}>
                {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
          ))}
          {!list.length && <div style={{ padding: '16px', fontSize: '12px', color: C.muted, textAlign: 'center' }}>Aucun compte.</div>}
        </div>
      )}

      {/* Donnees sensibles */}
      <div style={{ marginTop: '30px', fontSize: '14px', fontWeight: 600, color: C.text }}>🔒 Données sensibles</div>
      <div style={{ fontSize: '12px', color: C.muted, margin: '4px 0 12px', lineHeight: 1.6 }}>
        Le n° de sécurité sociale et l'IBAN sont chiffrés dans la base : ils apparaissent masqués (•••• 4512) et ne sont lisibles en clair qu'avec un droit RH, contrats ou paie.
        Chaque affichage est enregistré ci-dessous. L'IBAN est effacé automatiquement 6 mois après la fin du contrat.
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <button onClick={downloadKey} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '8px', padding: '8px 14px', color: C.text, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600 }}>🔑 Télécharger la clé de secours</button>
        <button onClick={loadLog} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '8px', padding: '8px 14px', color: C.text, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600 }}>📜 {log ? 'Actualiser le journal' : 'Voir le journal des consultations'}</button>
      </div>
      {log && (
        <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', overflow: 'hidden' }}>
          {log.length === 0 ? <div style={{ padding: '14px', fontSize: '12px', color: C.muted }}>Aucune consultation enregistrée.</div> : log.map((l, i) => {
            const who = (accounts || []).find(a => a.user_id === l.user_id);
            return (
              <div key={l.id} style={{ display: 'flex', gap: '12px', padding: '7px 14px', borderTop: i ? '1px solid ' + C.border + '88' : 'none', fontSize: '12px', flexWrap: 'wrap' }}>
                <span style={{ width: '120px', color: C.muted }}>{new Date(l.at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                <span style={{ width: '170px', color: C.text, fontWeight: 600 }}>{who ? (who.first_name ? who.first_name + ' ' + who.last_name : who.email) : 'Compte supprimé'}</span>
                <span style={{ flex: 1, color: C.text }}>{l.field === 'cle' ? 'Clé de secours' : l.field === 'numero_secu' ? 'N° de sécurité sociale' : l.field}{l.employee_id ? ' de ' + (names[l.employee_id] || 'salarié supprimé') : ''}{l.reason ? ' · ' + l.reason : ''}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
