import React from 'react';

// Politique de confidentialite (RGPD) - page publique accessible sur /confidentialite
const RESPONSABLE = {
  nom: 'Camping Le Bout du Monde',
  adresse: '2 chemin de Rhodes, 11400 Verdun-en-Lauragais',
  contact: 'dominique@campingleboutdumonde.fr',
};
const MISE_A_JOUR = '5 octobre 2026';

const C = { bg: '#F5F6FA', card: '#FFFFFF', border: '#E5E7EF', text: '#111827', muted: '#6B7280', purple: '#5B4FD6' };
const h2 = { fontSize: '15px', fontWeight: 600, color: C.text, margin: '24px 0 8px' };
const p = { fontSize: '13px', color: C.text, lineHeight: 1.7, margin: '0 0 8px' };
const li = { fontSize: '13px', color: C.text, lineHeight: 1.7 };

export default function Confidentialite() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", padding: '20px', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: '720px' }}>
        <div style={{ textAlign: 'center', margin: '20px 0 24px' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: C.text }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}><span style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'linear-gradient(135deg, #6D5EF0, #4F46E5)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, boxShadow: '0 4px 12px rgba(79,70,229,0.35)' }}>HPA</span><span style={{ letterSpacing: '-0.01em' }}>Planning</span></span></div>
          <div style={{ fontSize: '12px', color: C.muted, marginTop: '6px' }}>Politique de confidentialité · mise à jour le {MISE_A_JOUR}</div>
        </div>

        <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <p style={p}>
            Cette page explique quelles données personnelles sont traitées par l'application Planning HPA,
            pourquoi, combien de temps elles sont conservées et comment exercer vos droits, conformément au
            Règlement général sur la protection des données (RGPD) et à la loi Informatique et Libertés.
          </p>

          <h2 style={h2}>1. Responsable du traitement</h2>
          <p style={p}>{RESPONSABLE.nom}, {RESPONSABLE.adresse}.<br />Contact : <a href={'mailto:' + RESPONSABLE.contact} style={{ color: C.purple }}>{RESPONSABLE.contact}</a></p>

          <h2 style={h2}>2. Données collectées</h2>
          <ul style={{ paddingLeft: '20px', margin: 0 }}>
            <li style={li}><strong>Identité et contact :</strong> nom, prénom, email, téléphone, adresse, date et lieu de naissance, nationalité.</li>
            <li style={li}><strong>Données administratives :</strong> numéro de sécurité sociale, coordonnées bancaires (IBAN), mutuelle, taille de vêtement.</li>
            <li style={li}><strong>Pièces justificatives :</strong> pièce d'identité, RIB, justificatif de domicile, attestation de mutuelle.</li>
            <li style={li}><strong>Vie professionnelle :</strong> poste, service, type de contrat, horaires planifiés, heures travaillées.</li>
            <li style={li}><strong>Pointage :</strong> heures d'arrivée et de départ, et position GPS au seul moment du pointage, afin de vérifier qu'il est effectué sur le site. Aucun suivi de position n'a lieu en dehors du pointage.</li>
            <li style={li}><strong>Compte :</strong> email et mot de passe (le mot de passe est chiffré et n'est jamais visible par l'employeur).</li>
          </ul>

          <h2 style={h2}>3. Finalités et bases légales</h2>
          <ul style={{ paddingLeft: '20px', margin: 0 }}>
            <li style={li}>Constitution du dossier d'embauche et formalités d'embauche : <em>exécution du contrat de travail et obligations légales</em> (déclaration préalable à l'embauche, registre du personnel).</li>
            <li style={li}>Établissement des plannings et décompte du temps de travail : <em>obligation légale</em> (Code du travail, convention collective de l'hôtellerie de plein air).</li>
            <li style={li}>Paie et affiliation à la mutuelle : <em>exécution du contrat et obligations légales</em>.</li>
            <li style={li}>Contrôle du lieu de pointage : <em>intérêt légitime</em> de l'employeur à s'assurer de la fiabilité du décompte des heures.</li>
          </ul>

          <h2 style={h2}>4. Destinataires</h2>
          <p style={p}>
            Les données sont accessibles uniquement à la direction et aux managers habilités. Chaque salarié
            n'a accès qu'à ses propres informations. Elles peuvent être transmises, dans la limite de leurs
            missions, au cabinet comptable ou de paie, à l'organisme de mutuelle et aux administrations
            (URSSAF, inspection du travail) lorsque la loi l'exige.
          </p>

          <h2 style={h2}>5. Hébergement et sous-traitants</h2>
          <ul style={{ paddingLeft: '20px', margin: 0 }}>
            <li style={li}><strong>Supabase</strong> : base de données et stockage des documents, serveurs situés dans l'Union européenne (Paris).</li>
            <li style={li}><strong>Railway</strong> : hébergement de l'application, serveurs situés aux États-Unis. Ce transfert hors de l'Union européenne est encadré par les clauses contractuelles types de la Commission européenne.</li>
            <li style={li}><strong>Resend</strong> : envoi des emails de notification (serveurs en Irlande).</li>
          </ul>

          <h2 style={h2}>6. Durées de conservation</h2>
          <ul style={{ paddingLeft: '20px', margin: 0 }}>
            <li style={li}>Dossier du salarié et pièces justificatives : pendant toute la durée du contrat, puis 5 ans après le départ.</li>
            <li style={li}>Données de pointage et décompte des heures : 1 an, ou 5 ans lorsqu'elles servent au calcul de la paie.</li>
            <li style={li}>Compte d'accès à l'application : supprimé au départ du salarié.</li>
            <li style={li}>Dossier d'un candidat non embauché : supprimé dès que la décision de ne pas embaucher est prise.</li>
          </ul>

          <h2 style={h2}>7. Sécurité</h2>
          <p style={p}>
            Les échanges sont chiffrés (HTTPS). L'accès aux données est protégé par identifiant et mot de passe,
            et cloisonné : un salarié ne peut consulter que ses propres données et documents.
          </p>

          <h2 style={h2}>8. Vos droits</h2>
          <p style={p}>
            Vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation, de portabilité et
            d'opposition sur vos données, dans les limites prévues par la loi (certaines données doivent être
            conservées au titre des obligations légales de l'employeur). Pour exercer ces droits, écrivez à{' '}
            <a href={'mailto:' + RESPONSABLE.contact} style={{ color: C.purple }}>{RESPONSABLE.contact}</a>.
            Une réponse vous sera apportée sous un mois.
          </p>
          <p style={p}>
            Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à la CNIL :{' '}
            <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noreferrer" style={{ color: C.purple }}>www.cnil.fr/fr/plaintes</a>.
          </p>
        </div>

        <div style={{ textAlign: 'center', margin: '20px 0', fontSize: '12px' }}>
          <a href="/" style={{ color: C.purple }}>← Retour à l'application</a>
        </div>
      </div>
    </div>
  );
}
