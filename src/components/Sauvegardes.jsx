import React, { useEffect, useState } from 'react';
import supabase from '../supabase';
import { useTheme } from '../ThemeContext';

// Section Parametrage > Sauvegardes : liste, sauvegarde manuelle, telechargement (JSON)
export default function Sauvegardes() {
  const { colors: C } = useTheme();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from('data_backups').select('slot, kind, created_at, size_bytes, row_counts').order('created_at', { ascending: false });
    if (error) setMsg({ err: true, text: error.message });
    setList(data || []);
    setLoading(false);
  }

  async function backupNow() {
    setBusy('new'); setMsg(null);
    const { data, error } = await supabase.rpc('create_backup_snapshot', { p_kind: 'manuel' });
    setBusy(null);
    if (error) { setMsg({ err: true, text: 'Erreur : ' + error.message }); return; }
    setMsg({ err: false, text: 'Sauvegarde créée (' + Math.round(data.size_bytes / 1024) + ' Ko).' });
    load();
  }

  async function download(b) {
    setBusy(b.slot);
    const { data, error } = await supabase.from('data_backups').select('data, created_at').eq('slot', b.slot).single();
    setBusy(null);
    if (error) { setMsg({ err: true, text: 'Erreur : ' + error.message }); return; }
    const d = new Date(data.created_at);
    const stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '_' + String(d.getHours()).padStart(2, '0') + 'h' + String(d.getMinutes()).padStart(2, '0');
    const blob = new Blob([JSON.stringify({ sauvegarde: b.slot, date: data.created_at, donnees: data.data }, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'sauvegarde-planning-hpa_' + stamp + '.json';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  const fmtDate = iso => new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const summary = rc => rc ? (rc.employees || 0) + ' salariés · ' + (rc.schedules || 0) + ' créneaux · ' + (rc.timeclock || 0) + ' pointages · ' + (rc.absence_requests || 0) + ' absences' : '';

  return (
    <div>
      <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px', color: C.text }}>Sauvegardes</div>
      <div style={{ fontSize: '12px', color: C.muted, marginBottom: '18px', lineHeight: 1.6 }}>
        Une sauvegarde complète des données est faite automatiquement chaque nuit vers 3 h et conservée environ 31 jours.
        Faites une sauvegarde manuelle avant une grosse manipulation, et téléchargez-en une copie de temps en temps
        (ordinateur, Drive). En cas de problème, une sauvegarde permet de restaurer les données.
      </div>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button onClick={backupNow} disabled={busy === 'new'}
          style={{ background: C.purple, border: 'none', borderRadius: '8px', padding: '9px 16px', color: '#fff', fontSize: '13px', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer', opacity: busy === 'new' ? 0.6 : 1 }}>
          {busy === 'new' ? 'Sauvegarde...' : '💾 Sauvegarder maintenant'}
        </button>
        {msg && <span style={{ fontSize: '12px', color: msg.err ? C.red : C.green }}>{msg.text}</span>}
      </div>

      {loading ? (
        <div style={{ color: C.muted, fontSize: '12px' }}>Chargement...</div>
      ) : list.length === 0 ? (
        <div style={{ background: C.bg, border: '1px solid ' + C.border, borderRadius: '10px', padding: '20px', textAlign: 'center', color: C.muted, fontSize: '12px' }}>
          Aucune sauvegarde pour le moment. La première sauvegarde automatique aura lieu cette nuit vers 3 h.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {list.map(b => (
            <div key={b.slot} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px', background: b.kind === 'auto' ? C.purpleLight : C.greenLight, color: b.kind === 'auto' ? C.purple : C.green }}>
                {b.kind === 'auto' ? 'Automatique' : 'Manuelle'}
              </span>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: C.text }}>{fmtDate(b.created_at)}</div>
                <div style={{ fontSize: '11px', color: C.muted }}>{summary(b.row_counts)} · {Math.round((b.size_bytes || 0) / 1024)} Ko</div>
              </div>
              <button onClick={() => download(b)} disabled={busy === b.slot}
                style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '8px', padding: '6px 12px', color: C.text, fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer', opacity: busy === b.slot ? 0.6 : 1 }}>
                {busy === b.slot ? '...' : '↓ Télécharger'}
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: '11px', color: C.muted, marginTop: '14px', lineHeight: 1.6 }}>
        Contenu : salariés, plannings, pointages, absences, paie, réglages, onboarding et références des documents.
        Les fichiers eux-mêmes (pièces, bulletins) restent dans le stockage sécurisé. Le fichier téléchargé contient des
        données personnelles : conservez-le en lieu sûr.
      </div>
    </div>
  );
}
