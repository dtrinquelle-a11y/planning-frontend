import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts';

const API = 'https://mon-planning-production.up.railway.app/api';

const COLORS = {
  purple: '#7C6FCD',
  green: '#2DB87A',
  amber: '#F5A623',
  red: '#E85D5D',
  bg: '#0F1117',
  card: '#1A1D27',
  border: '#2A2D3A',
  text: '#E8E6DC',
  muted: '#6B6E82',
};

const styles = {
  app: {
    minHeight: '100vh',
    background: COLORS.bg,
    color: COLORS.text,
    fontFamily: "'DM Mono', 'Courier New', monospace",
    padding: '0',
  },
  header: {
    borderBottom: `1px solid ${COLORS.border}`,
    padding: '20px 32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: COLORS.card,
  },
  logo: {
    fontSize: '16px',
    fontWeight: '600',
    letterSpacing: '0.1em',
    color: COLORS.text,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  logoAccent: {
    color: COLORS.purple,
  },
  period: {
    fontSize: '11px',
    color: COLORS.muted,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  main: {
    padding: '28px 32px',
    maxWidth: '1100px',
    margin: '0 auto',
  },
  sectionTitle: {
    fontSize: '11px',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: COLORS.muted,
    marginBottom: '14px',
    marginTop: '28px',
  },
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '12px',
    marginBottom: '8px',
  },
  statCard: {
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: '10px',
    padding: '18px 20px',
  },
  statLabel: {
    fontSize: '10px',
    color: COLORS.muted,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: '8px',
  },
  statVal: {
    fontSize: '28px',
    fontWeight: '600',
    letterSpacing: '-0.02em',
  },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    marginTop: '14px',
  },
  card: {
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: '10px',
    padding: '20px',
  },
  cardTitle: {
    fontSize: '11px',
    color: COLORS.muted,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: '16px',
  },
  empRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 0',
    borderBottom: `1px solid ${COLORS.border}`,
  },
  avatar: (color) => ({
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    background: color + '22',
    border: `1px solid ${color}44`,
    color: color,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: '600',
    flexShrink: 0,
  }),
  empName: {
    fontSize: '13px',
    fontWeight: '500',
    flex: 1,
  },
  empRole: {
    fontSize: '10px',
    color: COLORS.muted,
  },
  barWrap: {
    width: '80px',
    flexShrink: 0,
  },
  barBg: {
    height: '4px',
    background: COLORS.border,
    borderRadius: '2px',
    overflow: 'hidden',
  },
  barFill: (pct, color) => ({
    height: '4px',
    width: `${Math.min(pct, 100)}%`,
    background: color,
    borderRadius: '2px',
    transition: 'width 0.6s ease',
  }),
  hoursVal: {
    fontSize: '12px',
    fontWeight: '600',
    minWidth: '36px',
    textAlign: 'right',
    flexShrink: 0,
  },
  badge: (bg, color) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '20px',
    fontSize: '10px',
    fontWeight: '600',
    background: bg,
    color: color,
    letterSpacing: '0.05em',
  }),
  presGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
  },
  presCard: (active) => ({
    borderRadius: '8px',
    padding: '10px 12px',
    border: `1px solid ${active ? COLORS.green + '44' : COLORS.border}`,
    background: active ? COLORS.green + '11' : COLORS.card,
  }),
  presName: {
    fontSize: '12px',
    fontWeight: '600',
    marginBottom: '3px',
  },
  presStatus: (active) => ({
    fontSize: '10px',
    color: active ? COLORS.green : COLORS.muted,
    letterSpacing: '0.05em',
  }),
  loading: {
    textAlign: 'center',
    padding: '60px',
    color: COLORS.muted,
    fontSize: '13px',
    letterSpacing: '0.1em',
  },
  error: {
    textAlign: 'center',
    padding: '40px',
    color: COLORS.red,
    fontSize: '13px',
  },
  dot: (color) => ({
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: color,
    display: 'inline-block',
    marginRight: '6px',
  }),
};

const AVATAR_COLORS = [COLORS.purple, COLORS.green, COLORS.amber, COLORS.red];

