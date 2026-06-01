import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://akulbjtaflucxkuwptjv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrdWxianRhZmx1Y3hrdXdwdGp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTQ1MjAsImV4cCI6MjA5NDY5MDUyMH0.bmG_qktEnmerg_pXp8PqLnMn2Z2EvKX5VTfaYAxEaSg'
);

export default supabase;
