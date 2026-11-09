import { useEffect, useState, useMemo, useCallback } from 'react';
import { 
  Search, 
  ExternalLink, 
  Clock, 
  X, 
  FolderKanban, 
  Star, 
  User, 
  Bookmark, 
  Trash2, 
  Check, 
  Loader2, 
  AlertCircle, 
  Pencil,
  Maximize2,
  Minimize2
} from 'lucide-react';
import DesktopWorkspace from './components/DesktopWorkspace';
import { useResizableWindow } from './hooks/useResizableWindow';
import { 
  db, 
  type LocalTicket, 
  type LocalEffort, 
  type LookupItem, 
  type SavedView,
  type SyncQueueItem,
  DEFAULT_SAVED_VIEWS 
} from './services/db';
import { syncService, parseDurationToHours, is409Conflict } from './services/syncService';
import { sheetSyncService } from './services/sheetSyncService';
import { OpenProjectService } from './services/OpenProjectService';
import { extractTicketIdFromUrlOrText } from './utils/urlParser';
import { DEFAULT_STATUSES, DEFAULT_PRIORITIES } from './constants/opDefaults';

// Helper to get 5-day work week (Monday - Friday, excluding Sat & Sun)
function getWorkWeekDays(weekOffset = 0): { dateStr: string; label: string; dayName: string; isToday: boolean }[] {
  const now = new Date();
  now.setDate(now.getDate() + weekOffset * 7);

  // Find Monday of this week (0=Sun, 1=Mon, ..., 6=Sat)
  const currentDay = now.getDay();
  const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;

  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);

  const days = [];
  const todayStr = new Date().toISOString().split('T')[0];

  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const label = `${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'short' })}`;
    days.push({
      dateStr,
      label,
      dayName,
      isToday: dateStr === todayStr
    });
  }
  return days;
}

