import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

export const SUPABASE_URL = 'https://akulbjtaflucxkuwptjv.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrdWxianRhZmx1Y3hrdXdwdGp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTQ1MjAsImV4cCI6MjA5NDY5MDUyMH0.bmG_qktEnmerg_pXp8PqLnMn2Z2EvKX5VTfaYAxEaSg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Chaque appel au backend porte le jeton de connexion : le backend verifie qui appelle et filtre selon le role
const BACKEND_URL = 'https://mon-planning-production.up.railway.app';
axios.interceptors.request.use(async config => {
  if (config.url && config.url.startsWith(BACKEND_URL)) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) config.headers.Authorization = 'Bearer ' + token;
  }
  return config;
});

export default supabase;
