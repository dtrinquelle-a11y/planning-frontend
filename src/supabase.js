import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

export const SUPABASE_URL = 'https://akulbjtaflucxkuwptjv.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrdWxianRhZmx1Y3hrdXdwdGp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTQ1MjAsImV4cCI6MjA5NDY5MDUyMH0.bmG_qktEnmerg_pXp8PqLnMn2Z2EvKX5VTfaYAxEaSg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Chaque appel au backend porte le jeton de connexion : le backend verifie qui appelle et filtre selon le role
const BACKEND_URL = 'https://mon-planning-production.up.railway.app';
// Un seul renouvellement de session a la fois, meme si plusieurs requetes echouent en meme temps
let refreshing = null;
function refreshSession() {
  if (!refreshing) refreshing = supabase.auth.refreshSession().finally(() => { refreshing = null; });
  return refreshing;
}

axios.interceptors.request.use(async config => {
  if (config.url && config.url.startsWith(BACKEND_URL)) {
    let { data } = await supabase.auth.getSession();
    // Jeton expire ou sur le point de l'etre (ex : onglet mis en veille sur mobile) : on le renouvelle avant l'appel
    if (data.session && data.session.expires_at * 1000 - Date.now() < 60 * 1000) {
      ({ data } = await refreshSession());
    }
    const token = data.session?.access_token;
    if (token) config.headers.Authorization = 'Bearer ' + token;
  }
  return config;
});

// Refus "non authentifie" du backend : on renouvelle la session et on relance une fois la requete ;
// si le renouvellement echoue, deconnexion propre (retour a l'ecran de connexion)
axios.interceptors.response.use(undefined, async error => {
  const config = error.config;
  if (error.response?.status === 401 && config && !config._retried && config.url?.startsWith(BACKEND_URL)) {
    config._retried = true;
    const { data } = await refreshSession().catch(() => ({ data: {} }));
    if (data?.session?.access_token) {
      config.headers.Authorization = 'Bearer ' + data.session.access_token;
      return axios(config);
    }
    await supabase.auth.signOut();
  }
  return Promise.reject(error);
});

export default supabase;
