import React, { useEffect, useRef, useState } from 'react';
import supabase from '../supabase';
import { useTheme } from '../ThemeContext';
import { docStatus, STATUS_INFO, youtubeId, frDateTime, frDay, openCommonFile } from '../signatures';

// Charge une seule fois l'API du lecteur YouTube (pour savoir si la video a ete vue jusqu'au bout)
let ytPromise = null;
function loadYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (!ytPromise) {
    ytPromise = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(window.YT); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => { ytPromise = null; reject(new Error('YouTube indisponible')); };
      document.head.appendChild(s);
    });
  }
  return ytPromise;
}

// Lecteur integre : onEnded quand la video est terminee ; onFallback si le lecteur ne peut pas se charger
function YouTubePlayer({ videoId, onEnded, onFallback }) {
  const ref = useRef(null);
  useEffect(() => {
    let player = null; let cancelled = false;
    loadYouTubeApi().then(YT => {
      if (cancelled || !ref.current) return;
      player = new YT.Player(ref.current, {
        videoId, host: 'https://www.youtube-nocookie.com',
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: { onStateChange: e => { if (e.data === YT.PlayerState.ENDED) onEnded(); } },
      });
    }).catch(() => { if (!cancelled) onFallback(); });
    return () => { cancelled = true; try { player && player.destroy(); } catch {} };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);
  return (
    <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: '8px', overflow: 'hidden', background: '#000' }}>
      <div style={{ position: 'absolute', inset: 0 }}><div ref={ref} style={{ width: '100%', height: '100%' }} /></div>
    </div>
  );
}

