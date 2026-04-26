import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = safeGetTheme();
    if (stored === 'light' || stored === 'dark') return stored;
    // Check system preference
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    safeSetTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(t => (t === 'light' ? 'dark' : 'light'));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

function safeGetTheme(): Theme | null {
  try {
    return localStorage.getItem('borgee-theme') as Theme | null;
  } catch {
    return null;
  }
}

function safeSetTheme(theme: Theme): void {
  try {
    localStorage.setItem('borgee-theme', theme);
  } catch {
    // Storage can be unavailable in mobile private browsing or embedded views.
  }
}