function getInitials(first, last) {
  return (first?.[0] || '') + (last?.[0] || '');
}

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [empRes, modRes, presRes] = await Promise.all([
          axios.get(`${API}/employees`),
          axios.get(`${API}/timeclock/modulation`),
          axios.get(`${API}/timeclock/presence`),
        ]);
        setEmployees(empRes.data);
        setModulation(modRes.data);
        setPresence(presRes.data);
      } catch (err) {
        setError('Impossible de charger les données — vérifie la connexion API.');
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  if (loading) return (
    <div style={styles.app}>
      <div style={styles.loading}>CHARGEMENT DES DONNÉES...</div>
    </div>
  );

  if (error) return (
    <div style={styles.app}>
      <div style={styles.error}>{error}</div>
    </div>
  );

  const totalHeures = modulation.reduce((s, m) => s + parseFloat(m.heures_travaillees || 0), 0);
  const enPoste = presence.filter(p => p.en_poste).length;
  const anomalies = modulation.filter(m => m.statut !== 'normal').length;
  const maxH = Math.max(...modulation.map(m => parseFloat(m.heures_travaillees || 0)), 1);

  const chartData = modulation.map((m, i) => ({
    name: m.last_name,
    heures: parseFloat(m.heures_travaillees || 0),
    seuil: parseFloat(m.seuil_legal || 1607),
    color: getModulationColor(m.statut),
  }));

  const now = new Date();
  const months = ['jan.','fév.','mars','avr.','mai','juin','juil.','août','sep.','oct.','nov.','déc.'];
  const dateStr = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;

  return (
    <div style={styles.app}>
      <div style={styles.header}>
        <div style={styles.logo}>
          <span style={styles.logoAccent}>▸</span> PLANNING HPA
          <span style={{ color: COLORS.muted, fontWeight: 400, fontSize: '13px' }}>/ Management</span>
        </div>
        <div style={styles.period}>{dateStr} · Période nov. 2025 → oct. 2026</div>
      </div>

      <div style={styles.main}>

        <div style={styles.sectionTitle}>Vue d'ensemble</div>
        <div style={styles.statGrid}>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Salariés actifs</div>
            <div style={{ ...styles.statVal, color: COLORS.text }}>{employees.length}</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Heures pointées (cumul)</div>
            <div style={{ ...styles.statVal, color: COLORS.purple }}>{Math.round(totalHeures)}h</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>En poste maintenant</div>
            <div style={{ ...styles.statVal, color: COLORS.green }}>{enPoste}</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Alertes modulation</div>
            <div style={{ ...styles.statVal, color: anomalies > 0 ? COLORS.amber : COLORS.green }}>
              {anomalies}
            </div>
          </div>
        </div>

        <div style={styles.twoCol}>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Modulation annuelle CC HPA</div>
            {modulation.length === 0 ? (
              <div style={{ color: COLORS.muted, fontSize: '12px' }}>Aucune donnée</div>
            ) : modulation.map((m, i) => {
              const pct = (parseFloat(m.heures_travaillees) / parseFloat(m.seuil_legal)) * 100;
              const color = getModulationColor(m.statut);
              const [label, bg, tc] = getModulationLabel(m.statut);
              return (
                <div key={m.id || i} style={{
                  ...styles.empRow,
                  ...(i === modulation.length - 1 ? { borderBottom: 'none' } : {})
                }}>
                  <div style={styles.avatar(AVATAR_COLORS[i % AVATAR_COLORS.length])}>
                    {getInitials(m.first_name, m.last_name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={styles.empName}>{m.first_name} {m.last_name}</div>
                    <div style={styles.barWrap}>
                      <div style={styles.barBg}>
                        <div style={styles.barFill(pct, color)} />
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ ...styles.hoursVal, color }}>{m.heures_travaillees}h</div>
                    <div style={{ marginTop: '4px' }}>
                      <span style={styles.badge(bg, tc)}>{label}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={styles.card}>
            <div style={styles.cardTitle}>Présence aujourd'hui</div>
            {presence.length === 0 ? (
              <div style={{ color: COLORS.muted, fontSize: '12px' }}>
                Aucun pointage aujourd'hui
              </div>
            ) : (
              <div style={styles.presGrid}>
                {presence.map((p, i) => (
                  <div key={p.id || i} style={styles.presCard(p.en_poste)}>
                    <div style={styles.presName}>{p.first_name} {p.last_name}</div>
                    <div style={styles.presStatus(p.en_poste)}>
                      <span style={styles.dot(p.en_poste ? COLORS.green : COLORS.muted)} />
                      {p.en_poste ? 'En poste' : 'Parti'}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {presence.length === 0 && employees.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <div style={styles.presGrid}>
                  {employees.slice(0, 4).map((e, i) => (
                    <div key={e.id} style={styles.presCard(false)}>
                      <div style={styles.presName}>{e.first_name}</div>
                      <div style={styles.presStatus(false)}>
                        <span style={styles.dot(COLORS.muted)} />
                        Non pointé
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={styles.sectionTitle}>Heures travaillées vs seuil légal (1 607h)</div>
        <div style={styles.card}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="name"
                tick={{ fill: COLORS.muted, fontSize: 11, fontFamily: 'DM Mono, monospace' }}
                axisLine={{ stroke: COLORS.border }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: COLORS.muted, fontSize: 10, fontFamily: 'DM Mono, monospace' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: COLORS.card,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '8px',
                  fontFamily: 'DM Mono, monospace',
                  fontSize: '12px',
                  color: COLORS.text,
                }}
                formatter={(val) => [`${val}h travaillées`]}
              />
              <Bar dataKey="heures" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

      </div>
    </div>
  );
}
