import axios from 'axios';
import { API } from './config';

// Libelle de la question d'onboarding (table onboarding_fields)
export const LOGEMENT_QUESTION = 'Logement souhaite et valide avec la direction';

// Envoie au salarie loge l'email avec le lien de paiement de la caution (Parametrage > Logement)
// -> { ok: true, at, to } ou { ok: false, error }
export async function sendCautionEmail(empId) {
  try {
    const { data } = await axios.post(API + '/employees/' + empId + '/caution-email');
    return { ok: true, at: data.at, to: data.to };
  } catch (err) {
    return { ok: false, error: err.response?.data?.error || err.message };
  }
}
