
'use client';

import * as React from 'react';
import { themes } from '@/app/settings/themes';

type ThemeName = typeof themes[number]['name'];

type ThemeProviderState = {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
};

const initialState: ThemeProviderState = {
  theme: 'ocean-breeze',
  setTheme: () => null,
};

const ThemeProviderContext = React.createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = 'ocean-breeze',
  storageKey = 'vite-ui-theme',
  ...props
}: {
  children: React.ReactNode;
  defaultTheme?: ThemeName;
  storageKey?: string;
}) {
  const [theme, setTheme] = React.useState<ThemeName>(defaultTheme);

  // Sync theme from localStorage after hydration to avoid SSR mismatch
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored && stored !== theme) {
        setTheme(stored as ThemeName);
      }
    } catch (e) {
      // localStorage unavailable
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const root = window.document.documentElement;
    
    // Remove all theme classes before adding the new one
    for (const t of themes) {
      root.classList.remove(`theme-${t.name}`);
    }

    if (theme) {
      root.classList.add(`theme-${theme}`);
    }

    const selectedTheme = themes.find(t => t.name === theme);
    if (selectedTheme?.gradient) {
        root.style.setProperty('--primary-gradient', selectedTheme.gradient);
    } else {
        root.style.removeProperty('--primary-gradient');
    }


  }, [theme]);

  const value = {
    theme,
    setTheme: (theme: ThemeName) => {
      try {
        localStorage.setItem(storageKey, theme);
      } catch (e) {
        // localStorage is not available
      }
      setTheme(theme);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = React.useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider');

  return context;
};
