import { useEffect, useState } from 'react';

// Ecran de telephone (largeur <= 700 px) : affichage simplifie a gros boutons pour les salaries
const QUERY = '(max-width: 700px)';
export const isMobileNow = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches;

export default function useIsMobile() {
  const [mobile, setMobile] = useState(isMobileNow);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(QUERY);
    const onChange = () => setMobile(mq.matches);
    if (mq.addEventListener) mq.addEventListener('change', onChange); else mq.addListener(onChange);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', onChange); else mq.removeListener(onChange); };
  }, []);
  return mobile;
}
