import React, { createContext, useContext, useState } from 'react';

const DARK = {
  bg: '#0F1117', card: '#1A1D27', border: '#2A2D3A', borderLight: '#1E2130',
  text: '#E8E6DC', muted: '#6B6E82', purple: '#7C6FCD', green: '#2DB87A',
  amber: '#F5A623', red: '#E85D5D', purpleLight: '#2A1F4A', greenLight: '#1A3A2A',
  amberLight: '#3A2A10', redLight: '#3A1A1A', shadow: 'rgba(0,0,0,0.3)',
};

const LIGHT = {
  bg: '#F4F6FA', card: '#FFFFFF', border: '#E2E5ED', borderLight: '#F0F2F7',
  text: '#1A1D27', muted: '#6B7280', purple: '#6C5FCD', green: '#16A34A',
  amber: '#D97706', red: '#DC2626', purpleLight: '#EEF2FF', greenLight: '#F0FDF4',
  amberLight: '#FFFBEB', redLight: '#FEF2F2', shadow: 'rgba(0,0,0,0.08)',
};

const ThemeContext = createContext({ colors: DARK, darkMode: true, toggle: () => {} });

export function ThemeProvider({ children }) {
  const [darkMode, setDarkMode] = useState(true);
  return (
    <ThemeContext.Provider value={{ colors: darkMode ? DARK : LIGHT, darkMode, toggle: () => setDarkMode(d => !d) }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() { return useContext(ThemeContext); }
export { DARK, LIGHT };
