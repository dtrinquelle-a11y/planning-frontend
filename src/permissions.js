import { createContext, useContext } from 'react';

// Roles et droits (Parametrage > Roles et droits). Meme regle que la fonction has_perm de la base :
// admin = tout ; manager = droits de gestion et d'espace personnel (sauf "roles") ; salarie = droits de l'espace salarie.
// Reglage app_settings 'roles_droits' = { manager: { droit: true/false }, salarie: { droit: true/false } }, tout actif par defaut.

export const PERM_GROUPS = [
  {
    id: 'gestion', label: 'Gestion', roles: ['manager'],
    perms: [
      { key: 'dashboard', label: 'Tableau de bord', desc: "Vue d'ensemble et activité du jour" },
      { key: 'planning_voir', label: 'Voir le planning', desc: 'Planning, timeline, espace des salariés' },
      { key: 'planning_modifier', label: 'Modifier et publier le planning', desc: 'Créer, déplacer, supprimer, publier les créneaux, modèles' },
      { key: 'absences', label: "Traiter les demandes d'absence", desc: 'Accepter, refuser, modifier les absences' },
      { key: 'realise', label: 'Réalisé', desc: 'Prévu / réalisé, horaires déclarés, alertes de pointage' },
      { key: 'paie', label: 'Paie', desc: 'Export et validation de la paie, bulletins groupés' },
      { key: 'documents', label: 'Documents', desc: 'Documents des salariés et documents communs' },
      { key: 'dossiers_rh', label: 'Dossiers RH', desc: "Fiches salariés, onboarding, liens d'accès" },
      { key: 'contrats', label: 'Contrats de travail', desc: 'Édition des contrats, modèles, dépôt des contrats signés' },
      { key: 'pointeuse_qr', label: 'QR codes et pointeuse', desc: 'QR codes de pointage et pointeuse partagée' },
      { key: 'parametrage', label: 'Paramétrage', desc: 'Réglages : shifts, camping, CC HPA, congés, pointeuse…' },
      { key: 'sauvegardes', label: 'Sauvegardes', desc: 'Créer et télécharger les sauvegardes des données' },
      { key: 'roles', label: 'Rôles et droits', desc: 'Réservé aux administrateurs', adminOnly: true },
    ],
  },
  {
    id: 'espace', label: 'Espace salarié', roles: ['manager', 'salarie'],
    perms: [
      { key: 'pointeuse', label: 'Pointer', desc: "Pointer son arrivée et son départ" },
      { key: 'mes_horaires', label: 'Valider ses horaires', desc: 'Quand la pointeuse est désactivée' },
      { key: 'absences_demande', label: 'Demander des absences', desc: 'Congés, repos, indisponibilités…' },
      { key: 'mes_documents', label: 'Consulter ses documents', desc: 'Bulletins, contrats, attestations' },
      { key: 'documents_communs', label: 'Documents communs', desc: 'Documents à lire, signer ou consulter' },
      { key: 'mes_heures', label: "Voir son compteur d'heures", desc: 'Heures modulées, récupérations' },
    ],
  },
];
const SALARIE_PERMS = new Set(PERM_GROUPS.find(g => g.id === 'espace').perms.map(p => p.key));

export function canFor(role, settings, key) {
  if (role === 'admin') return true;
  if (role === 'manager') return key !== 'roles' && settings?.manager?.[key] !== false;
  if (role === 'salarie') return SALARIE_PERMS.has(key) && settings?.salarie?.[key] !== false;
  return false;
}

export const PermContext = createContext({ can: () => true, role: null, isAdmin: false });
export const usePerms = () => useContext(PermContext);

// Page de l'application -> droit necessaire (manager)
export const PAGE_PERM = {
  dashboard: ['dashboard'], planning: ['planning_voir'], timeline: ['planning_voir'], absences: ['absences'], realise: ['realise'],
  paie: ['paie'], salarie: ['planning_voir'], qrcode: ['pointeuse_qr'], pointage: ['pointeuse_qr'], ged: ['documents'],
  dossiers: ['dossiers_rh', 'contrats'], parametrage: ['parametrage', 'roles'],
};
