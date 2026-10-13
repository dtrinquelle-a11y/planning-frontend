import React, { useEffect, useState } from 'react';
import axios from 'axios';
import supabase from '../supabase';
import { useTheme } from '../ThemeContext';
import { API } from '../config';
import { SERVICES, JOURS } from '../consignes';

// Parametrage > Consignes : consignes du jour par service (utile hors saison), avec interrupteur
export default function ConsignesReglages() {
  const { colors: C } = useTheme();
  const [actif, setActif] = useState(false);
  const [service, setService] = useState(SERVICES[0]);
  const [weekly, setWeekly] = useState({});   // "service|jour" -> { id, texte }
  const [drafts, setDrafts] = useState({});   // jour -> texte en cours de saisie (service affiche)
  const [punctual, setPunctual] = useState([]);
  const [form, setForm] = useState({ day: '', service: 'Tous', texte: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  async function load() {
    const [s, rec, pon] = await Promise.all([
      supabase.from('app_settings').select('value').eq('key', 'consignes').maybeSingle(),
      supabase.from('consignes').select('*').not('weekday', 'is', null),
      supabase.from('consignes').select('*').not('day', 'is', null).gte('day', today).order('day'),
    ]);
    setActif(!!s.data?.value?.actif);
    const w = {};
    (rec.data || []).forEach(c => { w[c.service + '|' + c.weekday] = c; });
    setWeekly(w); setDrafts({});
    setPunctual(pon.data || []);
  }
  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggle() {
    const next = !actif;
    setActif(next);
    try { await axios.patch(API + '/settings/consignes', { actif: next }); setMsg({ err: false, text: next ? 'Consignes affichées aux salariés' : 'Consignes masquées' }); }
    catch (err) { setActif(!next); setMsg({ err: true, text: 'Erreur : ' + (err.response?.data?.error || err.message) }); }
  }

  const textOf = jour => (jour in drafts ? drafts[jour] : weekly[service + '|' + jour]?.texte || '');
  const changed = Object.keys(drafts).length > 0;

  async function saveWeekly() {
    setBusy(true); setMsg(null);
    try {
      for (const [jour, texte] of Object.entries(drafts)) {
        const cur = weekly[service + '|' + jour];
        const t = texte.trim();
        if (cur && !t) { const { error } = await supabase.from('consignes').delete().eq('id', cur.id); if (error) throw error; }
        else if (cur && t !== cur.texte) { const { error } = await supabase.from('consignes').update({ texte: t }).eq('id', cur.id); if (error) throw error; }
        else if (!cur && t) { const { error } = await supabase.from('consignes').insert({ service, weekday: parseInt(jour, 10), texte: t }); if (error) throw error; }
      }
      setMsg({ err: false, text: 'Consignes de la semaine enregistrées (' + service + ')' });
      await load();
    } catch (err) { setMsg({ err: true, text: 'Erreur : ' + err.message }); }
    finally { setBusy(false); }
  }

  async function addPunctual() {
    if (!form.day || !form.texte.trim()) { setMsg({ err: true, text: 'Indiquez la date et la consigne.' }); return; }
    const { error } = await supabase.from('consignes').insert({ day: form.day, service: form.service, texte: form.texte.trim() });
    if (error) { setMsg({ err: true, text: 'Erreur : ' + error.message }); return; }
    setForm(f => ({ ...f, texte: '' })); setMsg({ err: false, text: 'Consigne ajoutée' }); load();
  }
  async function remove(c) {
    if (!window.confirm('Supprimer cette consigne ?')) return;
    await supabase.from('consignes').delete().eq('id', c.id); load();
  }

  const inp = { width: '100%', background: C.bg, border: '1px solid ' + C.border, borderRadius: '6px', padding: '7px 9px', color: C.text, fontSize: '12px', fontFamily: 'inherit', boxSizing: 'border-box' };
  const card = { background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '18px', marginBottom: '16px' };
  const lbl = { display: 'block', fontSize: '10px', color: C.muted, letterSpacing: '0.08em', marginBottom: '4px', fontWeight: 500 };

  return (
    <div>
      <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px', color: C.text }}>Consignes du jour</div>
      <div style={{ fontSize: '12px', color: C.muted, marginBottom: '18px', lineHeight: 1.6 }}>
        Utile hors saison : une consigne par jour et par service, affichée aux salariés concernés sur leur accueil et dans leur planning
        (et dans votre planning, sur l'en-tête du jour). Consignes récurrentes chaque semaine, et consignes ponctuelles pour une date précise.
      </div>

      <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', borderColor: actif ? C.green + '88' : C.border }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: C.text }}>Afficher les consignes aux salariés</div>
          <div style={{ fontSize: '11px', color: C.muted }}>{actif ? 'Les consignes sont visibles.' : 'Les consignes sont enregistrées mais masquées (ex. en saison).'}</div>
        </div>
        <button onClick={toggle} role="switch" aria-checked={actif}
          style={{ position: 'relative', width: '52px', height: '28px', borderRadius: '14px', border: 'none', cursor: 'pointer', background: actif ? C.green : C.border, flexShrink: 0 }}>
          <span style={{ position: 'absolute', top: '3px', left: actif ? '27px' : '3px', width: '22px', height: '22px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left .2s' }} />
        </button>
      </div>
      {msg && <div style={{ fontSize: '12px', color: msg.err ? C.red : C.green, marginBottom: '12px' }}>{msg.text}</div>}

      {/* Consignes recurrentes */}
      <div style={card}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: C.text, marginBottom: '10px' }}>Chaque semaine</div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {['Tous', ...SERVICES].map(s => (
            <button key={s} onClick={() => { if (changed && !window.confirm('Modifications non enregistrées pour ' + service + '. Changer de service quand même ?')) return; setService(s); setDrafts({}); }}
              style={{ padding: '5px 12px', borderRadius: '999px', border: '1px solid ' + (service === s ? C.purple : C.border), background: service === s ? C.purpleLight : C.card, color: service === s ? C.purple : C.muted, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>
              {s}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
          {JOURS.map((j, i) => (
            <label key={j} style={lbl}>{j.toUpperCase()}
              <textarea style={{ ...inp, minHeight: '54px', resize: 'vertical' }} value={textOf(String(i + 1))} placeholder="Aucune consigne"
                onChange={e => setDrafts(d => ({ ...d, [String(i + 1)]: e.target.value }))} />
            </label>
          ))}
        </div>
        <button onClick={saveWeekly} disabled={!changed || busy}
          style={{ marginTop: '12px', background: C.purple, border: 'none', borderRadius: '8px', padding: '9px 20px', color: '#fff', fontSize: '13px', fontFamily: 'inherit', fontWeight: 600, cursor: changed ? 'pointer' : 'not-allowed', opacity: changed && !busy ? 1 : 0.6 }}>
          {busy ? 'Enregistrement...' : '💾 Enregistrer · ' + service}
        </button>
      </div>

      {/* Consignes ponctuelles */}
      <div style={card}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: C.text, marginBottom: '10px' }}>Pour une date précise</div>
        <div style={{ display: 'grid', gridTemplateColumns: '150px 160px 1fr auto', gap: '8px', alignItems: 'end', marginBottom: '12px' }}>
          <label style={lbl}>DATE<input type="date" style={inp} min={today} value={form.day} onChange={e => setForm(f => ({ ...f, day: e.target.value }))} /></label>
          <label style={lbl}>SERVICE
            <select style={inp} value={form.service} onChange={e => setForm(f => ({ ...f, service: e.target.value }))}>
              {['Tous', ...SERVICES].map(s => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label style={lbl}>CONSIGNE<input style={inp} value={form.texte} placeholder="Ex : vidanger la piscine, livraison à 10 h…" onChange={e => setForm(f => ({ ...f, texte: e.target.value }))} /></label>
          <button onClick={addPunctual} style={{ background: C.purple, border: 'none', borderRadius: '8px', padding: '8px 14px', color: '#fff', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer' }}>+ Ajouter</button>
        </div>
        {punctual.length === 0 ? <div style={{ fontSize: '12px', color: C.muted }}>Aucune consigne ponctuelle à venir.</div> : punctual.map(c => (
          <div key={c.id} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '7px 0', borderTop: '1px solid ' + C.border + '88', fontSize: '12px' }}>
            <span style={{ width: '90px', color: C.text, fontWeight: 600 }}>{String(c.day).split('-').reverse().join('/')}</span>
            <span style={{ width: '110px', color: C.purple }}>{c.service}</span>
            <span style={{ flex: 1, color: C.text }}>{c.texte}</span>
            <button onClick={() => remove(c)} style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: '13px' }} title="Supprimer">✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
