import React from 'react';
import supabase from './supabase';
import { countDocsToSign } from './signatures';
import { countPendingDeclarations } from './declarations';

// Pastilles "elements a traiter" (style iPhone) sur les onglets.
// Manager : demandes d'absence en attente, dossiers d'onboarding a valider.
// Salarie : decisions d'absence et documents non encore vus (memorise sur l'appareil).

const seenKey = (kind, empId) => 'planning-hpa:vu:' + kind + ':' + empId;

function getSeen(kind, empId) {
  try { return localStorage.getItem(seenKey(kind, empId)) || '1970-01-01T00:00:00Z'; } catch { return '1970-01-01T00:00:00Z'; }
}

// Marque un onglet comme consulte et previent l'application de recalculer les pastilles
export function markSeen(kind, empId) {
  if (!empId) return;
  try { localStorage.setItem(seenKey(kind, empId), new Date().toISOString()); } catch {}
  window.dispatchEvent(new Event('badges-refresh'));
}

export async function fetchManagerBadges() {
  const [abs, dossiers] = await Promise.all([
    supabase.from('absence_requests').select('id', { count: 'exact', head: true }).eq('status', 'en_attente'),
    supabase.from('employees').select('id', { count: 'exact', head: true })
      .eq('onboarding_completed', true).eq('is_active', false).eq('is_temp', false),
  ]);
  return { absences: abs.count || 0, dossiers: dossiers.count || 0 };
}

export async function fetchEmployeeBadges(empId) {
  if (!empId) return { absences: 0, documents: 0, signer: 0, horaires: 0 };
  const [abs, docs, signer, horaires] = await Promise.all([
    supabase.from('absence_requests').select('id', { count: 'exact', head: true })
      .eq('employee_id', empId).neq('status', 'en_attente').not('decided_at', 'is', null).gt('decided_at', getSeen('absences', empId)),
    supabase.from('documents').select('id', { count: 'exact', head: true })
      .eq('employee_id', empId).gt('created_at', getSeen('documents', empId)),
    countDocsToSign(empId).catch(() => 0),
    countPendingDeclarations(empId).catch(() => 0),
  ]);
  return { absences: abs.count || 0, documents: docs.count || 0, signer, horaires };
}

// Pastille rouge avec le nombre (rien si 0)
export function Badge({ count, style }) {
  if (!count) return null;
  return (
    <span style={{
      position: 'absolute', top: '-6px', right: '-6px', minWidth: '17px', height: '17px', padding: '0 4px',
      borderRadius: '9px', background: '#EF4444', color: '#fff', fontSize: '10px', fontWeight: 700, lineHeight: '17px',
      textAlign: 'center', boxSizing: 'border-box', boxShadow: '0 0 0 2px #fff', fontFamily: 'system-ui, sans-serif', ...style,
    }}>{count > 99 ? '99+' : count}</span>
  );
}
