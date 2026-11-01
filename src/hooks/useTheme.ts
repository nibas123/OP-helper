import { useState, useEffect } from 'react';

export function useTheme() {
  const [theme, setThemeState] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['op_theme'], (res) => {
        if (res.op_theme === 'light' || res.op_theme === 'dark') {
          setThemeState(res.op_theme);
        }
      });

      const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
        if (changes.op_theme && (changes.op_theme.newValue === 'light' || changes.op_theme.newValue === 'dark')) {
          setThemeState(changes.op_theme.newValue);
        }
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const setTheme = (newTheme: 'light' | 'dark') => {
    setThemeState(newTheme);
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ op_theme: newTheme });
    }
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return { theme, toggleTheme };
}