export default function App() {
  // --- Data State ---
  const [tickets, setTickets] = useState<LocalTicket[]>([]);
  const [statuses, setStatuses] = useState<LookupItem[]>([]);
  const [types, setTypes] = useState<LookupItem[]>([]);
  const [projectsList, setProjectsList] = useState<{ id: string; name: string; identifier?: string }[]>([]);
  const [projectAssigneesMap, setProjectAssigneesMap] = useState<Record<string, LookupItem[]>>({});
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string }>({ id: '1883', name: 'Nibas Nazeem' });

  // Selected Ticket & Active View Tab
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);
  // Google Sheet Database & Dual-Sync States
  const [opSheetUrl, setOpSheetUrl] = useState('');
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);
  const [isRestoringSheet, setIsRestoringSheet] = useState(false);
  const [sheetLastSyncTime, setSheetLastSyncTime] = useState('');

  // Selected ticket effort history & live fetch
  const [ticketEffortsList, setTicketEffortsList] = useState<{
    id: string;
    hours: number;
    spentOn: string;
    userName: string;
    userId?: string;
    comment: string;
    activity?: string;
    pendingSync?: boolean;
  }[]>([]);
  const [isLoadingTicketEfforts, setIsLoadingTicketEfforts] = useState(false);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchingRemote, setIsSearchingRemote] = useState(false);

  // Persisted Filter State interface & helper
  interface PersistedFilterState {
    filterProjects: string[];
    filterStatuses: string[];
    filterStatusCategory: 'all' | 'open' | 'closed';
    filterTypes: string[];
    filterAssignees: string[];
    filterPriorities: string[];
    filterStarredOnly: boolean;
    sortBy: 'updated_desc' | 'updated_asc' | 'id_desc' | 'id_asc' | 'priority';
    activeViewId?: string;
  }

  const getPersistedFilterState = (): PersistedFilterState | null => {
    try {
      const raw = localStorage.getItem('op_saved_filter_state');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }
    } catch (err) {
      console.warn('Failed to load filter state from localStorage:', err);
    }
    return null;
  };

  // Filter & Search states (persisted across refresh)
  const [filterProjects, setFilterProjects] = useState<string[]>(() => {
    return getPersistedFilterState()?.filterProjects || [];
  });
  const [filterStatuses, setFilterStatuses] = useState<string[]>(() => {
    return getPersistedFilterState()?.filterStatuses || [];
  });
  const [filterStatusCategory, setFilterStatusCategory] = useState<'all' | 'open' | 'closed'>(() => {
    return getPersistedFilterState()?.filterStatusCategory || 'open';
  });
  const [filterTypes, setFilterTypes] = useState<string[]>(() => {
    return getPersistedFilterState()?.filterTypes || [];
  });
  const [filterAssignees, setFilterAssignees] = useState<string[]>(() => {
    return getPersistedFilterState()?.filterAssignees || [];
  });
  const [filterPriorities, setFilterPriorities] = useState<string[]>(() => {
    return getPersistedFilterState()?.filterPriorities || [];
  });
  const [filterStarredOnly, setFilterStarredOnly] = useState<boolean>(() => {
    return !!getPersistedFilterState()?.filterStarredOnly;
  });
  const [sortBy, setSortBy] = useState<'updated_desc' | 'updated_asc' | 'id_desc' | 'id_asc' | 'priority'>(() => {
    return getPersistedFilterState()?.sortBy || 'updated_desc';
  });
  const [effortSearchQuery, setEffortSearchQuery] = useState('');

  // Activities & Comments state
  const [ticketActivities, setTicketActivities] = useState<{
    id: number;
    userName: string;
    createdAt: string;
    commentRaw: string;
    details: string[];
  }[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);

  // Direct Add Effort Modal (search ticket by number & log effort popup)
  const [isAddEffortModalOpen, setIsAddEffortModalOpen] = useState(false);
  const [effortTicketSearch, setEffortTicketSearch] = useState('');
  const [effortSelectedTicket, setEffortSelectedTicket] = useState<LocalTicket | null>(null);
  const [effortRemoteSearchResults, setEffortRemoteSearchResults] = useState<LocalTicket[]>([]);
  const [effortModalHours, setEffortModalHours] = useState('1.0');
  const [effortModalDate, setEffortModalDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [effortModalComment, setEffortModalComment] = useState('');
  const [isLoggingEffort, setIsLoggingEffort] = useState(false);
  const [isFetchingEffortTicket, setIsFetchingEffortTicket] = useState(false);
  const [effortTicketFetchError, setEffortTicketFetchError] = useState<string | null>(null);

  // Saved Views State (OpenProject Views feature)
  const [savedViews, setSavedViews] = useState<SavedView[]>(DEFAULT_SAVED_VIEWS);
  const [activeViewId, setActiveViewId] = useState<string>(() => {
    return getPersistedFilterState()?.activeViewId || 'sys_all_open';
  });
  const [isSaveViewModalOpen, setIsSaveViewModalOpen] = useState(false);
  const [newViewName, setNewViewName] = useState('');

  // Resizable Modal Windows
  const logEffortModalWindow = useResizableWindow({
    storageKey: 'op_modal_log_effort_size',
    defaultWidth: 540,
    defaultHeight: 640,
    minWidth: 400,
    minHeight: 380
  });

  const editEffortModalWindow = useResizableWindow({
    storageKey: 'op_modal_edit_effort_size',
    defaultWidth: 500,
    defaultHeight: 520,
    minWidth: 400,
    minHeight: 350
  });

  const saveViewModalWindow = useResizableWindow({
    storageKey: 'op_modal_save_view_size',
    defaultWidth: 420,
    defaultHeight: 340,
    minWidth: 350,
    minHeight: 280
  });

  const [newViewFavorite, setNewViewFavorite] = useState(true);
  const [newViewDefault, setNewViewDefault] = useState(false);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [lastSyncText, setLastSyncText] = useState<string>('Local DB');
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>([]);

  // Efforts & Weekly Tracking (5-Day Work Week, Mon-Fri)
  const [weekOffset, setWeekOffset] = useState(0);
  const [allEfforts, setAllEfforts] = useState<LocalEffort[]>([]);
  const [selectedEffortDate, setSelectedEffortDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // Edit Existing Logged Effort Modal
  const [editingEffort, setEditingEffort] = useState<LocalEffort | null>(null);
  const [editEffortHours, setEditEffortHours] = useState('1.0');
  const [editEffortDate, setEditEffortDate] = useState('');
  const [editEffortComment, setEditEffortComment] = useState('');
  const [isSavingEditEffort, setIsSavingEditEffort] = useState(false);
  const [isDeletingEffort, setIsDeletingEffort] = useState(false);

  // Settings
  const [opUrl, setOpUrl] = useState('https://openproject.fingent.net');
  const [opApiKey, setOpApiKey] = useState('');

  // --- Load Local Database Records ---
  const loadLocalData = useCallback(async () => {
    try {
      const allTickets = await db.getAllTickets();
      setTickets(allTickets);

      const dbStatuses = await db.getStatuses();
      setStatuses(dbStatuses);

      const dbTypes = await db.getTypes();
      setTypes(dbTypes);

      const pAssignees = await db.getAllProjectAssignees();
      setProjectAssigneesMap(pAssignees);

      const cachedProjects = await db.getMeta<{ id: string; name: string; identifier?: string }[]>('projects');
      if (cachedProjects && cachedProjects.length > 0) {
        setProjectsList(cachedProjects);
      }

      const cachedUser = await db.getMeta<{ id: string; name: string }>('currentUser');
      if (cachedUser) {
        setCurrentUser(cachedUser);
      }

      const views = await db.getSavedViews();
      setSavedViews(views);

      // Check if user already has a saved filter state in localStorage or IndexedDB
      const savedInStorage = getPersistedFilterState();
      const savedInDB = await db.getMeta<PersistedFilterState>('activeFilterState');
      const activeSaved = savedInStorage || savedInDB;

      if (activeSaved) {
        if (activeSaved.activeViewId) setActiveViewId(activeSaved.activeViewId);
        setFilterStatusCategory(activeSaved.filterStatusCategory || 'open');
        setFilterStatuses(activeSaved.filterStatuses || []);
        setFilterProjects(activeSaved.filterProjects || []);
        setFilterTypes(activeSaved.filterTypes || []);
        setFilterAssignees(activeSaved.filterAssignees || []);
        setFilterPriorities(activeSaved.filterPriorities || []);
        setFilterStarredOnly(!!activeSaved.filterStarredOnly);
        setSortBy(activeSaved.sortBy || 'updated_desc');
      } else {
        // Auto-activate the default view only if no filter state was ever saved
        const defaultMetaId = await db.getMeta<string>('defaultViewId');
        const targetDefault = views.find(v => v.id === defaultMetaId) || views.find(v => v.isDefault) || views[0];
        if (targetDefault) {
          setActiveViewId(targetDefault.id);
          const f = targetDefault.filters;
          setFilterStatusCategory(f.statusCategory || 'open');
          if (f.statusIds && f.statusIds.length > 0) setFilterStatuses(f.statusIds);
          else if (f.statusId) setFilterStatuses([f.statusId]);
          else setFilterStatuses([]);

          if (f.projects && f.projects.length > 0) setFilterProjects(f.projects);
          else if (f.project) setFilterProjects([f.project]);
          else if (f.projectId) setFilterProjects([f.projectId]);
          else setFilterProjects([]);

          setFilterTypes(f.types && f.types.length > 0 ? f.types : (f.type ? [f.type] : []));
          setFilterAssignees(f.assignees && f.assignees.length > 0 ? f.assignees : (f.assignee ? [f.assignee] : []));
          setFilterPriorities(f.priorities && f.priorities.length > 0 ? f.priorities : (f.priority ? [f.priority] : []));
          setFilterStarredOnly(!!f.starredOnly);
          setSortBy(f.sortBy || 'updated_desc');
        }
      }

      const efforts = await db.getAllEfforts();
      setAllEfforts(efforts);

      const queue = await db.getSyncQueue();
      setSyncQueue(queue);

      const lastSync = await db.getMeta<number>('lastSyncTime');
      if (lastSync) {
        const minsAgo = Math.floor((Date.now() - lastSync) / 60000);
        setLastSyncText(minsAgo <= 0 ? 'Just now' : `${minsAgo}m ago`);
      } else {
        setLastSyncText('Local DB');
      }

      // Dual-Sync Cloud Database: Auto-merge latest efforts, tickets, and views from Google Sheet
      const sheetUrl = sheetSyncService.getSheetUrl();
      if (sheetUrl) {
        sheetSyncService.mergeWithSheet().then(async (res) => {
          if (res.success) {
            setSheetLastSyncTime(sheetSyncService.getLastSyncTime());
            if ((res.newEffortsCount || 0) > 0) {
              const freshEfforts = await db.getAllEfforts();
              setAllEfforts(freshEfforts);
              showEphemeralNotice(`Synced ${res.newEffortsCount} efforts from Google Sheet cloud`);
            }
            if (allTickets.length === 0) {
              const freshTickets = await db.getAllTickets();
              if (freshTickets.length > 0) setTickets(freshTickets);
              const freshProjects = await db.getMeta<{ id: string; name: string }[]>('projects');
              if (freshProjects) setProjectsList(freshProjects);
              const freshStatuses = await db.getStatuses();
              if (freshStatuses.length > 0) setStatuses(freshStatuses);
              const freshTypes = await db.getTypes();
              if (freshTypes.length > 0) setTypes(freshTypes);
              const freshViews = await db.getSavedViews();
              if (freshViews.length > 0) setSavedViews(freshViews);
            }
          }
        }).catch(() => {});
      }
    } catch (err) {
      console.error('[DB] Failed to load local records:', err);
    }
  }, []);

  // Auto-persist active filters to localStorage and IndexedDB so they never get lost after refresh
  useEffect(() => {
    const stateToSave: PersistedFilterState = {
      filterProjects,
      filterStatuses,
      filterStatusCategory,
      filterTypes,
      filterAssignees,
      filterPriorities,
      filterStarredOnly,
      sortBy,
      activeViewId
    };

    try {
      localStorage.setItem('op_saved_filter_state', JSON.stringify(stateToSave));
    } catch (e) {
      console.warn('Failed to save filters to localStorage:', e);
    }

    db.setMeta('activeFilterState', stateToSave).catch(console.error);
  }, [
    filterProjects,
    filterStatuses,
    filterStatusCategory,
    filterTypes,
    filterAssignees,
    filterPriorities,
    filterStarredOnly,
    sortBy,
    activeViewId
  ]);

  // --- Network Sync ---
  const handleSync = useCallback(async (showNotice = false) => {
    if (isSyncing) return;
    setIsSyncing(true);

    try {
      const res = await syncService.syncAll();

      // Cloud database sync: merge with Google Sheet
      if (sheetSyncService.getSheetUrl()) {
        try {
          const sheetRes = await sheetSyncService.mergeWithSheet();
          if (sheetRes.success) {
            setSheetLastSyncTime(sheetSyncService.getLastSyncTime());
          }
        } catch (e) {
          console.warn('[Sync] Google Sheet merge notice:', e);
        }
      }

      await loadLocalData();

      if (res.success) {
        setLastSyncText('Just now');
        if (showNotice) showEphemeralNotice('Synced with OpenProject & Google Sheet');
      } else if (res.reason === 'OFFLINE') {
        setLastSyncText('Offline (Local)');
        if (showNotice) showEphemeralNotice('Offline - using Local DB & Sheet');
      } else if (res.reason === 'NO_CREDENTIALS') {
        setLastSyncText('Set API Key');
      }
    } catch (err: any) {
      console.warn('[Sync] Sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, loadLocalData]);

  const showEphemeralNotice = (msg: string) => {
    setSyncNotice(msg);
    setTimeout(() => setSyncNotice(null), 2500);
  };

  // --- Initialization on Mount ---
  useEffect(() => {
    loadLocalData();

    OpenProjectService.getCredentials().then((creds) => {
      if (creds.url) setOpUrl(creds.url);
      if (creds.apiKey) setOpApiKey(creds.apiKey);
    });

    const sheetUrl = sheetSyncService.getSheetUrl();
    if (sheetUrl) {
      setOpSheetUrl(sheetUrl);
      setSheetLastSyncTime(sheetSyncService.getLastSyncTime());
    }

    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get('url') || params.get('text') || params.get('ticket') || params.get('id');
    const targetTicketId = extractTicketIdFromUrlOrText(sharedUrl);

    if (targetTicketId) {
      openTicketById(targetTicketId);
    }

    handleSync();

    const handleOnline = () => {
      setIsOnline(true);
      handleSync(true);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setLastSyncText('Offline');
    };

    // Auto-sync between devices (phone ↔ laptop) on focus or tab visibility
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        const currentSheet = sheetSyncService.getSheetUrl();
        if (currentSheet) {
          sheetSyncService.mergeWithSheet().then(res => {
            if (res.newEffortsCount && res.newEffortsCount > 0) {
              loadLocalData();
              setSheetLastSyncTime(new Date().toLocaleTimeString());
            }
          }).catch(console.error);
        }
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    const periodicSyncTimer = setInterval(handleVisibilityOrFocus, 120000); // Poll every 2m

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      clearInterval(periodicSyncTimer);
    };
  }, []);

  // --- Open Ticket By ID (Local lookup + Remote fallback) ---
  const openTicketById = async (id: number) => {
    const existing = await db.getTicket(id);
    if (existing) {
      setSelectedTicketId(id);
    } else {
      setIsSyncing(true);
      const fetched = await syncService.fetchAndCacheSingleTicket(id);
      setIsSyncing(false);
      if (fetched) {
        await loadLocalData();
        setSelectedTicketId(id);
      } else {
        showEphemeralNotice(`Ticket #${id} not found on server`);
      }
    }
  };

  // --- Remote Search (searches OP and stores locally) ---
  const handleRemoteSearch = async () => {
    const raw = searchQuery.trim();
    if (!raw) return;
    setIsSearchingRemote(true);
    showEphemeralNotice('Searching OpenProject server...');

    // 1. If it's a URL or direct ID reference, fetch and open directly
    const extractedId = extractTicketIdFromUrlOrText(raw) || parseInt(raw.replace(/^#/, ''), 10);
    if (extractedId && !isNaN(extractedId) && extractedId > 0) {
      try {
        const single = await syncService.fetchAndCacheSingleTicket(extractedId);
        setIsSearchingRemote(false);
        if (single) {
          setTickets(prev => {
            const map = new Map<number, LocalTicket>();
            map.set(single.id, single);
            prev.forEach(p => { if (!map.has(p.id)) map.set(p.id, p); });
            return Array.from(map.values());
          });
          setSelectedTicketId(extractedId);
          showEphemeralNotice(`Found & opened #${extractedId}`);
          return;
        }
      } catch (err) {
        console.warn('[Search] Direct ID query failed, falling back:', err);
      }
    }

    // 2. Keyword search on OpenProject server
    try {
      const results = await syncService.searchRemoteAndCache(raw);
      setIsSearchingRemote(false);

      if (results.length > 0) {
        setTickets(prev => {
          const map = new Map<number, LocalTicket>();
          results.forEach(r => map.set(r.id, r));
          prev.forEach(p => { if (!map.has(p.id)) map.set(p.id, p); });
          return Array.from(map.values());
        });
        if (results.length === 1 && !selectedTicketId) {
          setSelectedTicketId(results[0].id);
        }
        showEphemeralNotice(`Found ${results.length} ticket(s) on OpenProject`);
      } else {
        showEphemeralNotice(`No tickets matching "${raw}" found on server`);
      }
    } catch (err) {
      setIsSearchingRemote(false);
      showEphemeralNotice('Search query failed');
    }
  };

  // --- Auto-Search OpenProject Server with Debounce for Main Tickets Search ---
  useEffect(() => {
    const raw = searchQuery.trim();
    if (!raw) return;

    const extractedId = extractTicketIdFromUrlOrText(raw);
    if (!extractedId && raw.length < 3) return;

    const timer = setTimeout(() => {
      handleRemoteSearch();
    }, 450);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // --- Auto-fetch and Auto-search for Log Effort modal ---
  useEffect(() => {
    if (!isAddEffortModalOpen || effortSelectedTicket) return;
    const raw = effortTicketSearch.trim();
    if (!raw) {
      setEffortRemoteSearchResults([]);
      return;
    }

    const extractedId = extractTicketIdFromUrlOrText(raw) || parseInt(raw.replace(/^#/, ''), 10);
    const hasValidTargetId = !isNaN(extractedId) && extractedId > 0;

    // If ID, try local first
    if (hasValidTargetId) {
      const local = tickets.find(t => t.id === extractedId && t.subject && !t.subject.startsWith('Ticket #'));
      if (local) {
        setEffortSelectedTicket(local);
        return;
      }
    }

    if (!hasValidTargetId && raw.length < 2) {
      setEffortRemoteSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsFetchingEffortTicket(true);
      setEffortTicketFetchError(null);
      try {
        if (hasValidTargetId) {
          const single = await syncService.fetchAndCacheSingleTicket(extractedId);
          if (single) {
            setEffortSelectedTicket(single);
            setEffortTicketSearch('');
            setEffortRemoteSearchResults([]);
            return;
          }
        }
        const results = await syncService.searchRemoteAndCache(raw);
        setEffortRemoteSearchResults(results);
        if (results.length === 0) {
          setEffortTicketFetchError(`No tickets matching "${raw}" found on OpenProject.`);
        }
      } catch (err: any) {
        console.warn('Auto search effort error:', err);
      } finally {
        setIsFetchingEffortTicket(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [effortTicketSearch, isAddEffortModalOpen, effortSelectedTicket, tickets]);

  // --- Toggle Star (Daily Task) ---
  const handleToggleStar = async (e: React.MouseEvent, ticketId: number) => {
    e.stopPropagation();
    const newStarred = await db.toggleStarTicket(ticketId);
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, starred: newStarred } : t));
    showEphemeralNotice(newStarred ? `Starred #${ticketId}` : `Unstarred #${ticketId}`);
  };

  // --- Update Status (using REAL OpenProject statusId) ---
  const handleUpdateStatus = async (ticket: LocalTicket, statusId: string, statusName: string) => {
    const updated: LocalTicket = {
      ...ticket,
      status: statusName,
      statusId: statusId,
      pendingSync: true
    };

    await db.putTicket(updated);
    setTickets(prev => prev.map(t => t.id === ticket.id ? updated : t));
    sheetSyncService.syncTicketAsync(updated, currentUser);
    showEphemeralNotice(`Status updated to ${statusName}`);

    await db.enqueueSyncItem({
      id: `status_${ticket.id}_${Date.now()}`,
      type: 'UPDATE_STATUS',
      payload: {
        ticketId: ticket.id,
        statusId: statusId,
        lockVersion: ticket.lockVersion
      },
      createdAt: new Date().toISOString(),
      retryCount: 0
    });

    if (navigator.onLine) {
      handleSync();
    }
  };

  // --- Update Assignee (using REAL OpenProject assigneeId) ---
  const handleUpdateAssignee = async (ticket: LocalTicket, assigneeId: string, assigneeName: string) => {
    const updated: LocalTicket = {
      ...ticket,
      assignee: assigneeName,
      assigneeId: assigneeId,
      pendingSync: true
    };

    await db.putTicket(updated);
    setTickets(prev => prev.map(t => t.id === ticket.id ? updated : t));
    sheetSyncService.syncTicketAsync(updated, currentUser);
    showEphemeralNotice(`Reassigned to ${assigneeName}`);

    await db.enqueueSyncItem({
      id: `assignee_${ticket.id}_${Date.now()}`,
      type: 'UPDATE_ASSIGNEE',
      payload: {
        ticketId: ticket.id,
        assigneeId: assigneeId,
        lockVersion: ticket.lockVersion
      },
      createdAt: new Date().toISOString(),
      retryCount: 0
    });

    if (navigator.onLine) {
      handleSync();
    }
  };

  // --- Fetch Ticket for Effort Modal by ID (Local DB or OpenProject Server) ---
  const fetchTicketForEffort = async (targetId: number) => {
    if (!targetId || isNaN(targetId) || targetId <= 0) return;
    setIsFetchingEffortTicket(true);
    setEffortTicketFetchError(null);
    try {
      // 1. Check local DB first
      let ticket = await db.getTicket(targetId);
      if (!ticket || !ticket.subject || ticket.subject.startsWith('Ticket #')) {
        // 2. Query OpenProject server directly
        ticket = await syncService.fetchAndCacheSingleTicket(targetId);
      }
      if (ticket) {
        setEffortSelectedTicket(ticket);
        setTickets(prev => prev.some(t => t.id === ticket!.id) ? prev.map(t => t.id === ticket!.id ? ticket! : t) : [ticket!, ...prev]);
        setEffortTicketSearch('');
      } else {
        setEffortTicketFetchError(`Ticket #${targetId} not found on OpenProject server (or check permissions).`);
      }
    } catch (err: any) {
      setEffortTicketFetchError(err.message || `Failed to fetch ticket #${targetId}`);
    } finally {
      setIsFetchingEffortTicket(false);
    }
  };

  const handleRemoteSearchForEffort = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setIsFetchingEffortTicket(true);
    setEffortTicketFetchError(null);
    try {
      const results = await syncService.searchRemoteAndCache(trimmed);
      setEffortRemoteSearchResults(results);
      if (results.length > 0) {
        setTickets(prev => {
          const map = new Map<number, LocalTicket>();
          results.forEach(r => map.set(r.id, r));
          prev.forEach(p => { if (!map.has(p.id)) map.set(p.id, p); });
          return Array.from(map.values());
        });
        if (results.length === 1) {
          setEffortSelectedTicket(results[0]);
          setEffortTicketSearch('');
          setEffortRemoteSearchResults([]);
        }
      } else {
        setEffortTicketFetchError(`No tickets matching "${trimmed}" found on OpenProject.`);
      }
    } catch (err: any) {
      setEffortTicketFetchError(err.message || `Failed searching OpenProject for "${trimmed}"`);
    } finally {
      setIsFetchingEffortTicket(false);
    }
  };

  // --- Universal Log Effort Handler (used by Ticket Details & Direct Popup) ---
  const handleLogEffortDirect = async (
    targetTicketId: number, 
    ticketSubject: string, 
    hours: number, 
    dateStr: string, 
    comment: string
  ) => {
    if (!targetTicketId || hours <= 0) return;
    setIsLoggingEffort(true);

    const hoursDuration = hours % 1 === 0 ? `PT${hours}H` : `PT${Math.floor(hours)}H${Math.round((hours % 1) * 60)}M`;
    const newEffort: LocalEffort = {
      id: `effort_${Date.now()}`,
      workPackageId: targetTicketId,
      ticketSubject: ticketSubject || `Ticket #${targetTicketId}`,
      hours: hours,
      comment: comment || 'Effort logged via OP Mobile',
      spentOn: dateStr,
      createdAt: new Date().toISOString(),
      pendingSync: true
    };

    // Update local efforts in DB & state
    await db.putEffort(newEffort);
    setAllEfforts(prev => [newEffort, ...prev]);

    // Dual-Sync: Asynchronously record effort in Google Sheet
    sheetSyncService.logEffortAsync(newEffort, currentUser);

    // If currently viewing this ticket in modal, immediately prepend to effort history
    if (selectedTicketId === targetTicketId) {
      setTicketEffortsList(prev => [
        {
          id: newEffort.id,
          hours: newEffort.hours,
          spentOn: newEffort.spentOn,
          userName: currentUser.name || 'You',
          userId: currentUser.id,
          comment: newEffort.comment,
          pendingSync: true
        },
        ...prev
      ]);
    }

    // Update spentTime on local ticket if present
    const t = tickets.find(ticket => ticket.id === targetTicketId);
    if (t) {
      const currentSpent = parseDurationToHours(t.spentTime);
      const newSpent = +(currentSpent + hours).toFixed(2);
      const updatedTicket: LocalTicket = {
        ...t,
        spentTime: `PT${Math.floor(newSpent)}H${Math.round((newSpent % 1) * 60)}M`,
        pendingSync: true
      };
      await db.putTicket(updatedTicket);
      setTickets(prev => prev.map(item => item.id === targetTicketId ? updatedTicket : item));
    }

    // Try posting directly to OpenProject API if online, or enqueue in sync queue
    let syncedImmediately = false;
    if (navigator.onLine) {
      try {
        await OpenProjectService.logTime(targetTicketId, hoursDuration, newEffort.comment, dateStr);
        newEffort.pendingSync = false;
        await db.putEffort(newEffort);
        setAllEfforts(prev => prev.map(e => e.id === newEffort.id ? { ...e, pendingSync: false } : e));
        if (selectedTicketId === targetTicketId) {
          setTicketEffortsList(prev => prev.map(e => e.id === newEffort.id ? { ...e, pendingSync: false } : e));
        }
        syncedImmediately = true;
      } catch (err) {
        console.warn('[Effort] Immediate sync failed, enqueuing for sync:', err);
      }
    }

    if (!syncedImmediately) {
      await db.enqueueSyncItem({
        id: `time_${targetTicketId}_${Date.now()}`,
        type: 'LOG_TIME',
        payload: {
          ticketId: targetTicketId,
          hours: hoursDuration,
          comment: newEffort.comment,
          date: dateStr
        },
        createdAt: new Date().toISOString(),
        retryCount: 0
      });
    }

    setIsLoggingEffort(false);
    setIsAddEffortModalOpen(false);
    setEffortTicketSearch('');
    setEffortSelectedTicket(null);
    setEffortModalComment('');
    showEphemeralNotice(`Logged ${hours}h for #${targetTicketId} (${syncedImmediately ? 'Synced with OP' : 'Saved locally'})`);
  };

  // --- Edit Existing Logged Effort Handlers ---
  const handleOpenEditEffort = (effort: LocalEffort) => {
    setEditingEffort(effort);
    setEditEffortHours(String(effort.hours));
    setEditEffortDate(effort.spentOn);
    setEditEffortComment(effort.comment || '');
  };

  const handleSaveEditEffort = async () => {
    if (!editingEffort) return;
    const newHours = parseFloat(editEffortHours);
    if (isNaN(newHours) || newHours <= 0) return;

    setIsSavingEditEffort(true);
    const hoursDuration = newHours % 1 === 0 
      ? `PT${newHours}H` 
      : `PT${Math.floor(newHours)}H${Math.round((newHours % 1) * 60)}M`;

    const diff = newHours - editingEffort.hours;

    const updatedEffort: LocalEffort = {
      ...editingEffort,
      hours: newHours,
      comment: editEffortComment,
      spentOn: editEffortDate,
      pendingSync: true
    };

    // 1. Update IndexedDB and React state
    await db.putEffort(updatedEffort);
    setAllEfforts(prev => prev.map(e => e.id === updatedEffort.id ? updatedEffort : e));

    // 2. Adjust spentTime on local ticket
    if (editingEffort.workPackageId) {
      const t = tickets.find(item => item.id === editingEffort.workPackageId);
      if (t) {
        const currentSpent = parseDurationToHours(t.spentTime);
        const updatedSpent = Math.max(0, +(currentSpent + diff).toFixed(2));
        const updatedTicket: LocalTicket = {
          ...t,
          spentTime: `PT${Math.floor(updatedSpent)}H${Math.round((updatedSpent % 1) * 60)}M`
        };
        await db.putTicket(updatedTicket);
        setTickets(prev => prev.map(item => item.id === t.id ? updatedTicket : item));
      }
    }

    // 3. Sync to OpenProject API if online and not a locally created ID
    let synced = false;
    const isLocalTempId = editingEffort.id.startsWith('effort_');

    if (navigator.onLine && !isLocalTempId) {
      try {
        await OpenProjectService.updateTimeEntry(
          editingEffort.id,
          hoursDuration,
          editEffortComment,
          editEffortDate
        );
        updatedEffort.pendingSync = false;
        await db.putEffort(updatedEffort);
        setAllEfforts(prev => prev.map(e => e.id === updatedEffort.id ? { ...e, pendingSync: false } : e));
        synced = true;
      } catch (err) {
        console.warn('[Effort] Remote edit sync failed, enqueuing:', err);
      }
    }

    if (!synced) {
      if (isLocalTempId) {
        const queue = await db.getSyncQueue();
        const targetQueueItem = queue.find(q => q.type === 'LOG_TIME' && q.id.includes(String(editingEffort.workPackageId)));
        if (targetQueueItem) {
          targetQueueItem.payload.hours = hoursDuration;
          targetQueueItem.payload.comment = editEffortComment;
          targetQueueItem.payload.date = editEffortDate;
          await db.enqueueSyncItem(targetQueueItem);
        }
      } else {
        await db.enqueueSyncItem({
          id: `update_time_${editingEffort.id}_${Date.now()}`,
          type: 'UPDATE_TIME',
          payload: {
            id: editingEffort.id,
            hours: hoursDuration,
            comment: editEffortComment,
            date: editEffortDate
          },
          createdAt: new Date().toISOString(),
          retryCount: 0
        });
      }
    }

    // Update ticketEffortsList if open
    setTicketEffortsList(prev => prev.map(e => {
      const isMatch = e.id === updatedEffort.id || e.id === `pending-${updatedEffort.id}` || (editingEffort && (e.id === editingEffort.id || e.id === `pending-${editingEffort.id}`));
      if (!isMatch) return e;
      return {
        ...e,
        hours: newHours,
        spentOn: editEffortDate,
        comment: editEffortComment,
        pendingSync: !synced
      };
    }));

    setIsSavingEditEffort(false);
    setEditingEffort(null);
    showEphemeralNotice(`Updated #${editingEffort.workPackageId} to ${newHours}h (${synced ? 'Synced with OP' : 'Saved locally'})`);
  };

  const handleDeleteEffort = async (effort: LocalEffort) => {
    setIsDeletingEffort(true);

    try {
      // 1. Remove from DB and React state
      await db.deleteEffort(effort.id);
      setAllEfforts(prev => prev.filter(e => e.id !== effort.id));
      setTicketEffortsList(prev => prev.filter(e => e.id !== effort.id && e.id !== `pending-${effort.id}`));

      // 2. Adjust spentTime on local ticket
      if (effort.workPackageId) {
        const t = tickets.find(item => item.id === effort.workPackageId);
        if (t) {
          const currentSpent = parseDurationToHours(t.spentTime);
          const updatedSpent = Math.max(0, +(currentSpent - effort.hours).toFixed(2));
          const updatedTicket: LocalTicket = {
            ...t,
            spentTime: `PT${Math.floor(updatedSpent)}H${Math.round((updatedSpent % 1) * 60)}M`
          };
          await db.putTicket(updatedTicket);
          setTickets(prev => prev.map(item => item.id === t.id ? updatedTicket : item));
        }
      }

      // 3. Sync deletion to OpenProject
      const isLocalTempId = effort.id.startsWith('effort_') || effort.id.startsWith('pending-');
      if (navigator.onLine && !isLocalTempId) {
        try {
          await OpenProjectService.deleteTimeEntry(effort.id);
        } catch (err) {
          console.warn('[Effort] Remote delete sync failed, enqueueing:', err);
          await db.enqueueSyncItem({
            id: `del_time_${effort.id}_${Date.now()}`,
            type: 'DELETE_TIME',
            payload: { id: effort.id },
            createdAt: new Date().toISOString(),
            retryCount: 0
          });
        }
      }

      showEphemeralNotice(`Deleted ${effort.hours}h log for #${effort.workPackageId}`);
    } finally {
      setIsDeletingEffort(false);
      setEditingEffort(null);
    }
  };

  const handleDeleteTicketHistoryEntry = async (entry: {
    id: string;
    hours: number;
    spentOn: string;
    userName: string;
    userId?: string;
    comment: string;
    activity?: string;
    pendingSync?: boolean;
  }) => {
    if (!selectedTicketId) return;
    const cleanId = entry.id.replace(/^pending-/, '');

    const confirmed = window.confirm(`Delete ${entry.hours}h time entry (${entry.spentOn})?`);
    if (!confirmed) return;

    try {
      // 1. Remove from OpenProject if online and not a local temp id
      const isLocalTempId = cleanId.startsWith('effort_');
      if (navigator.onLine && !isLocalTempId) {
        try {
          await OpenProjectService.deleteTimeEntry(cleanId);
        } catch (err: any) {
          console.warn('[Ticket Viewer] Failed to delete time entry on OP:', err);
          const errMsg = err?.response?.data?.message || err?.message || 'Permission denied or network error';
          showEphemeralNotice(`Could not delete from OpenProject: ${errMsg}`);
          return;
        }
      } else if (!isLocalTempId) {
        await db.enqueueSyncItem({
          id: `del_time_${cleanId}_${Date.now()}`,
          type: 'DELETE_TIME',
          payload: { id: cleanId },
          createdAt: new Date().toISOString(),
          retryCount: 0
        });
      }

      // 2. Remove from ticketEffortsList
      setTicketEffortsList(prev => prev.filter(e => e.id !== entry.id && e.id !== cleanId && e.id !== `pending-${cleanId}`));

      // 3. Remove from local efforts DB & state
      await db.deleteEffort(cleanId);
      await db.deleteEffort(entry.id);
      setAllEfforts(prev => prev.filter(e => e.id !== cleanId && e.id !== entry.id));

      // 4. Adjust spentTime on local ticket
      const t = tickets.find(item => item.id === selectedTicketId);
      if (t) {
        const currentSpent = parseDurationToHours(t.spentTime);
        const updatedSpent = Math.max(0, +(currentSpent - entry.hours).toFixed(2));
        const updatedTicket: LocalTicket = {
          ...t,
          spentTime: `PT${Math.floor(updatedSpent)}H${Math.round((updatedSpent % 1) * 60)}M`
        };
        await db.putTicket(updatedTicket);
        setTickets(prev => prev.map(item => item.id === t.id ? updatedTicket : item));
      }

      showEphemeralNotice(`Deleted ${entry.hours}h time entry`);
    } finally {
    }
  };

  // --- Google Sheet Dual-Sync & Backup ---
  const handleSyncAllToSheet = async () => {
    const url = opSheetUrl.trim();
    if (!url) {
      showEphemeralNotice('Please enter a Google Sheet Web App URL');
      return;
    }
    sheetSyncService.setSheetUrl(url);
    setIsSyncingSheet(true);
    showEphemeralNotice('Syncing all data to Google Sheet...');

    try {
      const res = await sheetSyncService.syncAllToSheet({
        projects: projectsList,
        statuses,
        types,
        views: savedViews,
        tickets,
        efforts: allEfforts,
        currentUser
      });

      if (res.success) {
        setSheetLastSyncTime(sheetSyncService.getLastSyncTime());
        showEphemeralNotice('Successfully synced all data to Google Sheet!');
      } else {
        showEphemeralNotice(res.message || 'Sheet sync failed');
      }
    } catch (err: any) {
      showEphemeralNotice(err.message || 'Sheet sync error');
    } finally {
      setIsSyncingSheet(false);
    }
  };

  const handleRestoreFromSheet = async () => {
    const url = opSheetUrl.trim();
    if (!url) {
      showEphemeralNotice('Please enter a Google Sheet Web App URL');
      return;
    }
    sheetSyncService.setSheetUrl(url);
    setIsRestoringSheet(true);
    showEphemeralNotice('Fetching backup from Google Sheet...');

    try {
      const res = await sheetSyncService.restoreFromSheet();

      if (res.success && res.data) {
        if (res.data.tickets && res.data.tickets.length > 0) setTickets(res.data.tickets);
        if (res.data.projects && res.data.projects.length > 0) setProjectsList(res.data.projects);
        if (res.data.statuses && res.data.statuses.length > 0) setStatuses(res.data.statuses);
        if (res.data.types && res.data.types.length > 0) setTypes(res.data.types);
        if (res.data.views && res.data.views.length > 0) setSavedViews(res.data.views);
        if (res.data.efforts && res.data.efforts.length > 0) setAllEfforts(res.data.efforts);
        if (res.data.currentUser) setCurrentUser(res.data.currentUser);
        setSheetLastSyncTime(sheetSyncService.getLastSyncTime());
        showEphemeralNotice('Data fully restored from Google Sheet!');
      } else {
        showEphemeralNotice(res.message || 'Failed to restore data from Sheet');
      }
    } catch (err: any) {
      showEphemeralNotice(err.message || 'Restore error');
    } finally {
      setIsRestoringSheet(false);
    }
  };

  // Lookup projectId by project name or ID
  const resolveProjectId = useCallback((projIdentOrName?: string): string | undefined => {
    if (!projIdentOrName) return undefined;
    const foundById = projectsList.find(p => String(p.id) === projIdentOrName);
    if (foundById) return String(foundById.id);

    const foundByName = projectsList.find(p => p.name.toLowerCase() === projIdentOrName.toLowerCase());
    if (foundByName) return String(foundByName.id);

    const ticketMatch = tickets.find(t => t.project === projIdentOrName && t.projectId);
    if (ticketMatch) return ticketMatch.projectId;

    return projIdentOrName;
  }, [projectsList, tickets]);

  // Fallback status list if DB statuses not yet populated
  const displayStatuses = useMemo(() => {
    if (statuses.length > 0) return statuses;
    return DEFAULT_STATUSES;
  }, [statuses]);

  // Map of closed statuses for accurate Open vs Closed category filtering
  const closedStatusIds = useMemo(() => {
    const set = new Set<string>();
    displayStatuses.forEach(s => {
      if (s.isClosed || ['closed', 'tested', 'rejected'].includes(s.name.toLowerCase())) {
        set.add(s.id);
      }
    });
    return set;
  }, [displayStatuses]);

  const displayPriorities = useMemo(() => {
    return DEFAULT_PRIORITIES;
  }, []);

  const starredTickets = useMemo(() => tickets.filter(t => t.starred), [tickets]);

  // Selected Ticket Reference
  const selectedTicket = useMemo(() => {
    return tickets.find(t => t.id === selectedTicketId) || null;
  }, [tickets, selectedTicketId]);

  // Selected ticket effort stats & aggregated totals
  const selectedTicketStats = useMemo(() => {
    if (!selectedTicket) {
      return { spentHours: 0, estimatedHours: 0, mySpentHours: 0, percent: null, remainingHours: null };
    }

    // 1. Base spent hours from OpenProject ticket spentTime
    let spentHours = parseDurationToHours(selectedTicket.spentTime);

    // 2. Sum of ticket efforts list if spentTime was 0 or list is larger
    const remoteListSum = ticketEffortsList.reduce((acc, curr) => acc + (curr.hours || 0), 0);
    if (!spentHours || remoteListSum > spentHours) {
      spentHours = +(remoteListSum.toFixed(2));
    }

    // 3. Include any local efforts that are pendingSync
    const pendingEfforts = allEfforts.filter(e => e.workPackageId === selectedTicket.id && e.pendingSync);
    const pendingSum = pendingEfforts.reduce((acc, curr) => acc + (curr.hours || 0), 0);
    if (pendingSum > 0) {
      spentHours = +(spentHours + pendingSum).toFixed(2);
    }

    // 4. Estimated hours
    const estimatedHours = parseDurationToHours(selectedTicket.estimatedTime);

    // 5. User's own logged effort on this ticket
    const myLocalSum = allEfforts
      .filter(e => e.workPackageId === selectedTicket.id)
      .reduce((acc, curr) => acc + (curr.hours || 0), 0);
    const myRemoteSum = ticketEffortsList
      .filter(e => currentUser?.id && String(e.userId) === String(currentUser.id))
      .reduce((acc, curr) => acc + (curr.hours || 0), 0);
    const mySpentHours = +(Math.max(myLocalSum, myRemoteSum).toFixed(2));

    const percent = estimatedHours > 0 ? Math.round((spentHours / estimatedHours) * 100) : null;
    const remainingHours = estimatedHours > 0 ? +(Math.max(0, estimatedHours - spentHours).toFixed(2)) : null;

    return { spentHours, estimatedHours, mySpentHours, percent, remainingHours };
  }, [selectedTicket, ticketEffortsList, allEfforts, currentUser]);

  const fetchTicketActivities = async (ticketId: number) => {
    setIsLoadingActivities(true);
    try {
      const data = await OpenProjectService.getWorkPackageActivities(ticketId);
      const elements = data?._embedded?.elements || [];
      const parsed = elements.map((elem: any) => {
        const userName = elem._links?.user?.title || elem.user?.name || 'User';
        const commentRaw = elem.comment?.raw || '';
        const details = Array.isArray(elem.details)
          ? elem.details.map((d: any) => typeof d === 'string' ? d : (d.raw || d.html || '')).filter(Boolean)
          : [];
        return {
          id: elem.id,
          userName,
          createdAt: elem.createdAt,
          commentRaw,
          details
        };
      }).filter((item: any) => item.commentRaw || item.details.length > 0);
      setTicketActivities(parsed);
    } catch (err) {
      console.warn('Failed to load activities:', err);
      setTicketActivities([]);
    } finally {
      setIsLoadingActivities(false);
    }
  };

  // Automatically fetch up-to-date ticket details and time entries when a ticket is opened
  useEffect(() => {
    if (!selectedTicketId) {
      setTicketEffortsList([]);
      setIsLoadingTicketEfforts(false);
      setTicketActivities([]);
      return;
    }

    let isMounted = true;
    setIsLoadingTicketEfforts(true);

    // 1. Fetch up-to-date work package details from OpenProject in background
    syncService.fetchAndCacheSingleTicket(selectedTicketId).then((refreshed) => {
      if (refreshed && isMounted) {
        setTickets(prev => {
          const idx = prev.findIndex(t => t.id === selectedTicketId);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = refreshed;
            return next;
          }
          return [refreshed, ...prev];
        });
      }
    }).catch(() => {});

    // 2. Fetch logged time entries for this work package
    OpenProjectService.getTimeEntriesForWorkPackage(selectedTicketId, 30)
      .then((data) => {
        if (!isMounted) return;
        const elements = data?._embedded?.elements || [];
        const formatted = elements.map((e: any) => ({
          id: String(e.id),
          hours: parseDurationToHours(e.hours),
          spentOn: e.spentOn,
          userName: e._links?.user?.title || 'Unknown User',
          userId: e._links?.user?.href ? e._links.user.href.split('/').pop() : undefined,
          comment: e.comment?.raw || '',
          activity: e._links?.activity?.title || ''
        }));

        // Merge with any local pending efforts for this ticket
        const localPending = allEfforts
          .filter(e => e.workPackageId === selectedTicketId && e.pendingSync)
          .map(e => ({
            id: `pending-${e.id}`,
            hours: e.hours,
            spentOn: e.spentOn,
            userName: currentUser.name || 'You',
            userId: currentUser.id,
            comment: e.comment || '',
            pendingSync: true
          }));

        setTicketEffortsList([...localPending, ...formatted]);
      })
      .catch((err) => {
        console.warn('[Ticket Viewer] Failed to fetch time entries:', err);
        if (isMounted) {
          const localEntries = allEfforts
            .filter(e => e.workPackageId === selectedTicketId)
            .map(e => ({
              id: e.id,
              hours: e.hours,
              spentOn: e.spentOn,
              userName: currentUser.name || 'You',
              userId: currentUser.id,
              comment: e.comment || '',
              pendingSync: e.pendingSync
            }));
          setTicketEffortsList(localEntries);
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingTicketEfforts(false);
      });

    // 3. Fetch activities & comments
    fetchTicketActivities(selectedTicketId);

    return () => {
      isMounted = false;
    };
  }, [selectedTicketId, currentUser]);

  // Search filter for Add Effort Ticket Picker
  const effortTicketSearchResults = useMemo(() => {
    const raw = effortTicketSearch.trim();
    if (!raw) {
      // Under Log Time and Effort, the list of tracked tickets should be displayed
      const trackedIds = Array.from(new Set(allEfforts.map(e => e.workPackageId)));
      const trackedTickets = trackedIds.map(id => {
        const found = tickets.find(t => t.id === id);
        if (found) return found;
        const eff = allEfforts.find(e => e.workPackageId === id);
        return {
          id,
          subject: eff?.ticketSubject || `Ticket #${id}`,
          project: 'Tracked Work Package',
          status: 'Tracked',
          priority: 'Normal',
          assignee: 'You',
          spentTime: '',
          estimatedTime: '',
          lockVersion: 1,
          updatedAt: new Date().toISOString(),
          pendingSync: false
        } as LocalTicket;
      });
      return trackedTickets.length > 0 ? trackedTickets : tickets.slice(0, 15);
    }

    const extractedId = extractTicketIdFromUrlOrText(raw);
    const cleanId = raw.replace(/^#/, '').toLowerCase();
    const q = raw.toLowerCase();

    // 1. Local matching tickets
    const localMatches = tickets.filter(t => 
      (extractedId && t.id === extractedId) ||
      String(t.id).includes(cleanId) ||
      t.subject.toLowerCase().includes(q) ||
      t.project.toLowerCase().includes(q)
    );

    // 2. Combine with remote search results from OpenProject
    const map = new Map<number, LocalTicket>();
    localMatches.forEach(t => map.set(t.id, t));
    effortRemoteSearchResults.forEach(t => {
      if (!map.has(t.id)) map.set(t.id, t);
    });

    return Array.from(map.values()).slice(0, 20);
  }, [tickets, allEfforts, effortTicketSearch, effortRemoteSearchResults]);

  // --- Saved Views Activation & Application ---
  const applySavedView = (view: SavedView) => {
    setActiveViewId(view.id);
    const f = view.filters;

    setFilterStatusCategory(f.statusCategory || 'all');
    if (f.statusIds && f.statusIds.length > 0) {
      setFilterStatuses(f.statusIds);
    } else if (f.statusId) {
      setFilterStatuses([f.statusId]);
    } else {
      setFilterStatuses([]);
    }

    if (f.projects && f.projects.length > 0) {
      setFilterProjects(f.projects);
    } else if (f.project) {
      setFilterProjects([f.project]);
    } else if (f.projectId) {
      setFilterProjects([f.projectId]);
    } else {
      setFilterProjects([]);
    }

    setFilterTypes(f.types && f.types.length > 0 ? f.types : (f.type ? [f.type] : []));
    setFilterAssignees(f.assignees && f.assignees.length > 0 ? f.assignees : (f.assignee ? [f.assignee] : []));
    setFilterPriorities(f.priorities && f.priorities.length > 0 ? f.priorities : (f.priority ? [f.priority] : []));
    setFilterStarredOnly(!!f.starredOnly);
    setSortBy(f.sortBy || 'updated_desc');

    showEphemeralNotice(`Switched view: ${view.name}`);
  };

  const handleSaveCurrentAsNewView = async () => {
    if (!newViewName.trim()) return;

    const newViewId = `view_${Date.now()}`;
    const newView: SavedView = {
      id: newViewId,
      name: newViewName.trim(),
      isFavorite: newViewFavorite || newViewDefault,
      isSystem: false,
      isDefault: newViewDefault,
      createdAt: new Date().toISOString(),
      filters: {
        statusCategory: filterStatusCategory,
        statusIds: filterStatuses.length > 0 ? filterStatuses : undefined,
        projects: filterProjects.length > 0 ? filterProjects : undefined,
        types: filterTypes.length > 0 ? filterTypes : undefined,
        type: filterTypes[0] || undefined,
        assignees: filterAssignees.length > 0 ? filterAssignees : undefined,
        assignee: filterAssignees[0] || undefined,
        priorities: filterPriorities.length > 0 ? filterPriorities : undefined,
        priority: filterPriorities[0] || undefined,
        starredOnly: filterStarredOnly,
        sortBy: sortBy
      }
    };

    await db.putSavedView(newView);
    if (newViewDefault) {
      await db.setDefaultSavedView(newViewId);
    }
    sheetSyncService.saveViewAsync(newView);
    setSavedViews(prev => {
      const updated = prev.map(v => newViewDefault ? { ...v, isDefault: false } : v);
      return [...updated, newView];
    });
    setActiveViewId(newView.id);
    setIsSaveViewModalOpen(false);
    setNewViewName('');
    setNewViewDefault(false);
    showEphemeralNotice(`Saved view "${newView.name}"${newViewDefault ? ' (set as default)' : ''}`);
  };

  // --- Filtered & Sorted Tickets ---
  const filteredTickets = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const extractedId = extractTicketIdFromUrlOrText(searchQuery);

    const normalizeText = (text: string) => text.toLowerCase().replace(/[\s\-_]+/g, '');

    const result = tickets.filter(t => {
      // If user searched for an exact ticket ID or URL, match it directly
      if (extractedId && t.id === extractedId) {
        return true;
      }

      // 1. Text Search Query (checks ID, Subject, Project, Assignee, AND Description/Body)
      if (q) {
        const cleanId = q.replace(/^#/, '');
        const matchQuery = 
          String(t.id).includes(cleanId) || 
          t.subject.toLowerCase().includes(q) || 
          t.project.toLowerCase().includes(q) ||
          t.assignee.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q));
        if (!matchQuery) return false;
      }

      // 2. Starred Only
      if (filterStarredOnly && !t.starred) return false;

      // 3. Status Filtering: Specific Statuses takes priority over Category
      if (filterStatuses.length > 0) {
        const matchStatus = filterStatuses.some(s => 
          String(t.statusId) === String(s) || 
          t.status.toLowerCase() === s.toLowerCase()
        );
        if (!matchStatus) return false;
      } else {
        // Status Category (Open vs Closed in OP)
        const sName = (t.status || '').toLowerCase().trim();
        const isOpenStatus = ['new', 'in progress', 'assigned', 'reopened', 'feedback', 'scheduled', 'developing', 'in development'].includes(sName);
        const isClosed = (!isOpenStatus) && (closedStatusIds.has(String(t.statusId)) || ['closed', 'tested', 'rejected', 'resolved'].includes(sName));

        if (filterStatusCategory === 'open' && isClosed) {
          return false;
        } else if (filterStatusCategory === 'closed' && !isClosed) {
          return false;
        }
      }

      // 4. Multiple Projects Filter (Robust Fuzzy + ID matching)
      if (filterProjects.length > 0) {
        const matchProject = filterProjects.some(p => {
          if (String(t.projectId) === String(p)) return true;
          if (t.project.toLowerCase() === p.toLowerCase()) return true;
          const normTicketProj = normalizeText(t.project);
          const normFilterProj = normalizeText(p);
          if (normTicketProj === normFilterProj) return true;
          if (normTicketProj.length > 5 && normFilterProj.length > 5) {
            if (normTicketProj.includes(normFilterProj) || normFilterProj.includes(normTicketProj)) return true;
          }
          const resolved = resolveProjectId(p);
          if (resolved && String(t.projectId) === String(resolved)) return true;
          return false;
        });
        if (!matchProject) return false;
      }

      // 5. Types Filter (Multi-Select)
      if (filterTypes.length > 0) {
        const matchType = filterTypes.some(ft => 
          String(t.typeId) === String(ft) || 
          (t.type && t.type.toLowerCase() === ft.toLowerCase())
        );
        if (!matchType) return false;
      }

      // 6. Assignees Filter (Multi-Select)
      if (filterAssignees.length > 0) {
        const matchAssignee = filterAssignees.some(fa => {
          if (fa === 'me') {
            return (currentUser?.id && String(t.assigneeId) === String(currentUser.id)) || 
                   t.assignee.toLowerCase() === 'me' || 
                   (currentUser?.name && t.assignee.toLowerCase().includes(currentUser.name.toLowerCase())) ||
                   t.assignee.toLowerCase().includes('nibas');
          }
          if (fa === 'unassigned') {
            return !t.assignee || t.assignee.toLowerCase() === 'unassigned' || t.assignee.trim() === '';
          }
          return String(t.assigneeId) === String(fa) || t.assignee.toLowerCase() === fa.toLowerCase();
        });
        if (!matchAssignee) return false;
      }

      // 7. Priorities Filter (Multi-Select)
      if (filterPriorities.length > 0) {
        const matchPriority = filterPriorities.some(fp =>
          String(t.priorityId) === String(fp) ||
          t.priority.toLowerCase() === fp.toLowerCase()
        );
        if (!matchPriority) return false;
      }

      return true;
    });

    // Sort order
    result.sort((a, b) => {
      if (a.starred && !b.starred) return -1;
      if (!a.starred && b.starred) return 1;

      if (sortBy === 'updated_desc') {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
      if (sortBy === 'updated_asc') {
        return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      }
      if (sortBy === 'id_desc') {
        return b.id - a.id;
      }
      if (sortBy === 'id_asc') {
        return a.id - b.id;
      }
      return 0;
    });

    return result;
  }, [
    tickets, 
    searchQuery, 
    filterStarredOnly, 
    filterStatusCategory, 
    closedStatusIds, 
    filterStatuses, 
    filterProjects, 
    resolveProjectId, 
    filterTypes, 
    filterAssignees, 
    currentUser, 
    filterPriorities, 
    sortBy
  ]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterProjects.length > 0) count++;
    if (filterStatusCategory !== 'open') count++;
    if (filterStatuses.length > 0) count++;
    if (filterTypes.length > 0) count++;
    if (filterAssignees.length > 0) count++;
    if (filterPriorities.length > 0) count++;
    if (filterStarredOnly) count++;
    return count;
  }, [filterProjects, filterStatusCategory, filterStatuses, filterTypes, filterAssignees, filterPriorities, filterStarredOnly]);

  // --- Efforts Calculations & Global Effort Search ---
  const weekDays = useMemo(() => getWorkWeekDays(weekOffset), [weekOffset]);
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const hoursPerDateMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const eff of allEfforts) {
      if (eff.spentOn) {
        map[eff.spentOn] = +( (map[eff.spentOn] || 0) + eff.hours ).toFixed(2);
      }
    }
    return map;
  }, [allEfforts]);

  const todayTotalHours = useMemo(() => hoursPerDateMap[todayStr] || 0, [hoursPerDateMap, todayStr]);
  const weeklyTotalHours = useMemo(() => {
    return weekDays.reduce((sum, d) => sum + (hoursPerDateMap[d.dateStr] || 0), 0);
  }, [weekDays, hoursPerDateMap]);
  const currentMonthStr = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const monthTotalHours = useMemo(() => {
    return allEfforts.reduce((sum, eff) => {
      if (eff.spentOn && eff.spentOn.startsWith(currentMonthStr)) {
        return +(sum + eff.hours).toFixed(2);
      }
      return sum;
    }, 0);
  }, [allEfforts, currentMonthStr]);

  const effortsForSelectedDate = useMemo(() => {
    return allEfforts.filter(e => e.spentOn === selectedEffortDate);
  }, [allEfforts, selectedEffortDate]);

  // Global search across all efforts (subject, comment, #ID, date, OR full OpenProject URL)
  const searchedEfforts = useMemo(() => {
    const raw = effortSearchQuery.trim();
    if (!raw) return null;
    const extractedId = extractTicketIdFromUrlOrText(raw);
    const cleanId = raw.replace(/^#/, '').toLowerCase();
    const q = raw.toLowerCase();
    return allEfforts.filter(e => 
      (extractedId && e.workPackageId === extractedId) ||
      String(e.workPackageId).includes(cleanId) ||
      (e.ticketSubject && e.ticketSubject.toLowerCase().includes(q)) ||
      (e.comment && e.comment.toLowerCase().includes(q)) ||
      (e.spentOn && e.spentOn.includes(q))
    );
  }, [allEfforts, effortSearchQuery]);

  const pendingCount = useMemo(() => {
    const queueCount = syncQueue.length;
    const localPendingTickets = tickets.filter(t => t.pendingSync).length;
    const localPendingEfforts = allEfforts.filter(e => e.pendingSync).length;
    return Math.max(queueCount, localPendingTickets + localPendingEfforts);
  }, [syncQueue, tickets, allEfforts]);

  const handleProcessSingleSyncItem = async (item: SyncQueueItem) => {
    try {
      await syncService.processQueueItem(item);
      showEphemeralNotice(`Synced item to OpenProject`);
      await loadLocalData();
    } catch (err: any) {
      showEphemeralNotice(`Failed to sync item: ${err?.message || 'Error'}`);
    }
  };

  const handleDiscardSyncItem = async (item: SyncQueueItem) => {
    await db.removeSyncItem(item.id);
    if (item.type === 'UPDATE_STATUS' || item.type === 'UPDATE_ASSIGNEE') {
      const t = await db.getTicket(Number(item.payload.ticketId));
      if (t) {
        await db.putTicket({ ...t, pendingSync: false });
      }
    } else if (item.type === 'LOG_TIME') {
      const allEff = await db.getAllEfforts();
      const match = allEff.find(e => String(e.workPackageId) === String(item.payload.ticketId) && e.spentOn === item.payload.date && e.pendingSync);
      if (match) {
        await db.deleteEffort(match.id);
      }
    } else if (item.type === 'UPDATE_TIME') {
      const eff = allEfforts.find(e => e.id === item.payload.id);
      if (eff) {
        await db.putEffort({ ...eff, pendingSync: false });
      }
    }
    showEphemeralNotice('Discarded pending change');
    await loadLocalData();
  };

  // Quick reset filters helper
  const handleResetFilters = () => {
    setFilterProjects([]);
    setFilterStatuses([]);
    setFilterStatusCategory('open');
    setFilterTypes([]);
    setFilterAssignees([]);
    setFilterPriorities([]);
    setFilterStarredOnly(false);
    setActiveViewId('custom');
  };

  // --- Responsive SaaS Website Workspace ---
  return (
    <div className="min-h-screen bg-[#090d16] text-[#f1f5f9] selection:bg-blue-600/30 font-sans relative overflow-hidden">
      <DesktopWorkspace
          tickets={tickets}
          filteredTickets={filteredTickets}
          starredTickets={starredTickets}
          statuses={statuses}
          types={types}
          displayPriorities={displayPriorities}
          projectsList={projectsList}
          projectAssigneesMap={projectAssigneesMap}
          currentUser={currentUser}
          selectedTicketId={selectedTicketId}
          setSelectedTicketId={setSelectedTicketId}
          selectedTicket={selectedTicket}
          selectedTicketStats={selectedTicketStats}
          ticketEffortsList={ticketEffortsList}
          isLoadingTicketEfforts={isLoadingTicketEfforts}
          ticketActivities={ticketActivities}
          isLoadingActivities={isLoadingActivities}
          allEfforts={allEfforts}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          isSearchingRemote={isSearchingRemote}
          handleRemoteSearch={handleRemoteSearch}
          filterProjects={filterProjects}
          setFilterProjects={setFilterProjects}
          filterStatuses={filterStatuses}
          setFilterStatuses={setFilterStatuses}
          filterStatusCategory={filterStatusCategory}
          setFilterStatusCategory={setFilterStatusCategory}
          filterTypes={filterTypes}
          setFilterTypes={setFilterTypes}
          filterAssignees={filterAssignees}
          setFilterAssignees={setFilterAssignees}
          filterPriorities={filterPriorities}
          setFilterPriorities={setFilterPriorities}
          filterStarredOnly={filterStarredOnly}
          setFilterStarredOnly={setFilterStarredOnly}
          sortBy={sortBy}
          setSortBy={setSortBy}
          activeFilterCount={activeFilterCount}
          resetFilters={handleResetFilters}
          savedViews={savedViews}
          activeViewId={activeViewId}
          applySavedView={applySavedView}
          todayTotalHours={todayTotalHours}
          weeklyTotalHours={weeklyTotalHours}
          monthTotalHours={monthTotalHours}
          syncQueue={syncQueue}
          handleProcessSingleSyncItem={handleProcessSingleSyncItem}
          handleDiscardSyncItem={handleDiscardSyncItem}
          hoursPerDateMap={hoursPerDateMap}
          weekDays={weekDays}
          weekOffset={weekOffset}
          setWeekOffset={setWeekOffset}
          selectedEffortDate={selectedEffortDate}
          setSelectedEffortDate={setSelectedEffortDate}
          effortsForSelectedDate={effortsForSelectedDate}
          effortSearchQuery={effortSearchQuery}
          setEffortSearchQuery={setEffortSearchQuery}
          searchedEfforts={searchedEfforts}
          isSyncing={isSyncing}
          isOnline={isOnline}
          lastSyncText={lastSyncText}
          pendingCount={pendingCount}
          handleSync={handleSync}
          handleToggleStar={handleToggleStar}
          handleUpdateStatus={handleUpdateStatus}
          handleUpdateAssignee={handleUpdateAssignee}
          handleDeleteEffort={(entry) => {
            const eff = allEfforts.find(e => e.id === entry.id || e.id.replace(/^pending-/, '') === entry.id);
            if (eff) {
              handleDeleteEffort(eff);
            } else {
              handleDeleteTicketHistoryEntry(entry as any);
            }
          }}
          handleEditEffort={(entry) => {
            const eff = allEfforts.find(e => e.id === entry.id);
            if (eff) {
              handleOpenEditEffort(eff);
            } else {
              handleOpenEditEffort({
                id: entry.id,
                workPackageId: entry.workPackageId,
                ticketSubject: entry.ticketSubject,
                hours: entry.hours,
                comment: entry.comment,
                spentOn: entry.spentOn,
                createdAt: new Date().toISOString()
              });
            }
          }}
          setIsAddEffortModalOpen={setIsAddEffortModalOpen}
          setZoomedImageUrl={setZoomedImageUrl}
          opUrl={opUrl}
          opSheetUrl={opSheetUrl}
          isSyncingSheet={isSyncingSheet}
          isRestoringSheet={isRestoringSheet}
          sheetLastSyncTime={sheetLastSyncTime}
          handleSyncWithSheet={handleSyncAllToSheet}
          handleRestoreFromSheet={handleRestoreFromSheet}
          setIsSaveViewModalOpen={setIsSaveViewModalOpen}
          onQuickLogEffortSubmit={async (ticketId, hoursStr, comment) => {
            const h = parseFloat(hoursStr);
            if (!isNaN(h) && h > 0) {
              const target = tickets.find(t => t.id === ticketId);
              await handleLogEffortDirect(
                ticketId,
                target?.subject || `Ticket #${ticketId}`,
                h,
                new Date().toISOString().split('T')[0],
                comment
              );
            }
          }}
          onAddCommentSubmit={async (ticketId, comment) => {
            if (!ticketId || !comment.trim()) return;
            const target = tickets.find(t => t.id === ticketId);
            try {
              await OpenProjectService.addComment(String(ticketId), comment, target?.lockVersion ?? 1);
              showEphemeralNotice('Comment posted to OpenProject');
              await fetchTicketActivities(ticketId);
            } catch (err: any) {
              if (is409Conflict(err)) {
                try {
                  console.warn(`[Comment] 409 Conflict detected for ticket #${ticketId}. Fetching latest ticket details and retrying...`);
                  const latest = await syncService.fetchAndCacheSingleTicket(ticketId);
                  if (latest) {
                    await OpenProjectService.addComment(String(ticketId), comment, latest.lockVersion);
                    showEphemeralNotice('Comment posted to OpenProject (conflict auto-resolved)');
                    await fetchTicketActivities(ticketId);
                    await loadLocalData();
                    return;
                  }
                } catch (retryErr: any) {
                  console.error('Failed to post comment after retry:', retryErr);
                }
              }
              console.error('Failed to post comment:', err);
              showEphemeralNotice('Failed to post comment');
            }
          }}
          onSaveSettings={async (url, key, sheet) => {
            await OpenProjectService.saveCredentials(url, key || opApiKey);
            setOpUrl(url);
            if (key) setOpApiKey(key);
            if (sheet) {
              sheetSyncService.setSheetUrl(sheet);
              setOpSheetUrl(sheet);
            }
            showEphemeralNotice('Settings saved successfully');
          }}
        />

        {/* Ephemeral Toast Notice */}
        {syncNotice && (
          <div className="fixed top-4 right-4 bg-blue-600 text-white text-xs px-4 py-2 rounded-xl shadow-xl font-medium flex items-center gap-3 z-50 animate-in slide-in-from-top-2">
            <span>{syncNotice}</span>
            <button onClick={() => setSyncNotice(null)} className="p-0.5 hover:opacity-80">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Direct Add Effort Modal (Search Tickets by Number & Log Effort) */}
        {isAddEffortModalOpen && (
          <div 
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150 overflow-hidden"
            onClick={() => setIsAddEffortModalOpen(false)}
          >
            <div 
              style={logEffortModalWindow.modalStyle}
              className="bg-[#0f172a] border border-[#1e293b] rounded-2xl w-full flex flex-col shadow-2xl overflow-hidden relative select-text"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-3.5 border-b border-[#1e293b] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-mono font-bold uppercase text-[#f1f5f9]">Log Time Effort</h3>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={logEffortModalWindow.toggleMaximize}
                    className="p-1 text-[#64748b] hover:text-white hover:bg-[#1e293b] rounded transition"
                    title={logEffortModalWindow.isMaximized ? "Restore window size" : "Maximize window"}
                  >
                    {logEffortModalWindow.isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => setIsAddEffortModalOpen(false)} className="p-1 text-[#64748b] hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-3.5 overflow-y-auto overscroll-contain">
                {/* 1. Ticket Selector / Searcher */}
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#64748b] mb-1">
                    Select Work Package
                  </label>

                  {effortSelectedTicket ? (
                    <div className="p-3.5 bg-[#090d16] border border-blue-500/30 rounded-xl space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center flex-wrap gap-1.5">
                          <span className="font-mono text-xs font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                            #{effortSelectedTicket.id}
                          </span>
                          {effortSelectedTicket.type && (
                            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                              {effortSelectedTicket.type}
                            </span>
                          )}
                          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {effortSelectedTicket.status}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEffortSelectedTicket(null);
                            setEffortTicketFetchError(null);
                          }}
                          className="text-xs text-blue-400 hover:text-blue-300 hover:underline shrink-0 font-mono font-medium"
                        >
                          Change
                        </button>
                      </div>

                      <p className="text-xs font-semibold text-[#f1f5f9] leading-snug">
                        {effortSelectedTicket.subject}
                      </p>

                      <div className="pt-2 border-t border-[#1e293b] grid grid-cols-2 gap-2 text-[11px] font-mono">
                        <div className="flex items-center gap-1.5 text-[#94a3b8] min-w-0">
                          <FolderKanban className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span className="truncate" title={effortSelectedTicket.project}>
                            {effortSelectedTicket.project}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[#94a3b8] min-w-0">
                          <User className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span className="truncate" title={effortSelectedTicket.assignee}>
                            {effortSelectedTicket.assignee || 'Unassigned'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[#94a3b8]">
                          <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>
                            Spent: <strong className="text-emerald-400">{effortSelectedTicket.spentTime ? `${parseDurationToHours(effortSelectedTicket.spentTime)}h` : '0h'}</strong>
                            {effortSelectedTicket.estimatedTime && (
                              <span className="text-[#64748b]"> / {parseDurationToHours(effortSelectedTicket.estimatedTime)}h</span>
                            )}
                          </span>
                        </div>
                        {effortSelectedTicket.priority && (
                          <div className="flex items-center gap-1.5 text-[#94a3b8]">
                            <span className="text-[#64748b]">Priority:</span>
                            <span className="text-slate-300 font-medium">{effortSelectedTicket.priority}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (() => {
                    const effortTargetId = extractTicketIdFromUrlOrText(effortTicketSearch.trim()) || parseInt(effortTicketSearch.trim().replace(/^#/, ''), 10);
                    const hasValidTargetId = !isNaN(effortTargetId) && effortTargetId > 0;

                    return (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <div className="relative flex-1">
                            <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#64748b]" />
                            <input
                              type="text"
                              value={effortTicketSearch}
                              onChange={e => {
                                setEffortTicketSearch(e.target.value);
                                setEffortTicketFetchError(null);
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  if (hasValidTargetId) {
                                    fetchTicketForEffort(effortTargetId);
                                  } else if (effortTicketSearch.trim()) {
                                    handleRemoteSearchForEffort(effortTicketSearch.trim());
                                  }
                                }
                              }}
                              placeholder="Enter ticket #ID, URL, or search title..."
                              className="w-full bg-[#090d16] text-xs text-[#f1f5f9] rounded-xl pl-9 pr-8 py-2 border border-[#1e293b] focus:outline-none focus:border-blue-500 placeholder:text-[#64748b]"
                            />
                            {effortTicketSearch && (
                              <button 
                                type="button"
                                onClick={() => {
                                  setEffortTicketSearch('');
                                  setEffortTicketFetchError(null);
                                }}
                                className="absolute right-2.5 top-2 text-[#64748b] hover:text-white p-0.5"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {hasValidTargetId ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                disabled={isFetchingEffortTicket}
                                onClick={() => fetchTicketForEffort(effortTargetId)}
                                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-mono font-medium flex items-center gap-1.5 transition shadow-sm"
                              >
                                {isFetchingEffortTicket ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Fetch Details'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const targetUrl = `${opUrl.replace(/\/$/, '')}/work_packages/${effortTargetId}`;
                                  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
                                    chrome.tabs.create({ url: targetUrl });
                                    try { window.close(); } catch(e) {}
                                  } else {
                                    window.open(targetUrl, '_blank', 'noopener,noreferrer');
                                    try { window.close(); } catch(e) {}
                                  }
                                }}
                                className="px-3 py-2 bg-[#1e293b] hover:bg-[#283548] text-slate-200 border border-slate-700 rounded-xl text-xs font-mono font-medium flex items-center gap-1.5 transition"
                                title="Open work package directly in OpenProject tab"
                              >
                                <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                                <span>Open in OP</span>
                              </button>
                            </div>
                          ) : effortTicketSearch.trim().length >= 2 ? (
                            <button
                              type="button"
                              disabled={isFetchingEffortTicket}
                              onClick={() => handleRemoteSearchForEffort(effortTicketSearch.trim())}
                              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 rounded-xl text-xs font-mono font-medium shrink-0 flex items-center gap-1.5 transition"
                            >
                              {isFetchingEffortTicket ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Search Server'}
                            </button>
                          ) : null}
                        </div>

                        {isFetchingEffortTicket && (
                          <div className="p-3 bg-[#090d16] border border-blue-500/20 rounded-xl flex items-center justify-center gap-2 text-xs font-mono text-blue-400">
                            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                            <span>Querying OpenProject server...</span>
                          </div>
                        )}

                        {effortTicketFetchError && (
                          <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-xl flex items-start gap-2 text-xs text-red-300">
                            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <span>{effortTicketFetchError}</span>
                            </div>
                          </div>
                        )}

                        <div className="max-h-56 overflow-y-auto divide-y divide-[#1e293b] border border-[#1e293b] rounded-xl bg-[#090d16]">
                          {hasValidTargetId && (
                            <div 
                              onClick={() => fetchTicketForEffort(effortTargetId)}
                              className="p-2.5 bg-blue-950/20 hover:bg-blue-900/30 cursor-pointer transition text-xs flex items-center justify-between text-blue-300 border-b border-[#1e293b]"
                            >
                              <div className="flex items-center gap-1.5">
                                <Search className="w-3.5 h-3.5 text-blue-400" />
                                <span className="font-mono font-semibold">Query OpenProject for #{effortTargetId}</span>
                              </div>
                              <span className="text-[10px] font-mono text-blue-400">Fetch details &rarr;</span>
                            </div>
                          )}

                          {!effortTicketSearch && (
                            <div className="px-3 py-1.5 bg-[#0d1322] border-b border-[#1e293b] text-[10px] font-mono text-[#64748b] uppercase tracking-wider flex items-center justify-between">
                              <span>Tracked Work Packages</span>
                              <span className="text-emerald-400 font-bold">{effortTicketSearchResults.length} available</span>
                            </div>
                          )}

                          {effortTicketSearchResults.map(t => {
                            const hoursLoggedOnTicket = allEfforts
                              .filter(e => e.workPackageId === t.id)
                              .reduce((sum, e) => sum + e.hours, 0);
                            return (
                              <div
                                key={t.id}
                                onClick={() => setEffortSelectedTicket(t)}
                                className="p-2.5 hover:bg-[#1e293b] cursor-pointer transition text-xs flex items-center justify-between group"
                              >
                                <div className="truncate pr-2">
                                  <span className="font-mono font-bold text-blue-400 mr-1.5">#{t.id}</span>
                                  <span className="text-slate-300 font-medium">{t.subject}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {hoursLoggedOnTicket > 0 && (
                                    <span className="text-[10px] font-mono font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                      {hoursLoggedOnTicket.toFixed(1)}h
                                    </span>
                                  )}
                                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                    {t.status}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const targetUrl = `${opUrl.replace(/\/$/, '')}/work_packages/${t.id}`;
                                      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
                                        chrome.tabs.create({ url: targetUrl });
                                        try { window.close(); } catch(err) {}
                                      } else {
                                        window.open(targetUrl, '_blank', 'noopener,noreferrer');
                                        try { window.close(); } catch(err) {}
                                      }
                                    }}
                                    className="p-1 text-[#64748b] hover:text-white opacity-60 group-hover:opacity-100 transition"
                                    title="Open directly in OpenProject"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}

                          {effortTicketSearchResults.length === 0 && !isFetchingEffortTicket && effortTicketSearch && (
                            <div className="p-4 text-center text-xs text-[#64748b] space-y-2">
                              <div>No tickets found matching "{effortTicketSearch}".</div>
                              {hasValidTargetId ? (
                                <button
                                  type="button"
                                  disabled={isFetchingEffortTicket}
                                  onClick={() => fetchTicketForEffort(effortTargetId)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-lg font-mono text-xs font-medium transition"
                                >
                                  <Search className="w-3.5 h-3.5" />
                                  Query Ticket #{effortTargetId} from OpenProject
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isFetchingEffortTicket}
                                  onClick={() => handleRemoteSearchForEffort(effortTicketSearch.trim())}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-lg font-mono text-xs font-medium transition"
                                >
                                  <Search className="w-3.5 h-3.5" />
                                  Search OpenProject for "{effortTicketSearch.trim()}"
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* 2. Hours Presets & Custom Input */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-mono uppercase text-[#64748b]">
                      Hours Spent
                    </label>
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      {parseFloat(effortModalHours) > 0 ? `${parseFloat(effortModalHours).toFixed(1)}h` : '0h'}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 mb-2">
                    {['0.5', '1.0', '1.5', '2.0', '3.0', '4.0', '6.0', '8.0'].map(hrs => (
                      <button
                        key={hrs}
                        type="button"
                        onClick={() => setEffortModalHours(hrs)}
                        className={`py-1.5 rounded-lg text-xs font-mono font-semibold transition ${
                          effortModalHours === hrs
                            ? 'bg-emerald-600 text-white'
                            : 'bg-[#090d16] text-[#94a3b8] border border-[#1e293b] hover:border-slate-600'
                        }`}
                      >
                        +{hrs}h
                      </button>
                    ))}
                  </div>

                  <input
                    type="number"
                    step="0.25"
                    value={effortModalHours}
                    onChange={e => setEffortModalHours(e.target.value)}
                    placeholder="Custom hours (e.g. 1.25)"
                    className="w-full bg-[#090d16] border border-[#1e293b] rounded-xl px-3 py-2 text-xs font-mono text-[#f1f5f9] focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* 3. Spent On Date */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-mono uppercase text-[#64748b]">
                      Date Spent
                    </label>
                    <div className="flex gap-1.5 text-[10px]">
                      <button 
                        type="button" 
                        onClick={() => setEffortModalDate(todayStr)}
                        className={`px-2 py-0.5 rounded font-mono ${effortModalDate === todayStr ? 'bg-blue-600 text-white' : 'text-blue-400 hover:underline'}`}
                      >
                        Today
                      </button>
                      <button 
                        type="button" 
                        onClick={() => {
                          const y = new Date();
                          y.setDate(y.getDate() - 1);
                          setEffortModalDate(y.toISOString().split('T')[0]);
                        }}
                        className="text-[#64748b] hover:text-white font-mono"
                      >
                        Yesterday
                      </button>
                    </div>
                  </div>
                  <input
                    type="date"
                    value={effortModalDate}
                    onChange={e => setEffortModalDate(e.target.value)}
                    className="w-full bg-[#090d16] border border-[#1e293b] rounded-xl px-3 py-2 text-xs font-mono text-[#f1f5f9] focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* 4. Comment / Work Description */}
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#64748b] mb-1">
                    Comment / Description
                  </label>
                  <input
                    type="text"
                    value={effortModalComment}
                    onChange={e => setEffortModalComment(e.target.value)}
                    placeholder="What did you work on? (e.g. Bugfix, code review, meeting)"
                    className="w-full bg-[#090d16] border border-[#1e293b] rounded-xl px-3 py-2 text-xs text-[#f1f5f9] focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Submit Action */}
                <button
                  type="button"
                  disabled={!effortSelectedTicket || parseFloat(effortModalHours) <= 0 || isLoggingEffort}
                  onClick={() => {
                    if (effortSelectedTicket) {
                      handleLogEffortDirect(
                        effortSelectedTicket.id,
                        effortSelectedTicket.subject,
                        parseFloat(effortModalHours),
                        effortModalDate,
                        effortModalComment
                      );
                    }
                  }}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold font-mono flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-900/30"
                >
                  <Clock className="w-4 h-4" />
                  <span>{isLoggingEffort ? 'Logging Effort...' : `Confirm & Log ${parseFloat(effortModalHours) || 0}h`}</span>
                </button>
              </div>

              {/* Corner Resize Grip */}
              {!logEffortModalWindow.isMaximized && (
                <div
                  onMouseDown={logEffortModalWindow.handleResizeStart}
                  onDoubleClick={logEffortModalWindow.resetSize}
                  className="absolute bottom-1 right-1 w-4 h-4 cursor-se-resize flex items-end justify-end p-0.5 text-[#64748b] hover:text-emerald-400 active:text-emerald-500 transition-colors z-20 group select-none"
                  title="Drag corner to resize window (Double-click to reset)"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" className="stroke-current fill-none stroke-2 opacity-60 group-hover:opacity-100">
                    <line x1="8" y1="2" x2="2" y2="8" />
                    <line x1="8" y1="5" x2="5" y2="8" />
                    <line x1="8" y1="8" x2="8" y2="8" />
                  </svg>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Edit Existing Logged Effort Modal */}
        {editingEffort && (
          <div 
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150 overflow-hidden"
            onClick={() => setEditingEffort(null)}
          >
            <div 
              style={editEffortModalWindow.modalStyle}
              className="bg-[#0f172a] border border-[#1e293b] rounded-2xl w-full flex flex-col shadow-2xl overflow-hidden relative select-text"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-3.5 border-b border-[#1e293b] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-blue-400" />
                  <h3 className="text-xs font-mono font-bold uppercase text-[#f1f5f9]">Edit Logged Effort</h3>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={editEffortModalWindow.toggleMaximize}
                    className="p-1 text-[#64748b] hover:text-white hover:bg-[#1e293b] rounded transition"
                    title={editEffortModalWindow.isMaximized ? "Restore window size" : "Maximize window"}
                  >
                    {editEffortModalWindow.isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => setEditingEffort(null)} className="p-1 text-[#64748b] hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-3.5 overflow-y-auto overscroll-contain">
                <div className="p-3 bg-[#090d16] border border-[#1e293b] rounded-xl space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-blue-400">
                      #{editingEffort.workPackageId}
                    </span>
                    <span className="text-xs text-[#f1f5f9] truncate font-medium">
                      {editingEffort.ticketSubject || 'Work Package'}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-[#64748b]">
                    Original: {editingEffort.hours}h on {editingEffort.spentOn}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-mono uppercase text-[#64748b]">
                      Hours Spent
                    </label>
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      {parseFloat(editEffortHours) > 0 ? `${parseFloat(editEffortHours).toFixed(1)}h` : '0h'}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 mb-2">
                    {['0.5', '1.0', '1.5', '2.0', '3.0', '4.0', '6.0', '8.0'].map(hrs => (
                      <button
                        key={hrs}
                        type="button"
                        onClick={() => setEditEffortHours(hrs)}
                        className={`py-1.5 rounded-lg text-xs font-mono font-semibold transition ${
                          editEffortHours === hrs
                            ? 'bg-emerald-600 text-white'
                            : 'bg-[#090d16] text-[#94a3b8] border border-[#1e293b] hover:border-slate-600'
                        }`}
                      >
                        +{hrs}h
                      </button>
                    ))}
                  </div>

                  <input
                    type="number"
                    step="0.25"
                    value={editEffortHours}
                    onChange={e => setEditEffortHours(e.target.value)}
                    placeholder="Custom hours (e.g. 1.25)"
                    className="w-full bg-[#090d16] border border-[#1e293b] rounded-xl px-3 py-2 text-xs font-mono text-[#f1f5f9] focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#64748b] mb-1">
                    Date Spent
                  </label>
                  <input
                    type="date"
                    value={editEffortDate}
                    onChange={e => setEditEffortDate(e.target.value)}
                    className="w-full bg-[#090d16] border border-[#1e293b] rounded-xl px-3 py-2 text-xs font-mono text-[#f1f5f9] focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#64748b] mb-1">
                    Comment / Description
                  </label>
                  <input
                    type="text"
                    value={editEffortComment}
                    onChange={e => setEditEffortComment(e.target.value)}
                    placeholder="What did you work on?"
                    className="w-full bg-[#090d16] border border-[#1e293b] rounded-xl px-3 py-2 text-xs text-[#f1f5f9] focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isDeletingEffort || isSavingEditEffort}
                    onClick={() => {
                      if (window.confirm(`Delete this ${editingEffort.hours}h effort entry?`)) {
                        handleDeleteEffort(editingEffort);
                      }
                    }}
                    className="p-3 bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 text-red-400 rounded-xl text-xs font-mono font-medium flex items-center justify-center gap-1.5 transition"
                    title="Delete Effort Log"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{isDeletingEffort ? 'Deleting...' : 'Delete'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={parseFloat(editEffortHours) <= 0 || isSavingEditEffort || isDeletingEffort}
                    onClick={handleSaveEditEffort}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold font-mono flex items-center justify-center gap-2 transition shadow-lg shadow-blue-900/30"
                  >
                    {isSavingEditEffort ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    <span>{isSavingEditEffort ? 'Saving Changes...' : 'Save Changes'}</span>
                  </button>
                </div>
              </div>

              {/* Corner Resize Grip */}
              {!editEffortModalWindow.isMaximized && (
                <div
                  onMouseDown={editEffortModalWindow.handleResizeStart}
                  onDoubleClick={editEffortModalWindow.resetSize}
                  className="absolute bottom-1 right-1 w-4 h-4 cursor-se-resize flex items-end justify-end p-0.5 text-[#64748b] hover:text-blue-400 active:text-blue-500 transition-colors z-20 group select-none"
                  title="Drag corner to resize window (Double-click to reset)"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" className="stroke-current fill-none stroke-2 opacity-60 group-hover:opacity-100">
                    <line x1="8" y1="2" x2="2" y2="8" />
                    <line x1="8" y1="5" x2="5" y2="8" />
                    <line x1="8" y1="8" x2="8" y2="8" />
                  </svg>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Save View Modal */}
        {isSaveViewModalOpen && (
          <div 
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in overflow-hidden"
            onClick={() => setIsSaveViewModalOpen(false)}
          >
            <div 
              style={saveViewModalWindow.modalStyle}
              className="bg-[#0f172a] border border-[#1e293b] rounded-2xl w-full flex flex-col p-4 space-y-3.5 shadow-2xl overflow-y-auto relative select-text"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[#1e293b] pb-2 shrink-0">
                <div className="flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-blue-400" />
                  <h3 className="text-xs font-mono font-bold uppercase text-[#f1f5f9]">Save Current View</h3>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={saveViewModalWindow.toggleMaximize}
                    className="p-1 text-[#64748b] hover:text-white hover:bg-[#1e293b] rounded transition"
                    title={saveViewModalWindow.isMaximized ? "Restore window size" : "Maximize window"}
                  >
                    {saveViewModalWindow.isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => setIsSaveViewModalOpen(false)} className="text-[#64748b] hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase text-[#64748b] mb-1">View Name</label>
                <input
                  type="text"
                  value={newViewName}
                  onChange={e => setNewViewName(e.target.value)}
                  placeholder="e.g. My Sprint Bugs..."
                  className="w-full bg-[#090d16] text-xs text-[#f1f5f9] border border-[#1e293b] rounded-xl p-2.5 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-between p-2.5 bg-[#090d16] border border-[#1e293b] rounded-xl">
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-400 fill-current" />
                  <span className="text-xs text-[#f1f5f9]">Set as Favorite (Pin to quick bar)</span>
                </div>
                <input
                  type="checkbox"
                  checked={newViewFavorite}
                  onChange={e => setNewViewFavorite(e.target.checked)}
                  className="w-4 h-4 rounded border-[#1e293b] text-blue-600 focus:ring-0 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-2.5 bg-[#090d16] border border-[#1e293b] rounded-xl">
                <div className="flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-emerald-400" />
                  <div>
                    <span className="text-xs text-[#f1f5f9] block font-medium">Set as Default / Main View</span>
                    <span className="text-[10px] text-[#64748b] block">Opens automatically on startup</span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={newViewDefault}
                  onChange={e => setNewViewDefault(e.target.checked)}
                  className="w-4 h-4 rounded border-[#1e293b] text-emerald-600 focus:ring-0 cursor-pointer"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setIsSaveViewModalOpen(false)}
                  className="flex-1 py-2 bg-[#1e293b] hover:bg-[#334155] text-xs text-[#f1f5f9] rounded-xl font-medium transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveCurrentAsNewView}
                  disabled={!newViewName.trim()}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs text-white rounded-xl font-medium transition"
                >
                  Save View
                </button>
              </div>

              {/* Corner Resize Grip */}
              {!saveViewModalWindow.isMaximized && (
                <div
                  onMouseDown={saveViewModalWindow.handleResizeStart}
                  onDoubleClick={saveViewModalWindow.resetSize}
                  className="absolute bottom-1 right-1 w-4 h-4 cursor-se-resize flex items-end justify-end p-0.5 text-[#64748b] hover:text-blue-400 active:text-blue-500 transition-colors z-20 group select-none"
                  title="Drag corner to resize window (Double-click to reset)"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" className="stroke-current fill-none stroke-2 opacity-60 group-hover:opacity-100">
                    <line x1="8" y1="2" x2="2" y2="8" />
                    <line x1="8" y1="5" x2="5" y2="8" />
                    <line x1="8" y1="8" x2="8" y2="8" />
                  </svg>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Click-to-Zoom Image Lightbox Modal */}
        {zoomedImageUrl && (
          <div 
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={() => setZoomedImageUrl(null)}
          >
            <div className="absolute top-4 right-4 flex items-center gap-2">
              <a 
                href={zoomedImageUrl} 
                target="_blank" 
                rel="noreferrer" 
                onClick={e => e.stopPropagation()}
                className="p-2 bg-[#1e293b] text-slate-200 rounded-full hover:bg-slate-700 transition"
                title="Open original image in new tab"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
              <button 
                onClick={() => setZoomedImageUrl(null)}
                className="p-2 bg-[#1e293b] text-slate-200 rounded-full hover:bg-slate-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div 
              className="max-w-full max-h-[85vh] overflow-auto flex items-center justify-center p-2"
              onClick={e => e.stopPropagation()}
            >
              <img 
                src={zoomedImageUrl} 
                alt="Enlarged attachment" 
                className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl border border-[#334155]"
              />
            </div>
            <span className="text-[11px] text-[#94a3b8] font-mono mt-2">Tap anywhere outside to close</span>
          </div>
        )}
      </div>
    );
}
