// Controles legaux du planning (Code du travail) pour un salarie, sur une semaine du lundi au dimanche.
// - repos quotidien d'au moins 11 h entre deux journees (L3131-1)
// - au plus 10 h de travail par jour (L3121-18)
// - pause d'au moins 20 min des 6 h de travail (L3121-16)
// - au plus 6 jours travailles par semaine (L3132-1)
// - repos hebdomadaire d'au moins 35 h consecutives (L3132-2)
// - au plus 48 h de travail sur la semaine (L3121-20)
// Les creneaux "repos" sont ignores. Un creneau dont la fin est avant le debut se termine le lendemain.

const DAY_NAMES = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const H = 3600 * 1000;

function toInterval(s) {
  const date = String(s.work_date).slice(0, 10);
  const start = new Date(date + 'T' + String(s.start_time).slice(0, 5) + ':00');
  let end = new Date(date + 'T' + String(s.end_time).slice(0, 5) + ':00');
  if (end <= start) end = new Date(end.getTime() + 24 * H);
  return { date, start, end, breakMin: parseInt(s.break_minutes || 0, 10) || 0 };
}

const dayLabel = iso => { const d = new Date(iso + 'T00:00:00'); return DAY_NAMES[d.getDay()] + ' ' + d.getDate(); };
const fmtH = ms => { const m = Math.round(ms / 60000); return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0'); };

// shifts : creneaux du salarie sur la semaine controlee ET les semaines voisines (pour les repos a cheval)
// weekStart : "AAAA-MM-JJ" (lundi). Renvoie une liste de { code, message }.
export function checkEmployeeWeek(shifts, weekStart) {
  const alerts = [];
  const wStart = new Date(weekStart + 'T00:00:00');
  const wEnd = new Date(wStart.getTime() + 7 * 24 * H);
  const all = shifts
    .filter(s => s.start_time && s.end_time && s.shift_type !== 'repos')
    .map(toInterval)
    .sort((a, b) => a.start - b.start);
  const inWeek = all.filter(i => i.start >= wStart && i.start < wEnd);
  if (!inWeek.length) return alerts;

  // Travail net par jour (pause deduite) et par semaine
  const perDay = {};
  inWeek.forEach(i => { perDay[i.date] = (perDay[i.date] || 0) + Math.max(0, i.end - i.start - i.breakMin * 60000); });
  Object.entries(perDay).forEach(([d, ms]) => {
    if (ms > 10 * H) alerts.push({ code: 'jour10h', message: fmtH(ms) + ' de travail le ' + dayLabel(d) + ' (max 10 h)' });
  });
  const weekMs = Object.values(perDay).reduce((a, b) => a + b, 0);
  if (weekMs > 48 * H) alerts.push({ code: 'semaine48h', message: fmtH(weekMs) + ' sur la semaine (max 48 h)' });

  // Pause : un creneau de plus de 6 h de travail doit comporter au moins 20 min de pause
  inWeek.forEach(i => {
    if (i.end - i.start - i.breakMin * 60000 > 6 * H && i.breakMin < 20)
      alerts.push({ code: 'pause', message: 'Pause de ' + i.breakMin + ' min pour plus de 6 h de travail le ' + dayLabel(i.date) + ' (min 20 min)' });
  });

  // Jours travailles
  const days = Object.keys(perDay).length;
  if (days > 6) alerts.push({ code: 'jours6', message: days + ' jours travailles dans la semaine (max 6)' });

  // Repos quotidien entre deux journees differentes (au moins un des deux creneaux dans la semaine)
  for (let k = 0; k < all.length - 1; k++) {
    const cur = all[k], next = all[k + 1];
    if (next.date === cur.date) continue;
    if (!(inWeek.includes(cur) || inWeek.includes(next))) continue;
    const gap = next.start - cur.end;
    if (gap < 11 * H) alerts.push({ code: 'repos11h', message: 'Repos de ' + fmtH(Math.max(0, gap)) + ' seulement entre le ' + dayLabel(cur.date) + ' et le ' + dayLabel(next.date) + ' (min 11 h)' });
  }

  // Repos hebdomadaire : au moins un intervalle sans travail de 35 h qui touche la semaine
  // (bornes : avant le premier creneau connu et apres le dernier, on considere une periode libre)
  const bounds = [{ end: new Date(wStart.getTime() - 7 * 24 * H) }, ...all, { start: new Date(wEnd.getTime() + 7 * 24 * H) }];
  let hasWeeklyRest = false;
  for (let k = 0; k < bounds.length - 1; k++) {
    const gStart = bounds[k].end, gEnd = bounds[k + 1].start;
    if (gEnd - gStart >= 35 * H && gStart < wEnd && gEnd > wStart) { hasWeeklyRest = true; break; }
  }
  if (!hasWeeklyRest) alerts.push({ code: 'repos35h', message: 'Pas de repos hebdomadaire de 35 h consecutives' });

  return alerts;
}
