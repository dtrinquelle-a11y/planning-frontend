import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTheme } from '../ThemeContext';
import { API } from '../config';

// "Il y a 3 j", "hier", "aujourd'hui 09:12", "jamais"
function seenLabel(iso) {
  if (!iso) return 'jamais connecté';
  const d = new Date(iso);
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return "aujourd'hui " + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'hier';
  return 'il y a ' + days + ' j';
}

// Dashboard > Activite du jour : qui est la, qui manque, alertes de la journee, connexions
export default function ActiviteJour({ onNavigate }) {
  const { colors: C } = useTheme();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState(null);

  async function load() {
    try {
      const r = await axios.get(API + '/reports/today');
      setData(r.data); setError(''); setUpdated(new Date());
    } catch (err) { setError(err.response?.data?.error || err.message); }
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 60 * 1000); // actualisation automatique chaque minute
    return () => clearInterval(t);
  }, []);

  const SEV = { red: C.red, pink: '#DB2777', amber: C.amber, purple: C.purple };
  const STATUS = {
    en_poste: { c: C.green, bg: C.greenLight }, parti: { c: C.muted, bg: C.bg }, en_cours: { c: C.green, bg: C.greenLight },
    pas_arrive: { c: C.red, bg: C.redLight }, a_valider: { c: C.amber, bg: C.amberLight }, a_venir: { c: C.muted, bg: C.bg },
    absent: { c: C.purple, bg: C.purpleLight },
    declare_conforme: { c: C.green, bg: C.greenLight }, declare_modifie: { c: C.purple, bg: C.purpleLight },
    declare_non_travaille: { c: C.red, bg: C.redLight }, declare_auto: { c: C.amber, bg: C.amberLight },
  };
  const card = { background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '18px 20px', boxShadow: C.shadow + ' 0 2px 8px' };
  const title = { fontSize: '11px', color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px', fontWeight: 600 };

  if (error) return <div style={{ ...card, color: C.red, fontSize: '13px' }}>Impossible de charger l'activité du jour : {error}</div>;
  if (!data) return <div style={{ color: C.muted, fontSize: '13px', padding: '30px', textAlign: 'center' }}>Chargement...</div>;

  const k = data.counts;
  const dayLabel = new Date(data.day + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
        <div style={{ fontSize: '15px', fontWeight: 600, textTransform: 'capitalize' }}>{dayLabel}</div>
        <div style={{ fontSize: '11px', color: C.muted, display: 'flex', alignItems: 'center', gap: '8px' }}>
          {updated && 'Mis à jour à ' + updated.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          <button onClick={load} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '8px', padding: '4px 10px', color: C.text, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>↻ Actualiser</button>
        </div>
      </div>

      {/* Chiffres du jour */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '14px' }}>
        {[
          { l: 'Prévus aujourd\'hui', v: k.planned, c: C.text },
          { l: data.declarative ? 'Validés / en service' : 'Arrivés', v: k.present, c: C.green },
          { l: data.declarative ? 'À valider' : 'Pas encore pointés', v: k.waiting, c: k.waiting ? C.red : C.green },
          { l: 'Absents', v: k.absent, c: k.absent ? C.purple : C.muted },
          { l: 'Alertes', v: k.alerts, c: k.alerts ? C.amber : C.green },
        ].map(x => (
          <div key={x.l} style={{ ...card, padding: '14px 16px' }}>
            <div style={{ fontSize: '11px', color: C.muted, marginBottom: '4px' }}>{x.l}</div>
            <div style={{ fontSize: '26px', fontWeight: 700, color: x.c }}>{x.v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px', marginBottom: '14px' }}>
        {/* Alertes */}
        <div style={card}>
          <div style={title}>À traiter</div>
          {data.pending_absences > 0 && (
            <div onClick={() => onNavigate && onNavigate('absences')} style={{ cursor: onNavigate ? 'pointer' : 'default', display: 'flex', gap: '10px', alignItems: 'center', padding: '10px 12px', borderRadius: '10px', background: C.purpleLight, color: C.purple, fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
              🏖️ {data.pending_absences} demande{data.pending_absences > 1 ? 's' : ''} d'absence en attente <span style={{ marginLeft: 'auto' }}>›</span>
            </div>
          )}
          {data.alerts.length === 0 ? (
            <div style={{ fontSize: '13px', color: C.green, padding: '8px 0' }}>✓ Aucune anomalie pour le moment</div>
          ) : data.alerts.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '9px 0', borderBottom: i < data.alerts.length - 1 ? '1px solid ' + C.border : 'none' }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: SEV[a.severity] || C.amber, marginTop: '5px', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>{a.name} <span style={{ fontWeight: 400, fontSize: '11px', color: C.muted }}>· {a.service}</span></div>
                <div style={{ fontSize: '12px', color: SEV[a.severity] || C.text }}>{a.label}</div>
              </div>
              <span style={{ fontSize: '11px', color: C.muted, whiteSpace: 'nowrap' }}>{a.time}</span>
            </div>
          ))}
          {data.alerts.some(a => a.code === 'horaires_modifies') && onNavigate && (
            <button onClick={() => onNavigate('realise')} style={{ marginTop: '8px', background: 'none', border: 'none', color: C.purple, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', padding: 0 }}>Voir le détail dans le Réalisé ›</button>
          )}
        </div>

        {/* Connexions */}
        <div style={card}>
          <div style={title}>Pas connectés aujourd'hui</div>
          <div style={{ fontSize: '11px', color: C.muted, marginBottom: '8px' }}>Salariés prévus aujourd'hui qui n'ont pas ouvert l'application.</div>
          {data.not_connected.length === 0 ? (
            <div style={{ fontSize: '13px', color: C.green, padding: '8px 0' }}>✓ Tout le monde s'est connecté</div>
          ) : data.not_connected.map(p => (
            <div key={p.employee_id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '8px 0', borderBottom: '1px solid ' + C.border, fontSize: '13px' }}>
              <span><strong style={{ fontWeight: 600 }}>{p.name}</strong> <span style={{ fontSize: '11px', color: C.muted }}>· {p.service}</span></span>
              <span style={{ fontSize: '11px', color: p.last_seen ? C.muted : C.red, whiteSpace: 'nowrap' }}>{seenLabel(p.last_seen)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Planning du jour */}
      <div style={card}>
        <div style={title}>Planning du jour</div>
        {data.people.length === 0 ? (
          <div style={{ fontSize: '13px', color: C.muted }}>Personne n'est prévu aujourd'hui.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ color: C.muted, fontSize: '11px', textAlign: 'left' }}>
                  {['Prévu', 'Salarié', 'Statut', data.declarative ? '' : 'Arrivée', data.declarative ? '' : 'Départ', 'Dernière connexion'].map((h, i) => <th key={i} style={{ padding: '6px 8px', fontWeight: 600, borderBottom: '1px solid ' + C.border }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.people.map(p => {
                  const st = STATUS[p.status.code] || { c: C.text, bg: C.bg };
                  return (
                    <tr key={p.employee_id} style={{ borderBottom: '1px solid ' + C.border + '99' }}>
                      <td style={{ padding: '8px', whiteSpace: 'nowrap', color: C.muted }}>{p.planned}</td>
                      <td style={{ padding: '8px' }}><strong style={{ fontWeight: 600 }}>{p.name}</strong> <span style={{ fontSize: '11px', color: C.muted }}>· {p.service}</span></td>
                      <td style={{ padding: '8px' }}><span style={{ background: st.bg, color: st.c, padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}>{p.status.label}</span></td>
                      <td style={{ padding: '8px' }}>{data.declarative ? '' : p.arrived || '—'}</td>
                      <td style={{ padding: '8px' }}>{data.declarative ? '' : p.left || '—'}</td>
                      <td style={{ padding: '8px', fontSize: '12px', color: p.logged_today ? C.green : p.last_seen ? C.muted : C.red, whiteSpace: 'nowrap' }}>{seenLabel(p.last_seen)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div style={{ fontSize: '11px', color: C.muted, marginTop: '10px' }}>Actualisé automatiquement chaque minute. Retards et départs anticipés signalés au-delà de 5 minutes.</div>
    </div>
  );
}
