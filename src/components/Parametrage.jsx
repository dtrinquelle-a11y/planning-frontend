import React, { useState, useEffect } from 'react';
import { useTheme } from '../ThemeContext';
import supabase from '../supabase';

const SHIFT_COLORS = {
  matin:      { bg: '#EEF2FF', border: '#7C6FCD', text: '#4338CA' },
  apres_midi: { bg: '#F0FDF4', border: '#2DB87A', text: '#166534' },
  journee:    { bg: '#FFFBEB', border: '#F5A623', text: '#92400E' },
  soir:       { bg: '#FEF2F2', border: '#E85D5D', text: '#991B1B' },
  custom:     { bg: '#EFF6FF', border: '#3B82F6', text: '#1E40AF' },
};

export default function Parametrage() {
  const { colors: C } = useTheme();
  const [section, setSection] = useState('shifts');
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = React.useRef(null);

  useEffect(() => { loadSettings(); }, []);

  function showToast(msg, color) {
    setToast({ msg, color: color || C.green });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  async function loadSettings() {
    setLoading(true);
    const { data } = await supabase.from('app_settings').select('*');
    const map = {};
    (data || []).forEach(s => { map[s.key] = s.value; });
    setSettings(map);
    setLoading(false);
  }

  async function saveSetting(key, value) {
    setSaving(true);
    try {
      await supabase.from('app_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key);
      setSettings(prev => ({ ...prev, [key]: value }));
      showToast('Sauvegardé !');
    } catch (err) {
      showToast('Erreur : ' + err.message, C.red);
    } finally { setSaving(false); }
  }

  const inp = { width: '100%', background: C.bg, border: '1px solid ' + C.border, borderRadius: '6px', padding: '8px 10px', color: C.text, fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' };
  const lbl = { display: 'block', fontSize: '10px', color: C.muted, letterSpacing: '0.08em', marginBottom: '4px', fontWeight: 500 };

  const sections = [
    { id: 'shifts', label: '⏰ Shifts', icon: '⏰' },
    { id: 'camping', label: '🏕️ Camping', icon: '🏕️' },
    { id: 'geoloc', label: '📍 Géoloc', icon: '📍' },
    { id: 'cc_hpa', label: '⚖️ CC HPA', icon: '⚖️' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Mono','Courier New',monospace" }}>
      {/* Header */}
      <div style={{ background: C.card, borderBottom: '1px solid ' + C.border, padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '11px', color: C.muted, letterSpacing: '0.1em', marginBottom: '2px' }}>ADMINISTRATION</div>
          <div style={{ fontSize: '18px', fontWeight: 600, color: C.text }}>Paramétrage</div>
        </div>
        <div style={{ fontSize: '12px', color: C.muted, background: C.amberLight, border: '1px solid ' + C.amber + '44', borderRadius: '6px', padding: '6px 12px' }}>
          ⚠️ Les modifications sont appliquées immédiatement
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', minHeight: 'calc(100vh - 80px)' }}>
        {/* Nav latérale */}
        <div style={{ borderRight: '1px solid ' + C.border, padding: '16px', background: C.card }}>
          {sections.map(s => (
            <button key={s.id} onClick={() => setSection(s.id)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', border: 'none', background: section === s.id ? C.purpleLight : 'none', color: section === s.id ? C.purple : C.text, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', fontWeight: section === s.id ? 600 : 400, marginBottom: '4px', textAlign: 'left' }}>
              <span style={{ fontSize: '16px' }}>{s.icon}</span>
              {s.label}
            </button>
          ))}
        </div>

        {/* Contenu */}
        <div style={{ padding: '24px', maxWidth: '700px' }}>
          {loading ? (
            <div style={{ color: C.muted, fontSize: '13px' }}>Chargement...</div>
          ) : (
            <>
              {/* SHIFTS */}
              {section === 'shifts' && (
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px', color: C.text }}>Shifts par défaut</div>
                  <div style={{ fontSize: '12px', color: C.muted, marginBottom: '24px' }}>Horaires proposés lors de la création d'un créneau dans le planning.</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {(settings.shifts || []).filter(s => s.id !== 'repos').map((shift, i) => {
                      const sc = SHIFT_COLORS[shift.id] || SHIFT_COLORS.custom;
                      return (
                        <div key={shift.id} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '16px', borderLeft: '4px solid ' + sc.border }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                            <div style={{ background: sc.bg, border: '1px solid ' + sc.border, color: sc.text, padding: '3px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 }}>{shift.label}</div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div>
                              <label style={lbl}>HEURE DE DÉBUT</label>
                              <input type="time" style={inp} value={shift.start}
                                onChange={e => {
                                  const newShifts = [...settings.shifts];
                                  newShifts[i] = { ...shift, start: e.target.value };
                                  setSettings(prev => ({ ...prev, shifts: newShifts }));
                                }} />
                            </div>
                            <div>
                              <label style={lbl}>HEURE DE FIN</label>
                              <input type="time" style={inp} value={shift.end}
                                onChange={e => {
                                  const newShifts = [...settings.shifts];
                                  newShifts[i] = { ...shift, end: e.target.value };
                                  setSettings(prev => ({ ...prev, shifts: newShifts }));
                                }} />
                            </div>
                          </div>
                          <div style={{ marginTop: '10px', fontSize: '11px', color: C.muted }}>
                            Durée : {(() => {
                              const [sh, sm] = shift.start.split(':').map(Number);
                              const [eh, em] = shift.end.split(':').map(Number);
                              let mins = eh*60+em - sh*60-sm;
                              if (mins < 0) mins += 24*60;
                              return (mins/60).toFixed(1) + 'h';
                            })()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button onClick={() => saveSetting('shifts', settings.shifts)} disabled={saving}
                    style={{ marginTop: '20px', background: C.purple, border: 'none', borderRadius: '8px', padding: '10px 24px', color: '#fff', fontSize: '13px', fontFamily: 'inherit', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                    {saving ? 'Sauvegarde...' : '💾 Sauvegarder les shifts'}
                  </button>
                </div>
              )}

              {/* CAMPING */}
              {section === 'camping' && (
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px', color: C.text }}>Informations camping</div>
                  <div style={{ fontSize: '12px', color: C.muted, marginBottom: '24px' }}>Affichées dans les PDF et l'onboarding.</div>
                  <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {[
                      { key: 'name', label: 'NOM DU CAMPING' },
                      { key: 'address', label: 'ADRESSE' },
                      { key: 'city', label: 'VILLE' },
                      { key: 'postal_code', label: 'CODE POSTAL' },
                      { key: 'invitation_code', label: 'CODE INVITATION ONBOARDING' },
                    ].map(field => (
                      <div key={field.key}>
                        <label style={lbl}>{field.label}</label>
                        <input style={inp} value={settings.camping_info?.[field.key] || ''}
                          onChange={e => setSettings(prev => ({ ...prev, camping_info: { ...prev.camping_info, [field.key]: e.target.value } }))} />
                      </div>
                    ))}
                  </div>
                  <button onClick={() => saveSetting('camping_info', settings.camping_info)} disabled={saving}
                    style={{ marginTop: '20px', background: C.purple, border: 'none', borderRadius: '8px', padding: '10px 24px', color: '#fff', fontSize: '13px', fontFamily: 'inherit', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                    {saving ? 'Sauvegarde...' : '💾 Sauvegarder'}
                  </button>
                </div>
              )}

              {/* GEOLOC */}
              {section === 'geoloc' && (
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px', color: C.text }}>Géolocalisation pointeuse</div>
                  <div style={{ fontSize: '12px', color: C.muted, marginBottom: '24px' }}>Coordonnées du site et périmètre autorisé pour le pointage.</div>
                  <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={lbl}>LATITUDE</label>
                        <input type="number" step="0.00001" style={inp} value={settings.geoloc?.lat || ''}
                          onChange={e => setSettings(prev => ({ ...prev, geoloc: { ...prev.geoloc, lat: parseFloat(e.target.value) } }))} />
                      </div>
                      <div>
                        <label style={lbl}>LONGITUDE</label>
                        <input type="number" step="0.00001" style={inp} value={settings.geoloc?.lon || ''}
                          onChange={e => setSettings(prev => ({ ...prev, geoloc: { ...prev.geoloc, lon: parseFloat(e.target.value) } }))} />
                      </div>
                    </div>
                    <div>
                      <label style={lbl}>RAYON AUTORISÉ (mètres)</label>
                      <input type="number" min="50" max="2000" step="50" style={inp} value={settings.geoloc?.radius || 300}
                        onChange={e => setSettings(prev => ({ ...prev, geoloc: { ...prev.geoloc, radius: parseInt(e.target.value) } }))} />
                      <div style={{ fontSize: '11px', color: C.muted, marginTop: '4px' }}>Actuellement : {settings.geoloc?.radius || 300}m autour du site</div>
                    </div>
                    <div style={{ background: C.purpleLight, border: '1px solid ' + C.purple + '44', borderRadius: '8px', padding: '12px', fontSize: '12px', color: C.purple }}>
                      📍 Position actuelle : {settings.geoloc?.lat}, {settings.geoloc?.lon}<br/>
                      <span style={{ fontSize: '11px', color: C.muted }}>Le Bout du Monde · Verdun-en-Lauragais</span>
                    </div>
                  </div>
                  <div style={{ background: C.amberLight, border: '1px solid ' + C.amber + '44', borderRadius: '8px', padding: '12px', fontSize: '12px', color: C.amber, marginTop: '12px' }}>
                    ⚠️ La modification des coordonnées nécessite aussi une mise à jour du backend (timeclock.js)
                  </div>
                  <button onClick={() => saveSetting('geoloc', settings.geoloc)} disabled={saving}
                    style={{ marginTop: '16px', background: C.purple, border: 'none', borderRadius: '8px', padding: '10px 24px', color: '#fff', fontSize: '13px', fontFamily: 'inherit', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                    {saving ? 'Sauvegarde...' : '💾 Sauvegarder'}
                  </button>
                </div>
              )}

              {/* CC HPA */}
              {section === 'cc_hpa' && (
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px', color: C.text }}>Seuils CC HPA · IDCC 1631</div>
                  <div style={{ fontSize: '12px', color: C.muted, marginBottom: '24px' }}>Paramètres de la convention collective Hôtellerie de Plein Air.</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                    <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '20px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: C.text, marginBottom: '14px' }}>Modulation annuelle</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <label style={lbl}>SEUIL LÉGAL (h/an)</label>
                          <input type="number" style={inp} value={settings.cc_hpa?.legal_threshold || 1607}
                            onChange={e => setSettings(prev => ({ ...prev, cc_hpa: { ...prev.cc_hpa, legal_threshold: parseInt(e.target.value) } }))} />
                          <div style={{ fontSize: '10px', color: C.muted, marginTop: '3px' }}>Déclenchement majoration 25%</div>
                        </div>
                        <div>
                          <label style={lbl}>SEUIL MAJORATION 50% (h/an)</label>
                          <input type="number" style={inp} value={settings.cc_hpa?.threshold_25 || 1790}
                            onChange={e => setSettings(prev => ({ ...prev, cc_hpa: { ...prev.cc_hpa, threshold_25: parseInt(e.target.value) } }))} />
                          <div style={{ fontSize: '10px', color: C.muted, marginTop: '3px' }}>Déclenchement majoration 50%</div>
                        </div>
                      </div>
                    </div>

                    <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '20px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: C.text, marginBottom: '14px' }}>Durée hebdomadaire</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <label style={lbl}>HEURES CONTRACTUELLES (h/sem)</label>
                          <input type="number" style={inp} value={settings.cc_hpa?.weekly_contract || 35}
                            onChange={e => setSettings(prev => ({ ...prev, cc_hpa: { ...prev.cc_hpa, weekly_contract: parseInt(e.target.value) } }))} />
                        </div>
                        <div>
                          <label style={lbl}>SEUIL ALERTE (h/sem)</label>
                          <input type="number" style={inp} value={settings.cc_hpa?.weekly_alert || 44}
                            onChange={e => setSettings(prev => ({ ...prev, cc_hpa: { ...prev.cc_hpa, weekly_alert: parseInt(e.target.value) } }))} />
                        </div>
                        <div>
                          <label style={lbl}>MAXIMUM LÉGAL (h/sem)</label>
                          <input type="number" style={inp} value={settings.cc_hpa?.weekly_max || 48}
                            onChange={e => setSettings(prev => ({ ...prev, cc_hpa: { ...prev.cc_hpa, weekly_max: parseInt(e.target.value) } }))} />
                        </div>
                      </div>
                    </div>

                    <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '20px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: C.text, marginBottom: '14px' }}>Période de modulation</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <label style={lbl}>DÉBUT DE PÉRIODE</label>
                          <input type="date" style={inp} value={settings.cc_hpa?.period_start || '2025-11-01'}
                            onChange={e => setSettings(prev => ({ ...prev, cc_hpa: { ...prev.cc_hpa, period_start: e.target.value } }))} />
                        </div>
                        <div>
                          <label style={lbl}>FIN DE PÉRIODE</label>
                          <input type="date" style={inp} value={settings.cc_hpa?.period_end || '2026-10-31'}
                            onChange={e => setSettings(prev => ({ ...prev, cc_hpa: { ...prev.cc_hpa, period_end: e.target.value } }))} />
                        </div>
                      </div>
                    </div>

                    <div style={{ background: C.greenLight, border: '1px solid ' + C.green + '44', borderRadius: '8px', padding: '12px', fontSize: '12px', color: C.green }}>
                      ✓ Période actuelle : {settings.cc_hpa?.period_start} → {settings.cc_hpa?.period_end}
                    </div>
                  </div>
                  <button onClick={() => saveSetting('cc_hpa', settings.cc_hpa)} disabled={saving}
                    style={{ marginTop: '20px', background: C.purple, border: 'none', borderRadius: '8px', padding: '10px 24px', color: '#fff', fontSize: '13px', fontFamily: 'inherit', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                    {saving ? 'Sauvegarde...' : '💾 Sauvegarder'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {toast && <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: C.card, border: '1px solid ' + (toast.color || C.green), borderRadius: '8px', padding: '10px 16px', fontSize: '12px', color: toast.color || C.green, zIndex: 200, boxShadow: '0 4px 12px ' + C.shadow }}>{toast.msg}</div>}
    </div>
  );
}
