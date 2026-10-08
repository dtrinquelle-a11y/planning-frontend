import React, { createContext, useContext, useState } from 'react';

const DARK = {
  bg: '#0B0D12', card: '#151821', border: '#262A36', borderLight: '#1C1F2A',
  text: '#E5E7EB', muted: '#8B90A0', purple: '#8B80F0', green: '#34D399',
  amber: '#FBBF24', red: '#F87171', purpleLight: '#24204A', greenLight: '#0F2E24',
  amberLight: '#33270C', redLight: '#3A1717', shadow: 'rgba(0,0,0,0.35)',
};

const LIGHT = {
  bg: '#F5F6FA', card: '#FFFFFF', border: '#E5E7EF', borderLight: '#EEF0F5',
  text: '#111827', muted: '#6B7280', purple: '#5B4FD6', green: '#16A34A',
  amber: '#D97706', red: '#DC2626', purpleLight: '#EEF0FF', greenLight: '#ECFDF3',
  amberLight: '#FFF8EB', redLight: '#FEF2F2', shadow: 'rgba(17,24,39,0.06)',
};

const ThemeContext = createContext({ colors: DARK, darkMode: true, toggle: () => {} });

export function ThemeProvider({ children }) {
  const [darkMode, setDarkMode] = useState(false);
  return (
    <ThemeContext.Provider value={{ colors: darkMode ? DARK : LIGHT, darkMode, toggle: () => setDarkMode(d => !d) }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() { return useContext(ThemeContext); }
export { DARK, LIGHT };
