// Configuration centrale de l'application : adresses du serveur et de la base.
// En cas de changement d'hebergeur, il suffit de definir ces variables (Railway > planning-frontend > Variables)
// ou de modifier les valeurs par defaut ci-dessous. Aucune autre modification du code n'est necessaire.

// Serveur (backend Express)
export const BACKEND_URL = (process.env.REACT_APP_API_URL || 'https://mon-planning-production.up.railway.app').replace(/\/$/, '');
export const API = BACKEND_URL + '/api';

// Base de donnees et comptes (Supabase) : URL du projet et cle publique
export const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || 'https://akulbjtaflucxkuwptjv.supabase.co';
export const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrdWxianRhZmx1Y3hrdXdwdGp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTQ1MjAsImV4cCI6MjA5NDY5MDUyMH0.bmG_qktEnmerg_pXp8PqLnMn2Z2EvKX5VTfaYAxEaSg';
