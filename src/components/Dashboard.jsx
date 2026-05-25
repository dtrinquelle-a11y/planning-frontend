import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const API = 'https://mon-planning-production.up.railway.app/api';

const COLORS = {
  purple: '#7C6FCD', green: '#2DB87A', amber: '#F5A623', red: '#E85D5D',
  bg: '#0F1117', card: '#1A1D27', border: '#2A2D3A', text: '#E8E6DC', muted: '#6B6E82',
};

const styles = {
  app: { minHeight: '100vh', background: COLORS.bg, color: COLORS.text, fontFamily: "'DM Mono','Courier New',monospace", padding: '0' },
  header: { borderBottom: '1px solid ' + COLORS.border, padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: COLORS.card },
  logo: { fontSize: '16px', fontWeight: '600', letterSpacing: '0.1em', color: COLORS.text, display: 'flex', alignItems: 'center', gap: '10px' },
  period: { fontSize: '11px', color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase' },
  main: { padding: '28px 32px', maxWidth: '1100px', margin: '0 auto' },
  sectionTitle: { fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', color: COLORS.muted, marginBottom: '14px', marginTop: '28px' },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '8px' },
  statCard: { background: COLORS.card, border: '1px solid ' + COLORS.border, borderRadius: '10px', padding: '18px 20px' },
  statLabel: { fontSize: '10px', color: COLORS.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' },
  statVal: { fontSize: '28px', fontWeight: '600', letterSpacing: '-0.02em' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '14px' },
  card: { background: COLORS.card, border: '1px solid ' + COLORS.border, borderRadius: '10px', padding: '20px' },
  cardTitle: { fontSize: '11px', color: COLORS.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '16px' },
  empRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid ' + COLORS.border },
  avatar: (color) => ({ width: '32px', height: '32px', borderRadius: '50%', background: color + '22', border: '1px solid ' + color + '44', color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '600', flexShrink: 0 }),
  presGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' },
  presCard: (active) => ({ borderRadius: '8px', padding: '8px 12px', border: '1px solid ' + (active ? COLORS.green + '44' : COLORS.border), background: active ? COLORS.green + '11' : COLORS.card }),
  loading: { textAlign: 'center', padding: '60px', color: COLORS.muted, fontSize: '13px', letterSpacing: '0.1em' },
  dot: (color) => ({ width: '6px', height: '6px', borderRadius: '50%', background: color, display: 'inline-block', marginRight: '6px' }),
  anomalyRow: { display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 0', borderBottom: '1px solid ' + COLORS.border, fontSize: '12px' },
  badge: (bg, color) => ({ display: 'inline-block', padding: '1px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 600, background: bg, color }),
};

const AVATAR_COLORS = [COLORS.purple, COLORS.green, COLORS.amber, COLORS.red];

function getInitials(first, last) { return (first?.[0] || '') + (last?.[0] || ''); }

function getModulationColor(statut) {
  if (statut === 'majoration_50') return COLORS.red;
  if (statut === 'majoration_25') return COLORS.amber;
  return COLORS.green;
}

function getModulationLabel(statut) {
  if (statut === 'majoration_50') return ['MAJORATION 50%', COLORS.red + '22', COLORS.red];
  if (statut === 'majoration_25') return ['MAJORATION 25%', COLORS.amber + '22', COLORS.amber];
  return ['NORMAL', COLORS.green + '22', COLORS.green];
}

export default function Dashboard() {
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
      } catch (err) {
        console.error('Erreur chargement dashboard');
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  if (loading) return (
    <div style={styles.app}><div style={styles.loading}>CHARGEMENT DES DONNEES...</div></div>
  );

  const totalHeures = modulation.reduce((s, m) => s + parseFloat(m.heures_travaillees || 0), 0);
  const enPoste = presence.filter(p => p.en_poste).length;
  const anomaliesModulation = modulation.filter(m => m.statut !== 'normal').length;

  // Anomalies géo : pointages hors site
  const anomaliesGeo = todayLogs.filter(l => l.geo_valid === false && l.latitude);
  // Retards
  const retards = todayLogs.filter(l => l.is_late);
  const totalAnomalies = anomaliesModulation + anomaliesGeo.length + retards.length;

  const chartData = modulation.map((m) => ({
    name: m.last_name,
    heures: parseFloat(m.heures_travaillees || 0),
    color: getModulationColor(m.statut),
  }));

  const now = new Date();
  const months = ['jan.','fev.','mars','avr.','mai','juin','juil.','aout','sep.','oct.','nov.','dec.'];
  const dateStr = now.getDate() + ' ' + months[now.getMonth()] + ' ' + now.getFullYear();

  return (
    <div style={styles.app}>
      <div style={styles.header}>
        <div style={styles.logo}>
          <span style={{ color: COLORS.purple }}>▸</span> PLANNING HPA
          <span style={{ color: COLORS.muted, fontWeight: 400, fontSize: '13px' }}>/ Management</span>
        </div>
        <div style={styles.period}>{dateStr} · Periode nov. 2025 → oct. 2026</div>
      </div>

      <div style={styles.main}>

        <div style={styles.sectionTitle}>Vue d'ensemble</div>
        <div style={styles.statGrid}>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Salaries actifs</div>
            <div style={{ ...styles.statVal, color: COLORS.text }}>{employees.length}</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Heures pointees (cumul)</div>
            <div style={{ ...styles.statVal, color: COLORS.purple }}>{Math.round(totalHeures)}h</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>En poste maintenant</div>
            <div style={{ ...styles.statVal, color: COLORS.green }}>{enPoste}</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Alertes aujourd'hui</div>
            <div style={{ ...styles.statVal, color: totalAnomalies > 0 ? COLORS.amber : COLORS.green }}>{totalAnomalies}</div>
          </div>
        </div>

        <div style={styles.twoCol}>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Modulation annuelle CC HPA</div>
            {modulation.length === 0 ? (
              <div style={{ color: COLORS.muted, fontSize: '12px' }}>Aucune donnee</div>
            ) : modulation.map((m, i) => {
              const pct = (parseFloat(m.heures_travaillees) / parseFloat(m.seuil_legal)) * 100;
              const color = getModulationColor(m.statut);
              const [label, bg, tc] = getModulationLabel(m.statut);
              return (
                <div key={i} style={{ ...styles.empRow, ...(i === modulation.length - 1 ? { borderBottom: 'none' } : {}) }}>
                  <div style={styles.avatar(AVATAR_COLORS[i % AVATAR_COLORS.length])}>
                    {getInitials(m.first_name, m.last_name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 500 }}>{m.first_name} {m.last_name}</div>
                    <div style={{ height: '4px', background: COLORS.border, borderRadius: '2px', overflow: 'hidden', marginTop: '5px', width: '80px' }}>
                      <div style={{ height: '4px', width: Math.min(pct, 100) + '%', background: color, borderRadius: '2px' }} />
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color }}>{m.heures_travaillees}h</div>
                    <div style={{ marginTop: '4px' }}>
                      <span style={styles.badge(bg, tc)}>{label}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={styles.card}>
            <div style={styles.cardTitle}>Presence aujourd'hui</div>
            {presence.length === 0 ? (
              <div>
                <div style={{ color: COLORS.muted, fontSize: '12px', marginBottom: '10px' }}>Aucun pointage aujourd'hui</div>
                <div style={styles.presGrid}>
                  {employees.slice(0, 4).map((e, i) => (
                    <div key={e.id} style={styles.presCard(false)}>
                      <div style={{ fontSize: '11px', fontWeight: 500 }}>{e.first_name}</div>
                      <div style={{ fontSize: '10px', color: COLORS.muted, marginTop: '2px' }}>
                        <span style={styles.dot(COLORS.muted)} />Non pointe
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={styles.presGrid}>
                {presence.map((p, i) => (
                  <div key={p.id || i} style={styles.presCard(p.en_poste)}>
                    <div style={{ fontSize: '11px', fontWeight: 500 }}>{p.first_name} {p.last_name}</div>
                    <div style={{ fontSize: '10px', color: p.en_poste ? COLORS.green : COLORS.muted, marginTop: '2px' }}>
                      <span style={styles.dot(p.en_poste ? COLORS.green : COLORS.muted)} />
                      {p.en_poste ? 'En poste' : 'Parti'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Anomalies du jour */}
        {(anomaliesGeo.length > 0 || retards.length > 0) && (
          <div>
            <div style={styles.sectionTitle}>Anomalies du jour</div>
            <div style={styles.card}>
              {retards.map((log, i) => (
                <div key={'r' + i} style={{ ...styles.anomalyRow, ...(i === retards.length - 1 && anomaliesGeo.length === 0 ? { borderBottom: 'none' } : {}) }}>
                  <span style={{ fontSize: '15px', color: COLORS.amber }}>⏰</span>
                  <div style={{ flex: 1 }}>
                    <span style={styles.badge(COLORS.amber + '22', COLORS.amber)}>Retard</span>
                    <span style={{ marginLeft: '8px' }}>{log.first_name} {log.last_name}</span>
                    <span style={{ color: COLORS.muted, marginLeft: '8px' }}>
                      {log.late_minutes && log.late_minutes > 0 ? '+' + log.late_minutes + ' min' : ''}
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: COLORS.muted }}>
                    {log.scanned_at ? new Date(log.scanned_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
              ))}
              {anomaliesGeo.map((log, i) => (
                <div key={'g' + i} style={{ ...styles.anomalyRow, ...(i === anomaliesGeo.length - 1 ? { borderBottom: 'none' } : {}) }}>
                  <span style={{ fontSize: '15px', color: COLORS.red }}>📍</span>
                  <div style={{ flex: 1 }}>
                    <span style={styles.badge(COLORS.red + '22', COLORS.red)}>Hors site</span>
                    <span style={{ marginLeft: '8px' }}>{log.first_name} {log.last_name}</span>
                    <span style={{ color: COLORS.muted, marginLeft: '8px', fontSize: '11px' }}>
                      {log.action === 'in' ? 'Arrivee' : 'Depart'} hors perimetre
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: COLORS.muted }}>
                    {log.scanned_at ? new Date(log.scanned_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={styles.sectionTitle}>Heures travaillees vs seuil legal (1 607h)</div>
        <div style={styles.card}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fill: COLORS.muted, fontSize: 11, fontFamily: 'DM Mono, monospace' }} axisLine={{ stroke: COLORS.border }} tickLine={false} />
              <YAxis tick={{ fill: COLORS.muted, fontSize: 10, fontFamily: 'DM Mono, monospace' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: COLORS.card, border: '1px solid ' + COLORS.border, borderRadius: '8px', fontFamily: 'DM Mono, monospace', fontSize: '12px', color: COLORS.text }} formatter={(val) => [val + 'h travaillees']} />
              <Bar dataKey="heures" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

      </div>
    </div>
  );
}
