import React from 'react';
import { useTheme } from './ThemeContext';

// Logo du camping Le Bout du Monde (version blanche en mode sombre)
export default function CampLogo({ height = 28, style }) {
  const { darkMode } = useTheme();
  return (
    <img src={darkMode ? '/logo-bout-du-monde-blanc.png' : '/logo-bout-du-monde.png'} alt="Le Bout du Monde"
      style={{ height, width: 'auto', display: 'block', ...style }} />
  );
}
