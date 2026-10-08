import supabase from './supabase';

// Mode "pointeuse desactivee" : le salarie valide ses horaires (table work_declarations, fonction declare_work)

export const NON_WORK = ['repos', 'recup', 'off'];

export const DECL_STATUS = {
  conforme: { label: 'Validé', color: '#16A34A', bg: '#F0FDF4' },
  modifie: { label: 'Validé (modifié)', color: '#6C5FCD', bg: '#EEF2FF' },
  non_travaille: { label: 'Non travaillé', color: '#DC2626', bg: '#FEF2F2' },
  auto: { label: 'Prévu retenu (non validé)', color: '#D97706', bg: '#FFFBEB' },
};

const pad = n => String(n).padStart(2, '0');
export const isoDay = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const hm = t => (t ? String(t).slice(0, 5) : '');

// Lundi de la semaine d'une date AAAA-MM-JJ
export function mondayOf(iso) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

// Cloture : lundi 12 h qui suit la semaine du creneau (meme regle que la base)
export function lockAt(iso) {
  const d = mondayOf(iso);
  d.setDate(d.getDate() + 7); d.setHours(12, 0, 0, 0);
  return d;
}

// Fin reelle du creneau (apres minuit si la fin est avant le debut)
export function shiftEnd(s) {
  const end = new Date(String(s.work_date).slice(0, 10) + 'T' + hm(s.end_time) + ':00');
  if (hm(s.end_time) <= hm(s.start_time)) end.setDate(end.getDate() + 1);
  return end;
}

// Le salarie peut repondre a partir de 30 min avant la fin du creneau, jusqu'a la cloture
export const canAnswer = (s, now = new Date()) => now >= new Date(shiftEnd(s).getTime() - 30 * 60000) && now < lockAt(String(s.work_date).slice(0, 10));

// Absence acceptee couvrant ce jour : pas d'horaires a valider
export const absentOn = (absences, iso) => (absences || []).some(a => String(a.start_date).slice(0, 10) <= iso && iso <= String(a.end_date).slice(0, 10));

// Pointeuse active ? (reglage Parametrage > Pointeuse, active par defaut)
export async function fetchTimeclockEnabled() {
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'pointeuse').maybeSingle();
  return data?.value?.enabled !== false;
}

// Creneaux termines, non valides et non clotures (pastilles)
export async function countPendingDeclarations(empId) {
  if (!empId || await fetchTimeclockEnabled()) return 0;
  const from = new Date(); from.setDate(from.getDate() - 14);
  const [sh, dc, ab] = await Promise.all([
    supabase.from('schedules').select('id, work_date, start_time, end_time, shift_type').eq('employee_id', empId)
      .gte('work_date', isoDay(from)).lte('work_date', isoDay(new Date())),
    supabase.from('work_declarations').select('schedule_id').eq('employee_id', empId).gte('work_date', isoDay(from)),
    supabase.from('absence_requests').select('start_date, end_date').eq('employee_id', empId).eq('status', 'acceptee').gte('end_date', isoDay(from)),
  ]);
  const done = new Set((dc.data || []).map(d => d.schedule_id));
  return (sh.data || []).filter(s => !NON_WORK.includes(s.shift_type) && !done.has(s.id) && canAnswer(s)
    && !absentOn(ab.data, String(s.work_date).slice(0, 10))).length;
}
