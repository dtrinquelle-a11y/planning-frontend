// Convention collective nationale de l'hotellerie de plein air (IDCC 1631)
// - Classification : accord de revision de la grille du 22 mai 2025 (en vigueur au 1er jour du mois suivant son arrete d'extension)
// - Salaires minima : avenant n° 47 du 28 janvier 2026 : coefficient 100 = 1 858,92 € pour 151,67 h, puis 5,63 € par point
// Les valeurs de salaire sont modifiables dans Parametrage > CC HPA (a mettre a jour a chaque nouvel avenant).

export const SALARY_DEFAULTS = { salaire_base: 1858.92, valeur_point: 5.63, avenant: 'Avenant n° 47 du 28 janvier 2026', smic_horaire: '' };

export const CATEGORIES = {
  1: 'Ouvriers et employés – 1re catégorie',
  2: 'Ouvriers et employés – 2e catégorie',
  3: 'Ouvriers et employés – 3e catégorie',
  4: 'Agents de maîtrise et techniciens',
  5: 'Cadres non dirigeants',
  6: 'Cadres dirigeants',
};

// Emplois repères de la grille : coefficient minimum et maximum a l'embauche
export const GRID = [
  { cat: 1, emploi: "Personnel d'accueil sans tâche administrative / Placeur", min: 100, max: 120, def: 'Poste sans formation ni spécialisation, sous le contrôle d’un supérieur.' },
  { cat: 1, emploi: 'Homme / femme toutes mains', min: 105, max: 120, def: 'Entretien général, petits travaux d’entretien et de réparation.' },
  { cat: 1, emploi: 'Agent de propreté ou de nettoyage', min: 105, max: 120, def: 'Nettoyage des locatifs et parties communes selon la charte qualité.' },
  { cat: 1, emploi: "Agent d'accueil et de prévention", min: 105, max: 120, def: 'Renseigne la clientèle hors heures de réception, fait appliquer le règlement, consignes de nuit.' },
  { cat: 1, emploi: "Surveillant d'espace aquatique", min: 105, max: 120, def: 'Prévention des risques liés à l’espace aquatique (hors baignade), peut être titulaire du SEA.' },
  { cat: 2, emploi: 'Employé(e) bar, restauration, commerces ou services annexes', min: 110, max: 140, def: 'Service, débarrassage, aide en cuisine, mise en rayon, participation aux stocks.' },
  { cat: 2, emploi: "Agent d'accueil", min: 110, max: 140, def: 'Accueil, inscriptions, attribution des emplacements, encaissement, états des lieux.' },
  { cat: 2, emploi: 'Surveillant de baignade', min: 110, max: 140, def: 'Surveillance des piscines d’accès gratuit (BNSSA et/ou brevet de surveillant de baignade).' },
  { cat: 2, emploi: 'Agent de maintenance', min: 110, max: 140, def: 'Maintenance courante des bâtiments, hébergements, espaces extérieurs.' },
  { cat: 2, emploi: 'Agent de propreté ou de nettoyage (expérimenté)', min: 110, max: 140, def: 'Expérience ou formations complémentaires à la 1re catégorie.' },
  { cat: 3, emploi: 'Assistant(e) administratif(ive)', min: 120, max: 180, def: 'Caisses, classement, correspondance, réservations, comptabilité courante, paie.' },
  { cat: 3, emploi: 'Employé(e) qualifié(e) bar-restauration, commerces ou services annexes', min: 120, max: 180, def: 'Commandes, encaissements, responsable de la caisse et des stocks, coordination possible.' },
  { cat: 3, emploi: 'Animateur', min: 130, max: 180, def: 'Prépare et anime les activités en journée et/ou en soirée, participe au programme.' },
  { cat: 3, emploi: 'Agent de cuisine', min: 130, max: 180, def: 'Préparation des repas, restauration simple ou rapide, stocks, hygiène.' },
  { cat: 3, emploi: 'Agent de maintenance qualifié(e)', min: 130, max: 180, def: 'CQP Agent qualifié de maintenance HPA ou équivalent, habilitations.' },
  { cat: 3, emploi: "Agent d'accueil multilingue", min: 140, max: 180, def: 'Au moins deux langues étrangères (niveau B2), réservations et réclamations.' },
  { cat: 3, emploi: 'Maître-nageur', min: 140, max: 180, def: 'MNS, BEESAN ou BPJEPS activités nautiques ; surveillance et traitement de l’eau.' },
  { cat: 3, emploi: 'Agent de sécurité habilité(e)', min: 140, max: 180, def: 'Carte professionnelle de sécurité ; rondes, contrôle des accès, main courante.' },
  { cat: 4, emploi: 'Agent de maîtrise / Technicien – 1er échelon', min: 170, max: 210, def: 'CAP, BEP, bac pro ou expérience ; initiative sans la totale maîtrise du métier. Ex. : responsable technique, gouvernant(e), chef de cuisine, responsable animation…' },
  { cat: 4, emploi: 'Agent de maîtrise / Technicien expérimenté – 2e échelon', min: 190, max: 210, def: 'Totale maîtrise du métier, responsabilité d’un ou plusieurs services.' },
  { cat: 5, emploi: 'Cadre – Position 1 (engagé)', min: 210, max: 400, def: 'Fonctions de cadre administratif, commercial, technicien ou opérationnel.' },
  { cat: 5, emploi: 'Cadre – Position 2 (confirmé)', min: 230, max: 400, def: 'Encadrement, prévisions, contrôle d’activité ; forfait annuel possible à partir du coefficient 230.' },
  { cat: 5, emploi: 'Cadre – Position 3 (directeur de camping opérationnel)', min: 250, max: 400, def: 'Gère l’ensemble des services, délégation de pouvoirs étendue.' },
  { cat: 6, emploi: 'Cadre dirigeant (directeur d’entreprise ou d’établissement)', min: 250, max: 700, def: 'Au sens de l’article L. 3111-2 du code du travail ; délégation de pouvoirs.' },
];

