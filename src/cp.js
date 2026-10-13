// Suivi des conges payes (estimation ; seul le bulletin de paie fait foi)
// - Acquisition : 2,5 jours ouvrables par mois (prorata des jours du mois), 30 jours maximum par periode
//   - conge sans solde : pas d'acquisition ; arret maladie : 2 jours par mois (loi du 22 avril 2024)
// - Periode de reference : 1er juin - 31 mai. Au 1er juin, les jours acquis (N) passent en N-1 (a prendre)
// - Jours pris : conges payes acceptes, en jours ouvrables (lundi-samedi hors jours feries),
//   decomptes d'abord sur N-1 puis sur N
// - CDI : on part d'un solde repris sur un bulletin (date + N-1 + N) ; saisonniers et CDD : depuis l'embauche

const D = iso => new Date(iso + 'T00:00:00Z');
const iso = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const day10 = v => (v ? String(v).slice(0, 10) : null);

// Jours feries francais (Paques par l'algorithme de Meeus)
const holidayCache = {};
export function holidays(year) {
  if (holidayCache[year]) return holidayCache[year];
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), dd = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = D(year + '-' + String(month).padStart(2, '0') + '-' + String(dd).padStart(2, '0'));
  return (holidayCache[year] = new Set([
    year + '-01-01', iso(addDays(easter, 1)), year + '-05-01', year + '-05-08', iso(addDays(easter, 39)),
    iso(addDays(easter, 50)), year + '-07-14', year + '-08-15', year + '-11-01', year + '-11-11', year + '-12-25',
  ]));
}
const isOuvrable = d => d.getUTCDay() !== 0 && !holidays(d.getUTCFullYear()).has(iso(d));

export const isCdi = e => /cdi/i.test(e.contract_type || '');

// Debut de la periode de reference contenant la date (1er juin)
export const periodStart = isoDate => { const y = +isoDate.slice(0, 4); return (isoDate.slice(5) >= '06-01' ? y : y - 1) + '-06-01'; };

/**
 * Calcule le compteur d'un salarie.
 * @param emp  fiche (hire_date, contract_end_date, contract_type, cp_init_date, cp_init_n1, cp_init_n)
 * @param abs  absences du salarie (type, status, start_date, end_date)
 * @param today AAAA-MM-JJ
 * @returns null si le compteur ne peut pas etre calcule (CDI non initialise, pas de date d'embauche)
 */
export function computeCP(emp, abs, today) {
  const hire = day10(emp.hire_date), init = day10(emp.cp_init_date);
  if (isCdi(emp) && !init) return { needsInit: true };
  // Solde repris "au" jour du bulletin : le calcul reprend le lendemain
  const start = init ? iso(addDays(D(init), 1)) : hire;
  if (!start) return { needsInit: true };
  const endContract = day10(emp.contract_end_date);
  const accrueUntil = endContract && endContract < today ? endContract : today;

  let n1 = init ? parseFloat(emp.cp_init_n1) || 0 : 0;
  let n = init ? parseFloat(emp.cp_init_n) || 0 : 0;
  let acquisPeriode = n; // pour le plafond de 30 jours
  let pris = 0, prisPeriode = 0, reliquat = 0;
  const accepted = (abs || []).filter(a => a.status === 'acceptee');
  const typeOn = {};
  accepted.forEach(a => {
    for (let d = D(day10(a.start_date)); iso(d) <= day10(a.end_date); d = addDays(d, 1)) {
      const k = iso(d);
      // Un conge paye l'emporte sur un autre type le meme jour
      if (!typeOn[k] || a.type === 'conge_paye') typeOn[k] = a.type;
    }
  });

  const curPeriod = periodStart(today);
  // Jour par jour : acquisition (prorata du mois), bascule au 1er juin, jours pris
  for (let d = D(start); iso(d) <= today; d = addDays(d, 1)) {
    const k = iso(d);
    // Au 1er juin : N passe en N-1 ; un reste de l'ancien N-1 non pris au 31 mai est signale (report ou perte a decider)
    if (k.slice(5) === '06-01') { reliquat = n1 > 0.01 ? n1 : 0; n1 += n; n = 0; acquisPeriode = 0; }
    if (k <= accrueUntil && (!hire || k >= hire)) {
      const monthDays = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      const t = typeOn[k];
      const rate = t === 'sans_solde' ? 0 : t === 'maladie' ? 2 : 2.5;
      const add = Math.min(rate / monthDays, Math.max(0, 30 - acquisPeriode));
      n += add; acquisPeriode += add;
    }
    if (typeOn[k] === 'conge_paye' && isOuvrable(d)) {
      if (n1 > 0) n1 -= 1; else n -= 1;
      pris += 1; if (k >= curPeriod) prisPeriode += 1;
    }
  }
  // Conges deja poses apres aujourd'hui
  let aVenir = 0;
  accepted.filter(a => a.type === 'conge_paye' && day10(a.end_date) > today).forEach(a => {
    for (let d = D(day10(a.start_date) > today ? day10(a.start_date) : iso(addDays(D(today), 1))); iso(d) <= day10(a.end_date); d = addDays(d, 1)) {
      if (isOuvrable(d)) aVenir += 1;
    }
  });
  const r2 = x => Math.round(x * 100) / 100;
  return {
    needsInit: false, depuis: init || start, n1: r2(n1), n: r2(n), solde: r2(n1 + n),
    pris, prisPeriode, aVenir, apresPoses: r2(n1 + n - aVenir), reliquat: r2(reliquat),
    finContrat: endContract && endContract <= today ? endContract : null,
  };
}

// 12,5 -> "12,5 j"
export const fmtJ = x => (x === null || x === undefined ? '—' : (Math.round(x * 10) / 10).toLocaleString('fr-FR') + ' j');
