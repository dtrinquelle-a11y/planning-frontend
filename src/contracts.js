import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { minimumFor, montantEnLettres, SALARY_DEFAULTS } from './ccHpa';

// Edition de contrats : modele Word (.docx) contenant des champs de publipostage «NOM», «PRENOM»... (ou {nom})
// Les champs connus sont remplis avec la fiche du salarie ; les autres sont demandes a l'edition.

export const FIELDS = [
  { group: 'Salarié', key: 'civilite', label: 'Civilité (Madame / Monsieur)' },
  { group: 'Salarié', key: 'prenom', label: 'Prénom' },
  { group: 'Salarié', key: 'nom', label: 'Nom' },
  { group: 'Salarié', key: 'nom_complet', label: 'Prénom et nom' },
  { group: 'Salarié', key: 'date_naissance', label: 'Date de naissance' },
  { group: 'Salarié', key: 'lieu_naissance', label: 'Lieu de naissance' },
  { group: 'Salarié', key: 'nationalite', label: 'Nationalité' },
  { group: 'Salarié', key: 'numero_secu', label: 'N° de sécurité sociale' },
  { group: 'Salarié', key: 'adresse', label: 'Adresse (rue)' },
  { group: 'Salarié', key: 'code_postal', label: 'Code postal' },
  { group: 'Salarié', key: 'ville', label: 'Ville' },
  { group: 'Salarié', key: 'adresse_complete', label: 'Adresse complète' },
  { group: 'Salarié', key: 'email', label: 'Email' },
  { group: 'Salarié', key: 'telephone', label: 'Téléphone' },
  { group: 'Contrat', key: 'poste', label: 'Poste' },
  { group: 'Contrat', key: 'service', label: 'Service' },
  { group: 'Contrat', key: 'type_contrat', label: 'Type de contrat' },
  { group: 'Contrat', key: 'date_debut', label: 'Date de début' },
  { group: 'Contrat', key: 'date_fin', label: 'Date de fin' },
  { group: 'Contrat', key: 'heure_arrivee', label: "Heure d'arrivée (9h00 par défaut)" },
  { group: 'Contrat', key: 'heure_depart', label: 'Heure de départ (17h00 par défaut)' },
  { group: 'Contrat', key: 'heures_hebdo', label: 'Heures par semaine' },
  { group: 'Contrat', key: 'heures_mensuelles', label: 'Heures par mois (×52/12)' },
  { group: 'Contrat', key: 'periode_essai', label: "Période d'essai (15 jours par défaut)" },
  { group: 'Contrat', key: 'taches', label: 'Tâches confiées (une par ligne)' },
  { group: 'Contrat', key: 'logement', label: 'Paragraphe logement (vide si pas de logement)' },
  { group: 'Contrat', key: 'logement_details', label: 'Conditions du logement (texte de la fiche)' },
  { group: 'Classification', key: 'emploi_repere', label: 'Emploi de la grille CC HPA' },
  { group: 'Classification', key: 'categorie', label: 'Catégorie' },
  { group: 'Classification', key: 'coefficient', label: 'Coefficient' },
  { group: 'Classification', key: 'salaire_horaire', label: 'Salaire horaire brut (€)' },
  { group: 'Classification', key: 'salaire_mensuel', label: 'Salaire mensuel brut (€), calculé' },
  { group: 'Classification', key: 'salaire_lettres', label: 'Salaire mensuel brut en toutes lettres' },
  { group: 'Employeur', key: 'employeur_nom', label: "Nom de l'entreprise" },
  { group: 'Employeur', key: 'employeur_adresse', label: "Adresse de l'entreprise" },
  { group: 'Employeur', key: 'employeur_code_postal', label: 'Code postal' },
  { group: 'Employeur', key: 'employeur_ville', label: 'Ville' },
  { group: 'Divers', key: 'date_du_jour', label: "Date d'édition" },
];
// Blocs conditionnels : {#cdd}texte affiché seulement pour un CDD{/cdd}
export const CONDITIONS = [
  { key: 'cdd', label: 'Contrat à durée déterminée (CDD, saisonnier…)' },
  { key: 'cdi', label: 'CDI' },
  { key: 'temps_partiel', label: 'Moins de 35 h par semaine' },
  { key: 'logement', label: "Logement fourni par l'employeur" },
];
// Exemples de champs a completer a l'edition (tout autre nom entre accolades fonctionne)
export const FREE_EXAMPLES = ['motif_cdd', 'lieu_travail', 'prime', 'horaires_type'];