const round2 = n => Math.round(n * 100) / 100;
export const eur = n => (n == null || isNaN(n) ? '' : n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €');

// Salaire minimum conventionnel mensuel (151,67 h) et horaire pour un coefficient
export function minimumFor(coef, cfg = SALARY_DEFAULTS) {
  const base = parseFloat(cfg.salaire_base) || SALARY_DEFAULTS.salaire_base;
  const point = parseFloat(cfg.valeur_point) || SALARY_DEFAULTS.valeur_point;
  const monthly = round2(base + (Math.max(100, coef) - 100) * point);
  const hourly = round2(monthly / 151.67);
  const smic = parseFloat(String(cfg.smic_horaire || '').replace(',', '.'));
  return { monthly, hourly, belowSmic: smic > 0 && hourly < smic, smic: smic > 0 ? smic : null };
}

// Salaire mensuel pour un horaire hebdomadaire donne (mensualisation 52/12)
export const monthlyFor = (hourly, weeklyHours) => round2(hourly * (parseFloat(weeklyHours) || 35) * 52 / 12);

// Duree maximale de la periode d'essai d'apres le code du travail (la convention ou le contrat peuvent prevoir moins)
export function suggestTrial({ contractType, start, end, cat }) {
  const t = (contractType || '').toLowerCase();
  const isCdd = !!end || /cdd|saison|extra/.test(t);
  if (isCdd) {
    if (!start || !end) return { text: '1 jour par semaine de contrat (2 semaines maximum si le contrat dure 6 mois ou moins)', rule: 'CDD : art. L. 1242-10 du code du travail' };
    const days = Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
    const weeks = Math.max(1, Math.floor(days / 7)); // semaines completes de contrat
    const sixMonths = new Date(start); sixMonths.setMonth(sixMonths.getMonth() + 6);
    const cap = new Date(end) <= sixMonths ? 14 : 31;
    const trial = Math.min(weeks, cap);
    return { text: trial === 31 ? '1 mois' : trial + ' jour' + (trial > 1 ? 's' : ''), rule: 'CDD de ' + weeks + ' semaine(s) : 1 jour par semaine, ' + (cap === 14 ? '2 semaines' : '1 mois') + ' maximum (art. L. 1242-10)' };
  }
  const months = cat >= 5 ? 4 : cat === 4 ? 3 : 2;
  return { text: months + ' mois', rule: 'CDI, ' + (cat >= 5 ? 'cadre' : cat === 4 ? 'agent de maîtrise / technicien' : 'ouvrier / employé') + ' : durée maximale légale (art. L. 1221-19), renouvellement seulement si un accord de branche étendu le prévoit' };
}
