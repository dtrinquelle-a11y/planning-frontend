import supabase from './supabase';

// Consignes par service (hors saison) : recurrentes (jour de semaine) et ponctuelles (date), actives par interrupteur
export const SERVICES = ['Accueil', 'Housekeeping', 'Technique', 'Restauration', 'Animation', 'Managers'];
export const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

// Interrupteur + consignes recurrentes + consignes ponctuelles de la periode
export async function fetchConsignes(fromIso, toIso) {
  const [s, rec, pon] = await Promise.all([
    supabase.from('app_settings').select('value').eq('key', 'consignes').maybeSingle(),
    supabase.from('consignes').select('*').not('weekday', 'is', null),
    supabase.from('consignes').select('*').gte('day', fromIso).lte('day', toIso),
  ]);
  return { actif: !!s.data?.value?.actif, list: [...(rec.data || []), ...(pon.data || [])] };
}

// Consignes d'un jour pour des services (une consigne "Tous" concerne tout le monde)
export function consignesFor(list, iso, services) {
  const d = new Date(iso + 'T12:00:00');
  const wd = ((d.getDay() + 6) % 7) + 1;
  return list.filter(c => (c.service === 'Tous' || services.includes(c.service)) && (c.day ? String(c.day).slice(0, 10) === iso : c.weekday === wd));
}

export const servicesOf = emp => [emp?.service, ...String(emp?.services_secondaires || '').split(',').map(s => s.trim())].filter(Boolean);
