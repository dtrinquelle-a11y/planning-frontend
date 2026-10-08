import supabase from './supabase';

// Documents communs a lire et signer (tables mandatory_docs / mandatory_doc_signatures)

export const RENEWALS = [
  { id: 'annuel', label: 'Chaque année', hint: 'à signer de nouveau 12 mois après la dernière signature' },
  { id: 'embauche', label: 'Une fois (à l\'embauche)', hint: 'une seule signature suffit' },
];

// Etat d'un document pour un salarie, a partir de ses signatures (toutes versions confondues)
// -> { state: 'signe' | 'a_signer' | 'expire' | 'nouvelle_version', last, expires }
export function docStatus(doc, sigs) {
  const mine = (sigs || []).filter(s => s.doc_id === doc.id).sort((a, b) => new Date(b.signed_at) - new Date(a.signed_at));
  const current = mine.find(s => s.version === doc.version);
  if (!current) return { state: mine.length ? 'nouvelle_version' : 'a_signer', last: mine[0] || null };
  if (doc.renewal === 'annuel') {
    const expires = new Date(current.signed_at);
    expires.setFullYear(expires.getFullYear() + 1);
    if (expires < new Date()) return { state: 'expire', last: current, expires };
    return { state: 'signe', last: current, expires };
  }
  return { state: 'signe', last: current };
}

export const STATUS_INFO = {
  signe: { label: 'Signé', color: '#16A34A', bg: '#F0FDF4' },
  a_signer: { label: 'À signer', color: '#DC2626', bg: '#FEF2F2' },
  expire: { label: 'À signer de nouveau (1 an)', color: '#D97706', bg: '#FFFBEB' },
  nouvelle_version: { label: 'Nouvelle version à signer', color: '#D97706', bg: '#FFFBEB' },
};

// Identifiant d'une video YouTube (liens youtu.be, watch?v=, embed/, shorts/)
export function youtubeId(url) {
  const m = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/.exec(url || '');
  return m ? m[1] : null;
}

export const frDateTime = iso => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const frDay = iso => new Date(iso).toLocaleDateString('fr-FR');

// Nombre de documents en attente de signature pour un salarie (pastilles)
export async function countDocsToSign(empId) {
  if (!empId) return 0;
  const [docs, sigs] = await Promise.all([
    supabase.from('mandatory_docs').select('id, version, renewal').eq('is_active', true).eq('requires_signature', true),
    supabase.from('mandatory_doc_signatures').select('doc_id, version, signed_at').eq('employee_id', empId),
  ]);
  return (docs.data || []).filter(d => docStatus(d, sigs.data).state !== 'signe').length;
}

// Ouvre un fichier commun dans un nouvel onglet (lien temporaire)
export async function openCommonFile(doc) {
  const w = window.open('', '_blank'); // ouvert tout de suite, sinon bloque sur mobile
  const { data, error } = await supabase.storage.from('documents-communs').createSignedUrl(doc.file_path, 300);
  if (error || !data) { if (w) w.close(); alert('Document indisponible.'); return false; }
  if (w) w.location.href = data.signedUrl; else window.location.href = data.signedUrl;
  return true;
}