// Onglet "Documents communs" de l'espace salarie : documents a signer, puis documents en simple consultation
export default function DocsASigner({ employee, readOnly, onChange }) {
  const { colors: C } = useTheme();
  const [docs, setDocs] = useState([]);
  const [sigs, setSigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [consulted, setConsulted] = useState({}); // doc.id -> true quand ouvert / video terminee
  const [checked, setChecked] = useState({});
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  async function load() {
    setLoading(true);
    const [d, s] = await Promise.all([
      supabase.from('mandatory_docs').select('*').eq('is_active', true).order('sort_order').order('created_at'),
      supabase.from('mandatory_doc_signatures').select('*').eq('employee_id', employee.id).order('signed_at', { ascending: false }),
    ]);
    setDocs(d.data || []); setSigs(s.data || []); setLoading(false);
  }
  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id]);

  async function sign(doc) {
    setBusy(doc.id); setMsg(null);
    const { error } = await supabase.from('mandatory_doc_signatures').insert({ doc_id: doc.id, employee_id: employee.id, user_agent: navigator.userAgent.slice(0, 300) });
    setBusy(null);
    if (error) { setMsg({ err: true, text: 'Erreur : ' + error.message }); return; }
    setMsg({ err: false, text: '« ' + doc.title + ' » signé. Merci !' });
    setOpenId(null);
    await load();
    if (onChange) onChange();
    window.dispatchEvent(new Event('badges-refresh'));
  }

  async function consultFile(doc) {
    if (await openCommonFile(doc)) setConsulted(c => ({ ...c, [doc.id]: true }));
  }

  if (loading) return <div style={{ color: C.muted, fontSize: '12px', textAlign: 'center', padding: '30px' }}>Chargement...</div>;
  if (!docs.length) return (
    <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '24px', textAlign: 'center', color: C.muted, fontSize: '12px' }}>
      Aucun document pour le moment.
    </div>
  );

  const infoDocs = docs.filter(d => !d.requires_signature);
  const rows = docs.filter(d => d.requires_signature).map(d => ({ doc: d, st: docStatus(d, sigs) }))
    .sort((a, b) => (a.st.state === 'signe' ? 1 : 0) - (b.st.state === 'signe' ? 1 : 0));
  const pending = rows.filter(r => r.st.state !== 'signe').length;

  return (
    <div>
      {rows.length > 0 && <div style={{ fontSize: '11px', color: C.muted, letterSpacing: '0.08em', marginBottom: '8px' }}>À LIRE ET SIGNER</div>}
      {rows.length > 0 && <div style={{ fontSize: '12px', color: C.muted, marginBottom: '14px', lineHeight: 1.6 }}>
        {pending ? <><strong style={{ color: C.red }}>{pending} document{pending > 1 ? 's' : ''} à lire et signer.</strong> Ouvrez chaque document (ou regardez la vidéo jusqu'au bout), puis signez.</>
          : 'Tous vos documents sont signés. Merci !'}
      </div>}
      {msg && <div style={{ fontSize: '12px', color: msg.err ? C.red : C.green, marginBottom: '10px' }}>{msg.text}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {rows.map(({ doc, st }) => {
          const info = STATUS_INFO[st.state];
          const isOpen = openId === doc.id;
          const vid = doc.kind === 'video' ? youtubeId(doc.video_url) : null;
          const canSign = consulted[doc.id] && checked[doc.id];
          return (
            <div key={doc.id} style={{ background: C.card, border: '1px solid ' + C.border, borderLeft: '4px solid ' + info.color, borderRadius: '10px', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '18px' }}>{doc.kind === 'video' ? '🎬' : '📄'}</span>
                <div style={{ flex: 1, minWidth: '180px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: C.text }}>{doc.title}</div>
                  <div style={{ fontSize: '11px', color: C.muted }}>
                    {st.state === 'signe'
                      ? (st.last.method === 'papier' ? 'Signé sur papier le ' + frDay(st.last.signed_at) : 'Signé le ' + frDateTime(st.last.signed_at)) + (st.expires ? ' · à renouveler le ' + frDay(st.expires) : '')
                      : st.last ? 'Dernière signature le ' + frDay(st.last.signed_at) : (doc.renewal === 'annuel' ? 'À signer chaque année' : 'À signer une fois')}
                  </div>
                </div>
                <span style={{ background: info.bg, color: info.color, padding: '2px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>{info.label}</span>
                <button onClick={() => setOpenId(isOpen ? null : doc.id)}
                  style={{ background: st.state === 'signe' ? C.card : C.purple, border: '1px solid ' + (st.state === 'signe' ? C.border : C.purple), borderRadius: '6px', padding: '6px 12px', color: st.state === 'signe' ? C.text : '#fff', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit', fontWeight: 600 }}>
                  {isOpen ? 'Fermer' : st.state === 'signe' ? 'Revoir' : readOnly ? 'Voir' : 'Lire et signer'}
                </button>
              </div>

              {isOpen && (
                <div style={{ marginTop: '12px', borderTop: '1px solid ' + C.border, paddingTop: '12px' }}>
                  {doc.description && <div style={{ fontSize: '12px', color: C.text, marginBottom: '10px', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{doc.description}</div>}
                  {doc.kind === 'video' ? (
                    vid ? <YouTubePlayer videoId={vid} onEnded={() => setConsulted(c => ({ ...c, [doc.id]: true }))} onFallback={() => setConsulted(c => ({ ...c, [doc.id]: 'lien' }))} />
                      : <a href={doc.video_url} target="_blank" rel="noreferrer" onClick={() => setConsulted(c => ({ ...c, [doc.id]: true }))} style={{ color: C.purple, fontSize: '12px' }}>Ouvrir la vidéo</a>
                  ) : (
                    <button onClick={() => consultFile(doc)}
                      style={{ background: C.purpleLight, border: '1px solid ' + C.purple + '44', borderRadius: '8px', padding: '9px 16px', color: C.purple, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600 }}>
                      📄 Ouvrir le document ({doc.file_name})
                    </button>
                  )}
                  {consulted[doc.id] === 'lien' && <div style={{ fontSize: '11px', color: C.muted, marginTop: '6px' }}>Le lecteur n'a pas pu se charger : <a href={doc.video_url} target="_blank" rel="noreferrer" style={{ color: C.purple }}>regarder la vidéo sur YouTube</a>.</div>}

                  {st.state !== 'signe' && !readOnly && (
                    <div style={{ marginTop: '14px', background: C.bg, border: '1px solid ' + C.border, borderRadius: '8px', padding: '12px' }}>
                      {!consulted[doc.id] && <div style={{ fontSize: '11px', color: C.amber, marginBottom: '8px' }}>{doc.kind === 'video' ? 'Regardez la vidéo jusqu\'à la fin pour pouvoir signer.' : 'Ouvrez le document pour pouvoir signer.'}</div>}
                      <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '12px', color: C.text, cursor: consulted[doc.id] ? 'pointer' : 'not-allowed', opacity: consulted[doc.id] ? 1 : 0.5, lineHeight: 1.5 }}>
                        <input type="checkbox" disabled={!consulted[doc.id]} checked={!!checked[doc.id]} onChange={e => setChecked(c => ({ ...c, [doc.id]: e.target.checked }))} style={{ marginTop: '2px', accentColor: C.purple }} />
                        <span>Je soussigné(e) <strong>{employee.first_name} {employee.last_name}</strong> atteste avoir {doc.kind === 'video' ? 'visionné' : 'lu et pris connaissance de'} « {doc.title} » et m'engage à en respecter le contenu.</span>
                      </label>
                      <button onClick={() => sign(doc)} disabled={!canSign || busy === doc.id}
                        style={{ marginTop: '10px', background: C.green, border: 'none', borderRadius: '8px', padding: '9px 18px', color: '#fff', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600, cursor: canSign ? 'pointer' : 'not-allowed', opacity: canSign && busy !== doc.id ? 1 : 0.5 }}>
                        {busy === doc.id ? 'Signature...' : '✍️ Signer'}
                      </button>
                      <div style={{ fontSize: '10px', color: C.muted, marginTop: '6px' }}>La date, l'heure et votre compte sont enregistrés comme preuve de signature.</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {infoDocs.length > 0 && (
        <>
          <div style={{ fontSize: '11px', color: C.muted, letterSpacing: '0.08em', margin: (rows.length ? '22px' : '0') + ' 0 8px' }}>À CONSULTER</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {infoDocs.map(doc => {
              const isOpen = openId === doc.id;
              const vid = doc.kind === 'video' ? youtubeId(doc.video_url) : null;
              return (
                <div key={doc.id} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '10px', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '18px' }}>{doc.kind === 'video' ? '🎬' : '📘'}</span>
                    <div style={{ flex: 1, minWidth: '180px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: C.text }}>{doc.title}</div>
                      {doc.description && <div style={{ fontSize: '11px', color: C.muted, whiteSpace: 'pre-wrap' }}>{doc.description}</div>}
                    </div>
                    {doc.kind === 'video' && vid
                      ? <button onClick={() => setOpenId(isOpen ? null : doc.id)} style={{ background: C.purpleLight, border: '1px solid ' + C.purple + '44', borderRadius: '6px', padding: '6px 12px', color: C.purple, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit', fontWeight: 600 }}>{isOpen ? 'Fermer' : '▶ Regarder'}</button>
                      : <button onClick={() => doc.kind === 'video' ? window.open(doc.video_url, '_blank') : openCommonFile(doc)} style={{ background: C.purpleLight, border: '1px solid ' + C.purple + '44', borderRadius: '6px', padding: '6px 12px', color: C.purple, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit', fontWeight: 600 }}>Ouvrir</button>}
                  </div>
                  {isOpen && vid && <div style={{ marginTop: '12px' }}><YouTubePlayer videoId={vid} onEnded={() => {}} onFallback={() => window.open(doc.video_url, '_blank')} /></div>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
