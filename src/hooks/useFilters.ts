import { useState, useEffect, useCallback } from 'react';

export interface FilterState {
  searchQuery: string;
  project: string[];
  type: string[];
  status: string[];
  assignee: string[];
  dateMode: string;
}

export interface SavedFilter {
  id: string;
  name: string;
  state: FilterState;
}

const DEFAULT_STATE: FilterState = {
  searchQuery: '',
  project: [],
  type: [],
  status: [],
  assignee: [],
  dateMode: 'any',
};

export function useFilters() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_STATE);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load state and saved filters on mount
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['op_dashboard_filters'], (res) => {
        if (res.op_dashboard_filters) {
          setFilters(res.op_dashboard_filters as FilterState);
        }
        setIsLoaded(true);
      });

      chrome.storage.sync.get(['op_saved_filters'], (res) => {
        if (res.op_saved_filters) {
          setSavedFilters(res.op_saved_filters as SavedFilter[]);
        }
      });
    } else {
      setIsLoaded(true);
    }
  }, []);

  // Save state whenever it changes
  useEffect(() => {
    if (!isLoaded) return;
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ op_dashboard_filters: filters });
    }
  }, [filters, isLoaded]);

  const updateFilter = useCallback(<K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const saveCurrentFilter = useCallback((name: string) => {
    const newFilter: SavedFilter = {
      id: Date.now().toString(),
      name,
      state: { ...filters },
    };
    
    setSavedFilters(prev => {
      const next = [...prev, newFilter];
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.sync.set({ op_saved_filters: next });
      }
      return next;
    });
  }, [filters]);

  const deleteSavedFilter = useCallback((id: string) => {
    setSavedFilters(prev => {
      const next = prev.filter(f => f.id !== id);
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.sync.set({ op_saved_filters: next });
      }
      return next;
    });
  }, []);

  const loadFilter = useCallback((id: string) => {
    const target = savedFilters.find(f => f.id === id);
    if (target) {
      setFilters(target.state);
    }
  }, [savedFilters]);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_STATE);
  }, []);

  return {
    filters,
    updateFilter,
    savedFilters,
    saveCurrentFilter,
    deleteSavedFilter,
    loadFilter,
    clearFilters,
    isLoaded
  };
}
