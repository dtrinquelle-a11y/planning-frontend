// Types d'absence (memes valeurs que la table absence_requests) et utilitaires d'affichage
export const ABSENCE_TYPES = [
  { id: 'conge_paye', label: 'Congés payés', short: 'CP', color: '#2563EB', bg: '#EFF6FF' },
  { id: 'repos', label: 'Repos / récupération', short: 'Repos', color: '#0D9488', bg: '#F0FDFA' },
  { id: 'indisponibilite', label: 'Indisponibilité', short: 'Indispo', color: '#7C3AED', bg: '#F5F3FF' },
  { id: 'maladie', label: 'Arrêt maladie', short: 'Maladie', color: '#DC2626', bg: '#FEF2F2' },
  { id: 'sans_solde', label: 'Congé sans solde', short: 'Sans solde', color: '#B45309', bg: '#FFFBEB' },
  { id: 'autre', label: 'Autre absence', short: 'Absence', color: '#4B5563', bg: '#F3F4F6' },
];

export const ABSENCE_STATUS = {
  en_attente: { label: 'En attente', color: '#D97706', bg: '#FFFBEB' },
  acceptee: { label: 'Acceptée', color: '#16A34A', bg: '#F0FDF4' },
  refusee: { label: 'Refusée', color: '#DC2626', bg: '#FEF2F2' },
  annulee: { label: 'Annulée', color: '#6B7280', bg: '#F3F4F6' },
};

export const absenceType = id => ABSENCE_TYPES.find(t => t.id === id) || ABSENCE_TYPES[ABSENCE_TYPES.length - 1];

// "2026-10-20" -> "20/10/2026"
export const frDate = iso => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');

export function absencePeriod(a) {
  return a.start_date === a.end_date ? 'Le ' + frDate(a.start_date) : 'Du ' + frDate(a.start_date) + ' au ' + frDate(a.end_date);
}

// Nombre de jours calendaires (bornes incluses)
export function absenceDays(a) {
  const s = new Date(String(a.start_date).slice(0, 10) + 'T00:00:00');
  const e = new Date(String(a.end_date).slice(0, 10) + 'T00:00:00');
  return Math.round((e - s) / 86400000) + 1;
}

// L'absence couvre-t-elle cette date (AAAA-MM-JJ) ?
export const absenceCovers = (a, date) => String(a.start_date).slice(0, 10) <= date && date <= String(a.end_date).slice(0, 10);
