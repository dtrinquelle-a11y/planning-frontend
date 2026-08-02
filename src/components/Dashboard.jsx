import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useTheme } from '../ThemeContext';

const API = 'https://mon-planning-production.up.railway.app/api';
const AVATAR_COLORS = ['#7C6FCD', '#2DB87A', '#F5A623', '#E85D5D'];

function getInitials(first, last) { return (first?.[0] || '') + (last?.[0] || ''); }

function getModulationColor(statut, C) {
  if (statut === 'majoration_50') return C.red;
  if (statut === 'majoration_25') return C.amber;
  return C.green;
}

function getModulationLabel(statut, C) {
  if (statut === 'majoration_50') return ['MAJORATION 50%', C.redLight, C.red];
  if (statut === 'majoration_25') return ['MAJORATION 25%', C.amberLight, C.amber];
  return ['NORMAL', C.greenLight, C.green];
}

export default function Dashboard() {
  const { colors: C } = useTheme();
  const [employees, setEmployees] = useState([]);
  const [modulation, setModulation] = useState([]);
  const [presence, setPresence] = useState([]);
  const [todayLogs, setTodayLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [empRes, modRes, presRes, logsRes] = await Promise.all([
          axios.get(API + '/employees'),
          axios.get(API + '/timeclock/modulation'),
          axios.get(API + '/timeclock/presence'),
          axios.get(API + '/timeclock/today'),
        ]);
        setEmployees(empRes.data);
        setModulation(modRes.data);
        setPresence(presRes.data);
        setTodayLogs(logsRes.data);
      } catch (err) { console.error('Erreur dashboard'); }
      finally { setLoading(false); }
    }
    fetchAll();
  }, []);

  if (loading) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono','Courier New',monospace", color: C.muted, fontSize: '13px' }}>
      CHARGEMENT...
    </div>
  );

  const totalHeures = modulation.reduce((s, m) => s + parseFloat(m.heures_travaillees || 0), 0);
  const enPoste = presence.filter(p => p.en_poste).length;
  const anomaliesGeo = todayLogs.filter(l => l.geo_valid === false && l.latitude);
  const retards = todayLogs.filter(l => l.is_late);
  const totalAnomalies = modulation.filter(m => m.statut !== 'normal').length + anomaliesGeo.length + retards.length;

  const chartData = modulation.map(m => ({
    name: m.last_name,
    heures: parseFloat(m.heures_travaillees || 0),
    color: getModulationColor(m.statut, C),
  }));

  const now = new Date();
  const months = ['jan.','fev.','mars','avr.','mai','juin','juil.','aout','sep.','oct.','nov.','dec.'];
  const dateStr = now.getDate() + ' ' + months[now.getMonth()] + ' ' + now.getFullYear();

  const s = {
    main: { padding: '28px 32px', maxWidth: '1100px', margin: '0 auto' },
    sectionTitle: { fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, marginBottom: '14px', marginTop: '28px' },
    statGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '8px' },
    statCard: { background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '18px 20px', boxShadow: C.shadow + ' 0 2px 8px' },
    statLabel: { fontSize: '10px', color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' },
    statVal: { fontSize: '28px', fontWeight: '600', letterSpacing: '-0.02em' },
    twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '14px' },
    card: { background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '20px', boxShadow: C.shadow + ' 0 2px 8px' },
    cardTitle: { fontSize: '11px', color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '16px' },
    empRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid ' + C.border },
    presGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' },
    anomalyRow: { display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 0', borderBottom: '1px solid ' + C.border, fontSize: '12px' },
    badge: (bg, color) => ({ display: 'inline-block', padding: '1px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 600, background: bg, color }),
    dot: (color) => ({ width: '6px', height: '6px', borderRadius: '50%', background: color, display: 'inline-block', marginRight: '6px' }),
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Mono','Courier New',monospace" }}>
      <div style={{ borderBottom: '1px solid ' + C.border, padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.card }}>
        <div style={{ fontSize: '16px', fontWeight: 600, color: C.text, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: C.purple }}>▸</span> PLANNING HPA
          <span style={{ color: C.muted, fontWeight: 400, fontSize: '13px' }}>/ Management</span>
        </div>
        <div style={{ fontSize: '11px', color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {dateStr} · Période nov. 2025 → oct. 2026
        </div>
      </div>

      <div style={s.main}>
        <div style={s.sectionTitle}>Vue d'ensemble</div>
        <div style={s.statGrid}>
          {[
            { label: 'Salariés actifs', val: employees.length, color: C.text },
            { label: 'Heures pointées (cumul)', val: Math.round(totalHeures) + 'h', color: C.purple },
            { label: 'En poste maintenant', val: enPoste, color: C.green },
            { label: 'Alertes aujourd\'hui', val: totalAnomalies, color: totalAnomalies > 0 ? C.amber : C.green },
          ].map((item, i) => (
            <div key={i} style={s.statCard}>
              <div style={s.statLabel}>{item.label}</div>
              <div style={{ ...s.statVal, color: item.color }}>{item.val}</div>
            </div>
          ))}
        </div>

        <div style={s.twoCol}>
          <div style={s.card}>
            <div style={s.cardTitle}>Modulation annuelle CC HPA</div>
            {modulation.length === 0 ? (
              <div style={{ color: C.muted, fontSize: '12px' }}>Aucune donnée</div>
            ) : modulation.map((m, i) => {
              const pct = (parseFloat(m.heures_travaillees) / parseFloat(m.seuil_legal)) * 100;
              const color = getModulationColor(m.statut, C);
              const [label, bg, tc] = getModulationLabel(m.statut, C);
              return (
                <div key={i} style={{ ...s.empRow, ...(i === modulation.length - 1 ? { borderBottom: 'none' } : {}) }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: AVATAR_COLORS[i % AVATAR_COLORS.length] + '22', border: '1px solid ' + AVATAR_COLORS[i % AVATAR_COLORS.length] + '44', color: AVATAR_COLORS[i % AVATAR_COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600, flexShrink: 0 }}>
                    {getInitials(m.first_name, m.last_name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 500, color: C.text }}>{m.first_name} {m.last_name}</div>
                    <div style={{ height: '4px', background: C.border, borderRadius: '2px', overflow: 'hidden', marginTop: '5px', width: '80px' }}>
                      <div style={{ height: '4px', width: Math.min(pct, 100) + '%', background: color, borderRadius: '2px' }} />
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color }}>{m.heures_travaillees}h</div>
                    <span style={s.badge(bg, tc)}>{label}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>Présence aujourd'hui</div>
            {presence.length === 0 ? (
              <div>
                <div style={{ color: C.muted, fontSize: '12px', marginBottom: '10px' }}>Aucun pointage aujourd'hui</div>
                <div style={s.presGrid}>
                  {employees.slice(0, 4).map((e, i) => (
                    <div key={e.id} style={{ borderRadius: '8px', padding: '8px 12px', border: '1px solid ' + C.border, background: C.borderLight }}>
                      <div style={{ fontSize: '11px', fontWeight: 500, color: C.text }}>{e.first_name}</div>
                      <div style={{ fontSize: '10px', color: C.muted, marginTop: '2px' }}>
                        <span style={s.dot(C.muted)} />Non pointé
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={s.presGrid}>
                {presence.map((p, i) => (
                  <div key={p.id || i} style={{ borderRadius: '8px', padding: '8px 12px', border: '1px solid ' + (p.en_poste ? C.green + '44' : C.border), background: p.en_poste ? C.greenLight : C.borderLight }}>
                    <div style={{ fontSize: '11px', fontWeight: 500, color: C.text }}>{p.first_name} {p.last_name}</div>
                    <div style={{ fontSize: '10px', color: p.en_poste ? C.green : C.muted, marginTop: '2px' }}>
                      <span style={s.dot(p.en_poste ? C.green : C.muted)} />
                      {p.en_poste ? 'En poste' : 'Parti'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {(anomaliesGeo.length > 0 || retards.length > 0) && (
          <div>
            <div style={s.sectionTitle}>Anomalies du jour</div>
            <div style={s.card}>
              {retards.map((log, i) => (
                <div key={'r'+i} style={{ ...s.anomalyRow, ...(i === retards.length-1 && anomaliesGeo.length === 0 ? { borderBottom: 'none' } : {}) }}>
                  <span style={{ fontSize: '15px' }}>⏰</span>
                  <div style={{ flex: 1 }}>
                    <span style={s.badge(C.amberLight, C.amber)}>Retard</span>
                    <span style={{ marginLeft: '8px', color: C.text }}>{log.first_name} {log.last_name}</span>
                    {log.late_minutes > 0 && <span style={{ color: C.muted, marginLeft: '8px' }}>+{log.late_minutes} min</span>}
                  </div>
                  <span style={{ fontSize: '11px', color: C.muted }}>{log.scanned_at ? new Date(log.scanned_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                </div>
              ))}
              {anomaliesGeo.map((log, i) => (
                <div key={'g'+i} style={{ ...s.anomalyRow, ...(i === anomaliesGeo.length-1 ? { borderBottom: 'none' } : {}) }}>
                  <span style={{ fontSize: '15px' }}>📍</span>
                  <div style={{ flex: 1 }}>
                    <span style={s.badge(C.redLight, C.red)}>Hors site</span>
                    <span style={{ marginLeft: '8px', color: C.text }}>{log.first_name} {log.last_name}</span>
                  </div>
                  <span style={{ fontSize: '11px', color: C.muted }}>{log.scanned_at ? new Date(log.scanned_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={s.sectionTitle}>Heures travaillées vs seuil légal (1 607h)</div>
        <div style={s.card}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 11 }} axisLine={{ stroke: C.border }} tickLine={false} />
              <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '8px', fontSize: '12px', color: C.text }} formatter={val => [val + 'h travaillées']} />
              <Bar dataKey="heures" radius={[4,4,0,0]}>
                {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
