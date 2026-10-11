import axios from 'axios';
import supabase from './supabase';
import { API } from './config';

// Notifications sur le telephone (Web Push) : abonnement de l'appareil

export const isSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// Application ajoutee a l'ecran d'accueil (obligatoire sur iPhone pour recevoir des notifications)
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = window.atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on'
export async function notifStatus() {
  if (!isSupported()) return isIOS() && !isStandalone() ? 'ios-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
  } catch { return 'off'; }
}

// A appeler depuis un clic (exige par les navigateurs, en particulier sur iPhone)
export async function enableNotifications() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'denied' : 'Autorisation non accordée');
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/service-worker.js'));
  await navigator.serviceWorker.ready;
  const { data } = await axios.get(API + '/push/public-key');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(data.key) });
  const json = sub.toJSON();
  const { error } = await supabase.rpc('save_push_subscription', { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth, p_user_agent: navigator.userAgent });
  if (error) throw error;
  axios.post(API + '/push/test').catch(() => {}); // notification d'essai
}

export async function disableNotifications() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && await reg.pushManager.getSubscription();
  if (sub) {
    await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
}