const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const num = n => String(Math.round(n * 100) / 100).replace('.', ',');
const money = n => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Valeurs des champs connus, depuis la fiche, les reponses d'onboarding et les infos du camping
// clause : texte de la clause logement (Parametrage > Logement), sinon LOGEMENT_PHRASE
export function buildValues(emp, responses, camping, cfg = SALARY_DEFAULTS, clause) {
  const r = {};
  (responses || []).forEach(x => { if (x.onboarding_fields?.label) r[x.onboarding_fields.label] = x.value; });
  const hours = parseFloat(emp.contract_hours) || 0;
  const type = (emp.contract_type || '').toLowerCase();
  const adresse = emp.address || r['Adresse'] || '';
  const cp = r['Code postal'] || '', ville = r['Ville'] || '';
  const hourly = parseFloat(emp.salaire_horaire) || 0;
  // Salaire mensuel brut lisse : salaire horaire de la fiche, sinon minimum conventionnel du coefficient (au prorata des heures)
  const coef = parseInt(emp.coefficient, 10) || 0;
  const monthly = hourly && hours ? Math.round(hourly * hours * 52 / 12 * 100) / 100
    : coef >= 100 ? Math.round(minimumFor(coef, cfg).monthly * (hours || 35) / 35 * 100) / 100 : 0;
  const civilite = emp.civilite || r['Civilite'] || '';
  const v = {
    civilite,
    prenom: emp.first_name || '', nom: (emp.last_name || '').toUpperCase(), nom_complet: (emp.first_name || '') + ' ' + (emp.last_name || '').toUpperCase(),
    date_naissance: fr(emp.birth_date || r['Date de naissance']), lieu_naissance: r['Lieu de naissance'] || '', nationalite: r['Nationalite'] || '',
    numero_secu: emp.nss || r['Numero de securite sociale'] || '',
    adresse, code_postal: cp, ville, adresse_complete: [adresse, [cp, ville].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    email: emp.email && !emp.email.endsWith('@temp.fr') ? emp.email : '', telephone: emp.phone || r['Telephone'] || '',
    poste: emp.role || '', service: emp.service || '', type_contrat: emp.contract_type || '',
    date_debut: fr(emp.hire_date), date_fin: fr(emp.contract_end_date),
    heures_hebdo: hours ? num(hours) : '', heures_mensuelles: hours ? num(hours * 52 / 12) : '',
    periode_essai: emp.periode_essai || '15 jours', heure_arrivee: '9h00', heure_depart: '17h00', taches: emp.taches || '', logement_details: emp.logement_details || '',
    emploi_repere: emp.emploi_repere || '', categorie: emp.categorie || '', coefficient: emp.coefficient != null ? String(emp.coefficient) : '',
    salaire_horaire: hourly ? money(hourly) : coef >= 100 ? money(minimumFor(coef, cfg).hourly) : '',
    salaire_mensuel: monthly ? money(monthly) : '', salaire_lettres: monthly ? montantEnLettres(monthly) : '',
    employeur_nom: camping?.name || '', employeur_adresse: camping?.address || '', employeur_code_postal: camping?.postal_code || '', employeur_ville: camping?.city || '',
    date_du_jour: new Date().toLocaleDateString('fr-FR'),
    cdd: type.includes('cdd') || type.includes('saison') || type.includes('extra') || !!emp.contract_end_date,
    cdi: type.includes('cdi'),
    temps_partiel: hours > 0 && hours < 35,
    logement: !!emp.logement,
  };
  // Phrase du logement, utilisee quand le modele contient le champ «LOGEMENT»
  v.logement_texte = emp.logement
    ? [fillClause(clause && clause.trim() ? clause : LOGEMENT_PHRASE, v), emp.logement_details || ''].filter(Boolean).join(' ')
    : '';
  return v;
}

// Clause du logement (champ «LOGEMENT») par defaut ; modifiable dans Parametrage > Logement
export const LOGEMENT_PHRASE = "{civilite} {nom} {prenom} disposera pendant la durée de son contrat d'une chambre individuelle, au sein d'un mobil-home partagé. Une caution est demandée et vous sera restituée 7 jours après la fin de votre contrat, dans le cas où votre logement est restitué, dans un état identique, à celui trouvé lors de votre arrivée. La validation de la caution est suspensive à la remise des clefs.";

// Remplace {civilite} {nom} {prenom} (ou «CIVILITE» «NOM» «PRENOM») dans la clause
export function fillClause(text, v) {
  const map = { civilite: v.civilite, nom: v.nom, prenom: v.prenom };
  return String(text)
    .replace(/\{(civilite|nom|prenom)\}/gi, (_, k) => map[k.toLowerCase()] || '')
    .replace(/«\s*(CIVILITE|NOM|PRENOM)\s*»/gi, (_, k) => map[k.toLowerCase()] || '')
    .replace(/\s{2,}/g, ' ').trim();
}

// Nom de champ -> forme simple : "Date de naissance", «DATE_NAISSANCE», {date_naissance} -> "date_naissance"
export const normalize = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// Autres noms acceptes pour les champs connus (modeles de publipostage existants)
const ALIASES = {
  civilite: ['civ', 'titre', 'madame_monsieur'],
  nom: ['nom_de_famille', 'nom_salarie'],
  prenom: ['prenom_salarie'],
  nom_complet: ['nom_prenom', 'prenom_nom', 'salarie', 'identite'],
  date_naissance: ['date_de_naissance', 'ne_le', 'naissance', 'nele'],
  lieu_naissance: ['lieu_de_naissance', 'ne_a', 'ville_naissance', 'ville_de_naissance'],
  nationalite: ['nationalite_salarie'],
  numero_secu: ['n_secu', 'num_secu', 'no_secu', 'secu', 'securite_sociale', 'numero_securite_sociale', 'n_securite_sociale', 'nss', 'numero_de_securite_sociale'],
  adresse: ['rue', 'adresse_salarie', 'adresse1'],
  code_postal: ['cp', 'codepostal'],
  ville: ['commune', 'localite'],
  adresse_complete: ['adresse_postale'],
  email: ['mail', 'e_mail', 'courriel'],
  telephone: ['tel', 'portable', 'telephone_portable', 'mobile'],
  poste: ['emploi', 'fonction', 'intitule_poste', 'poste_occupe'],
  type_contrat: ['contrat', 'nature_contrat'],
  date_debut: ['arrivee', 'date_arrivee', 'date_d_embauche', 'date_embauche', 'date_entree', 'date_d_entree', 'debut_contrat', 'date_debut_contrat'],
  date_fin: ['depart', 'date_depart', 'date_de_fin', 'fin_contrat', 'date_fin_contrat', 'date_sortie', 'date_de_sortie'],
  heures_hebdo: ['heures', 'duree_hebdo', 'duree_hebdomadaire', 'horaire_hebdo', 'nb_heures', 'heures_semaine'],
  heures_mensuelles: ['heures_mois', 'duree_mensuelle', 'horaire_mensuel'],
  heure_arrivee: ['h_arrivee', 'heure_debut', 'h_debut'],
  heure_depart: ['h_depart', 'heure_fin', 'h_fin'],
  salaire_lettres: ['salaire_brut_2', 'salaire_en_lettres', 'montant_en_lettres', 'salaire_lettre'],
  periode_essai: ['periode_essais', 'essais', 'essai', 'periode_d_essai', 'duree_essai', 'duree_periode_essai'],
  taches: ['missions', 'fonctions', 'attributions', 'taches_confiees'],
  logement_details: ['conditions_logement'],
  emploi_repere: ['emploi_grille', 'emploi_conventionnel'],
  categorie: ['cat'],
  coefficient: ['coef', 'coeff'],
  salaire_horaire: ['taux_horaire', 'taux_horaire_brut', 'salaire_horaire_brut'],
  salaire_mensuel: ['salaire_brut_1', 'salaire', 'salaire_brut', 'salaire_mensuel_brut', 'remuneration', 'remuneration_mensuelle'],
  employeur_nom: ['employeur', 'societe', 'raison_sociale', 'entreprise', 'nom_entreprise'],
  employeur_adresse: ['adresse_employeur', 'adresse_entreprise'],
  employeur_code_postal: ['cp_employeur'],
  employeur_ville: ['ville_employeur'],
  date_du_jour: ['date', 'date_edition', 'aujourd_hui', 'fait_le'],
  logement: ['hebergement'],
  cdd: ['contrat_cdd', 'saisonnier'],
  cdi: ['contrat_cdi'],
  temps_partiel: ['partiel'],
};
const ALIAS_INDEX = {};
Object.entries(ALIASES).forEach(([key, list]) => { ALIAS_INDEX[key] = key; list.forEach(a => { ALIAS_INDEX[a] = key; }); });

// Champ connu correspondant a un nom du modele (sinon null : champ a completer)
export const resolveKey = raw => ALIAS_INDEX[normalize(raw)] || null;

// Champs de publipostage Word (MERGEFIELD) -> texte «NOM», que le moteur sait ensuite remplir
function mergeFieldName(instr) {
  const m = /MERGEFIELD\s+(?:"([^"]+)"|&quot;(.+?)&quot;|([^\s\\]+))/i.exec(instr);
  return m ? (m[1] || m[2] || m[3]) : null;
}
// Reperes internes des champs (caracteres absents des contrats) : seuls les vrais champs y sont convertis
const OPEN = '\u27E6', CLOSE = '\u27E7';
// «NOM» tape a la main : un seul mot, sans espace (une citation « comme ceci » n'est pas un champ)
const TYPED = /«([#^/]?[\p{L}\p{N}_]+)»/gu;
const runText = (rPr, text) => '<w:r>' + rPr + '<w:t xml:space="preserve">' + text + '</w:t></w:r>';
function convertMergeFields(xml) {
  // 1. Champs simples
  xml = xml.replace(/<w:fldSimple\b([^>]*?)(?:\/>|>([\s\S]*?)<\/w:fldSimple>)/g, (all, attrs, inner) => {
    const instr = (/w:instr="([^"]*)"/.exec(attrs) || [])[1] || '';
    const name = mergeFieldName(instr);
    if (!name) return all;
    const rPr = ((inner || '').match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0];
    return runText(rPr, OPEN + name + CLOSE);
  });
  // 2. Champs complexes : debut / instruction / separation / resultat / fin repartis sur plusieurs "runs"
  const runRe = /<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g;
  const runs = [];
  let m;
  while ((m = runRe.exec(xml))) runs.push({ start: m.index, end: m.index + m[0].length, xml: m[0] });
  const edits = [];
  for (let i = 0; i < runs.length; i++) {
    if (!/w:fldCharType="begin"/.test(runs[i].xml)) continue;
    let depth = 0, instr = '', rPr = '', sep = false, j = i;
    for (; j < runs.length; j++) {
      const r = runs[j].xml;
      if (/w:fldCharType="begin"/.test(r)) depth++;
      if (depth === 1 && !sep) { const t = r.match(/<w:instrText[^>]*>([\s\S]*?)<\/w:instrText>/); if (t) instr += t[1]; }
      if (/w:fldCharType="separate"/.test(r) && depth === 1) sep = true;
      else if (sep && depth === 1 && !rPr && /<w:t[ >]/.test(r)) rPr = (r.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0];
      if (/w:fldCharType="end"/.test(r)) { depth--; if (depth === 0) break; }
    }
    if (j >= runs.length) break;
    const name = mergeFieldName(instr);
    if (name) {
      if (!rPr) rPr = (runs[i].xml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0];
      edits.push({ start: runs[i].start, end: runs[j].end, text: runText(rPr, OPEN + name + CLOSE) });
    }
    i = j;
  }
  for (let k = edits.length - 1; k >= 0; k--) xml = xml.slice(0, edits[k].start) + edits[k].text + xml.slice(edits[k].end);
  return xml;
}

// Ouvre le modele : champs Word et «NOM» tapes -> reperes internes ; sinon ecriture {nom}
function openTemplate(arrayBuffer) {
  const zip = new PizZip(arrayBuffer);
  let guillemets = false;
  Object.keys(zip.files).filter(n => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n)).forEach(n => {
    let xml = convertMergeFields(zip.file(n).asText());
    xml = xml.replace(/(<w:t(?:\s[^>]*)?>)([^<]*)(<\/w:t>)/g, (all, o, t, c) => o + t.replace(TYPED, OPEN + '$1' + CLOSE) + c);
    if (xml.includes(OPEN)) guillemets = true;
    zip.file(n, xml);
  });
  const opts = { paragraphLoop: true, linebreaks: true, nullGetter: () => '' };
  if (guillemets) opts.delimiters = { start: OPEN, end: CLOSE };
  return { doc: new Docxtemplater(zip, opts), guillemets };
}

