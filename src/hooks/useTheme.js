// InsightIQ — theme hook
import { useState, useEffect } from 'react';

const KEY = 'insightiq.theme';

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark';
    return localStorage.getItem(KEY) || 'dark';
  });

  useEffect(() => {
    localStorage.setItem(KEY, theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  return { theme, setTheme, toggle };
}
