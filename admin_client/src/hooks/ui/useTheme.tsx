import {
  useState,
  useEffect,
  useSyncExternalStore,
  createContext,
  useContext,
} from 'react';
import type { ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    /* localStorage unavailable */
  }
  return 'system';
}

function subscribeSystemTheme(onChange: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  const systemTheme = useSyncExternalStore<'light' | 'dark'>(
    subscribeSystemTheme,
    getSystemTheme,
    () => 'light'
  );

  const resolvedTheme: 'light' | 'dark' =
    theme === 'system' ? systemTheme : theme;

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-theme',
      resolvedTheme === 'dark' ? 'dark' : 'light'
    );
  }, [resolvedTheme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  const toggleTheme = () => {
    if (theme === 'light') {
      setTheme('dark');
    } else if (theme === 'dark') {
      setTheme('light');
    } else {
      setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        setTheme,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

// Hook is intentionally co-located with ThemeProvider for a single import surface.
// eslint-disable-next-line react-refresh/only-export-components -- useTheme is the consumer API for ThemeProvider
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