// Champs presents dans le modele (noms tels qu'ecrits) : simples et conditions (#nom ... /nom)
export function inspectTemplate(arrayBuffer) {
  const { doc, guillemets } = openTemplate(arrayBuffer); // leve une erreur si le modele est mal forme
  const text = doc.getFullText();
  const re = guillemets ? /\u27E6\s*([#^/]?)\s*([^\u27E6\u27E7#^/][^\u27E6\u27E7]*?)\s*\u27E7/gu : /\{\s*([#^/]?)\s*([^{}#^/][^{}]*?)\s*\}/gu;
  const simple = new Set(), blocks = new Set();
  for (const mm of text.matchAll(re)) {
    if (mm[1] === '#' || mm[1] === '^') blocks.add(mm[2]); else if (!mm[1]) simple.add(mm[2]);
  }
  // Un nom utilise a la fois comme texte et comme condition reste un texte (la condition suit : texte vide = masque)
  return { fields: [...simple], blocks: [...blocks].filter(b => !simple.has(b)), guillemets };
}

export function renderContract(arrayBuffer, values) {
  const { doc } = openTemplate(arrayBuffer);
  doc.render(values);
  return doc.getZip().generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
}

// Message lisible pour une erreur de modele (accolade oubliee, champ coupe...)
export function templateError(err) {
  const list = err?.properties?.errors;
  if (Array.isArray(list) && list.length) {
    const FR = {
      unclosed_tag: 'accolade fermante } manquante après',
      unopened_tag: 'accolade ouvrante { manquante avant',
      duplicate_open_tag: 'accolade { en double dans',
      duplicate_close_tag: 'accolade } en double dans',
      unclosed_loop: 'paragraphe conditionnel jamais fermé (il manque {/…}) :',
      unopened_loop: 'fermeture {/…} sans ouverture {#…} :',
      closing_tag_does_not_match_opening_tag: 'ouverture et fermeture différentes :',
    };
    return list.slice(0, 3).map(e => {
      const p = e.properties || {};
      const where = p.context || p.xtag || '';
      return FR[p.id] ? FR[p.id] + ' « ' + where + ' »' : (p.explanation || e.message);
    }).join(' · ');
  }
  return err?.message || String(err);
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
