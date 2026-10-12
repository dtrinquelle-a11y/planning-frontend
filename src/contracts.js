import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

// Edition de contrats : modele Word (.docx) contenant des champs {prenom}, {date_debut}...
// Les champs connus sont remplis avec la fiche du salarie ; les autres sont demandes a l'edition.

export const FIELDS = [
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
  { group: 'Contrat', key: 'heures_hebdo', label: 'Heures par semaine' },
  { group: 'Contrat', key: 'heures_mensuelles', label: 'Heures par mois (×52/12)' },
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
];
// Exemples de champs a completer a l'edition (tout autre nom entre accolades fonctionne)
export const FREE_EXAMPLES = ['salaire_horaire', 'salaire_mensuel', 'coefficient', 'niveau', 'periode_essai', 'motif_cdd', 'lieu_travail'];

const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const num = n => String(Math.round(n * 100) / 100).replace('.', ',');

// Valeurs des champs connus, depuis la fiche, les reponses d'onboarding et les infos du camping
export function buildValues(emp, responses, camping) {
  const r = {};
  (responses || []).forEach(x => { if (x.onboarding_fields?.label) r[x.onboarding_fields.label] = x.value; });
  const hours = parseFloat(emp.contract_hours) || 0;
  const type = (emp.contract_type || '').toLowerCase();
  const adresse = emp.address || r['Adresse'] || '';
  const cp = r['Code postal'] || '', ville = r['Ville'] || '';
  const v = {
    prenom: emp.first_name || '', nom: (emp.last_name || '').toUpperCase(), nom_complet: (emp.first_name || '') + ' ' + (emp.last_name || '').toUpperCase(),
    date_naissance: fr(emp.birth_date || r['Date de naissance']), lieu_naissance: r['Lieu de naissance'] || '', nationalite: r['Nationalite'] || '',
    numero_secu: emp.nss || r['Numero de securite sociale'] || '',
    adresse, code_postal: cp, ville, adresse_complete: [adresse, [cp, ville].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    email: emp.email && !emp.email.endsWith('@temp.fr') ? emp.email : '', telephone: emp.phone || r['Telephone'] || '',
    poste: emp.role || '', service: emp.service || '', type_contrat: emp.contract_type || '',
    date_debut: fr(emp.hire_date), date_fin: fr(emp.contract_end_date),
    heures_hebdo: hours ? num(hours) : '', heures_mensuelles: hours ? num(hours * 52 / 12) : '',
    employeur_nom: camping?.name || '', employeur_adresse: camping?.address || '', employeur_code_postal: camping?.postal_code || '', employeur_ville: camping?.city || '',
    date_du_jour: new Date().toLocaleDateString('fr-FR'),
    cdd: type.includes('cdd') || type.includes('saison') || type.includes('extra') || !!emp.contract_end_date,
    cdi: type.includes('cdi'),
    temps_partiel: hours > 0 && hours < 35,
  };
  return v;
}

const options = { paragraphLoop: true, linebreaks: true, nullGetter: () => '' };

// Champs presents dans le modele : simples ({nom}) et conditions ({#cdd}...{/cdd})
export function inspectTemplate(arrayBuffer) {
  const doc = new Docxtemplater(new PizZip(arrayBuffer), options); // leve une erreur si le modele est mal forme
  const text = doc.getFullText();
  const simple = new Set(), blocks = new Set();
  for (const m of text.matchAll(/\{\s*([#^/]?)\s*([A-Za-z0-9_]+)\s*\}/g)) {
    if (m[1] === '#' || m[1] === '^') blocks.add(m[2]); else if (!m[1]) simple.add(m[2]);
  }
  return { fields: [...simple], blocks: [...blocks] };
}

export function renderContract(arrayBuffer, values) {
  const doc = new Docxtemplater(new PizZip(arrayBuffer), options);
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
