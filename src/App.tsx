import { useEffect, useState, useMemo, useCallback } from 'react';
import { 
  Search, 
  Settings, 
  ArrowLeft, 
  ExternalLink, 
  RefreshCw, 
  Clock, 
  Calendar,
  X, 
  Clipboard, 
  FolderKanban, 
  Star, 
  Filter, 
  User, 
  SlidersHorizontal, 
  Globe, 
  Bookmark, 
  Trash2, 
  Plus, 
  ChevronDown, 
  ArrowUpDown,
  Check,
  Loader2,
  AlertCircle,
  Pencil,
  UploadCloud,
  DownloadCloud,
  Monitor
} from 'lucide-react';
import DesktopWorkspace from './components/DesktopWorkspace';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { 
  db, 
  type LocalTicket, 
  type LocalEffort, 
  type LookupItem, 
  type SavedView,
  DEFAULT_SAVED_VIEWS 
} from './services/db';
import { syncService, parseDurationToHours } from './services/syncService';
import { sheetSyncService } from './services/sheetSyncService';
import { OpenProjectService } from './services/OpenProjectService';
import { extractTicketIdFromUrlOrText } from './utils/urlParser';
import { DEFAULT_STATUSES, DEFAULT_TYPES, DEFAULT_PRIORITIES } from './constants/opDefaults';

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

function getWeekRangeLabel(days: { dateStr: string; label: string }[]): string {
  if (!days || days.length === 0) return '';
  const first = days[0];
  const last = days[days.length - 1];
  return `${first.label} – ${last.label}`;
}

/**
 * Preprocesses OpenProject HTML/Markdown description so images and markup render correctly.
 * Converts raw HTML <img ...> tags into Markdown image syntax ![alt](src) and strips figure wrappers.
 */
function preprocessOpenProjectMarkdown(content?: string): string {
  if (!content) return '';
  let processed = content;

  // Replace non-breaking spaces
  processed = processed.replace(/&nbsp;/g, ' ');

  // Convert raw HTML <img ...> tags into Markdown image syntax: ![alt](url)
  processed = processed.replace(/<img\b([^>]*?)>/gi, (_match, attrs) => {
    const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
    if (!srcMatch || !srcMatch[1]) return '';
    const src = srcMatch[1];
    const altMatch = attrs.match(/\balt=["']([^"']*)["']/i);
    const alt = (altMatch && altMatch[1]) ? altMatch[1] : 'Attachment';
    return `\n\n![${alt}](${src})\n\n`;
  });

  // Strip wrapping <figure> tags from CKEditor 5
  processed = processed.replace(/<\/?figure\b[^>]*>/gi, '');

  return processed;
}

/**
 * Component to securely load authenticated OpenProject attachment images,
 * converting them to blob URLs and enabling click-to-zoom.
 */
function AuthenticatedImage({
  src,
  alt,
  onZoom
}: {
  src?: string;
  alt?: string;
  onZoom: (url: string) => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (!src) {
      setIsLoading(false);
      setHasError(true);
      return;
    }

    if (src.startsWith('blob:') || src.startsWith('data:')) {
      setBlobUrl(src);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setHasError(false);

    OpenProjectService.getAttachmentBlobUrl(src)
      .then((url) => {
        if (isMounted) {
          setBlobUrl(url);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load attachment image:', src, err);
        if (isMounted) {
          setHasError(true);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [src]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4 my-2 bg-[#090d16] border border-[#1e293b] rounded-xl text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin mr-2 text-blue-400" />
        <span className="text-[11px] font-mono text-slate-400">Loading attachment image...</span>
      </div>
    );
  }

  if (hasError || !blobUrl) {
    return (
      <div className="flex items-center justify-center p-3 my-2 bg-red-950/20 border border-red-900/40 rounded-xl text-red-400 text-xs font-mono">
        <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
        <span>Failed to load image ({alt || 'Attachment'})</span>
      </div>
    );
  }

  return (
    <span className="block my-2 text-center group">
      <img
        src={blobUrl}
        alt={alt || 'Attachment'}
        onClick={() => onZoom(blobUrl)}
        className="max-w-full h-auto rounded-xl border border-[#1e293b] cursor-zoom-in hover:border-blue-500/60 hover:opacity-95 transition active:scale-[0.99] mx-auto block shadow-md"
        loading="lazy"
      />
      <span className="text-[10px] text-[#64748b] font-mono mt-1 block">Tap image to zoom</span>
    </span>
  );
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
  const [activeTab, setActiveTab] = useState<'tickets' | 'efforts'>('tickets');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRefreshingPWA, setIsRefreshingPWA] = useState(false);

  // Layout View Mode (PC Desktop vs Mobile Frame)
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('op_view_mode') : null;
    if (saved === 'desktop' || saved === 'mobile') return saved;
    return typeof window !== 'undefined' && window.innerWidth >= 1024 ? 'desktop' : 'mobile';
  });

  const handleSetViewMode = (mode: 'desktop' | 'mobile') => {
    setViewMode(mode);
    try {
      localStorage.setItem('op_view_mode', mode);
    } catch (_) {}
  };

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

  // Multi-Attribute Filter Drawer (OP-Style with Multi-Project & Multi-Status support)
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [filterProjects, setFilterProjects] = useState<string[]>([]); // Multiple selected projects
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]); // Multiple selected status IDs
  const [filterStatusCategory, setFilterStatusCategory] = useState<'all' | 'open' | 'closed'>('open');
  const [filterType, setFilterType] = useState<string>('');
  const [filterAssignee, setFilterAssignee] = useState<string>(''); // 'all' | 'me' | 'unassigned' | specific ID
  const [filterPriority, setFilterPriority] = useState<string>('');
  const [filterStarredOnly, setFilterStarredOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'updated_desc' | 'updated_asc' | 'id_desc' | 'id_asc' | 'priority'>('updated_desc');

  // Search states for pickers & tabs
  const [effortSearchQuery, setEffortSearchQuery] = useState('');
  const [viewSearchQuery, setViewSearchQuery] = useState('');

  // Searchable Assignee Picker Modal in Ticket Details
  const [isAssigneePickerOpen, setIsAssigneePickerOpen] = useState(false);
  const [assigneePickerSearch, setAssigneePickerSearch] = useState('');

  // Searchable Project Picker Modal in Filter Drawer
  const [isProjectPickerOpen, setIsProjectPickerOpen] = useState(false);
  const [projectPickerSearch, setProjectPickerSearch] = useState('');

  // Searchable Assignee Picker Modal in Filter Drawer
  const [isDrawerAssigneePickerOpen, setIsDrawerAssigneePickerOpen] = useState(false);
  const [drawerAssigneePickerSearch, setDrawerAssigneePickerSearch] = useState('');

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
  const [activeViewId, setActiveViewId] = useState<string>('sys_all_open');
  const [isViewsMenuOpen, setIsViewsMenuOpen] = useState(false);
  const [isSaveViewModalOpen, setIsSaveViewModalOpen] = useState(false);
  const [newViewName, setNewViewName] = useState('');

  // Mobile virtual keyboard height management via window.visualViewport
  const [visualViewportHeight, setVisualViewportHeight] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const handleResize = () => {
      if (window.visualViewport) {
        setVisualViewportHeight(Math.round(window.visualViewport.height));
      }
    };

    handleResize();
    window.visualViewport.addEventListener('resize', handleResize);
    window.visualViewport.addEventListener('scroll', handleResize);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
        window.visualViewport.removeEventListener('scroll', handleResize);
      }
    };
  }, []);
  const [newViewFavorite, setNewViewFavorite] = useState(true);
  const [newViewDefault, setNewViewDefault] = useState(false);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [lastSyncText, setLastSyncText] = useState<string>('Local DB');
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // Clipboard detection
  const [clipboardTicketId, setClipboardTicketId] = useState<number | null>(null);

  // Efforts & Weekly Tracking (5-Day Work Week, Mon-Fri)
  const [weekOffset, setWeekOffset] = useState(0);
  const [allEfforts, setAllEfforts] = useState<LocalEffort[]>([]);
  const [selectedEffortDate, setSelectedEffortDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [customEffortHours, setCustomEffortHours] = useState('');
  const [customEffortComment, setCustomEffortComment] = useState('');
  const [ticketEffortDate, setTicketEffortDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // Edit Existing Logged Effort Modal
  const [editingEffort, setEditingEffort] = useState<LocalEffort | null>(null);
  const [editEffortHours, setEditEffortHours] = useState('1.0');
  const [editEffortDate, setEditEffortDate] = useState('');
  const [editEffortComment, setEditEffortComment] = useState('');
  const [isSavingEditEffort, setIsSavingEditEffort] = useState(false);
  const [isDeletingEffort, setIsDeletingEffort] = useState(false);
  const [deletingEffortId, setDeletingEffortId] = useState<string | null>(null);

  // Settings
  const [opUrl, setOpUrl] = useState('https://openproject.fingent.net');
  const [opApiKey, setOpApiKey] = useState('');
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);

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

      // Auto-activate the default view (marked as default or saved in meta)
      const defaultMetaId = await db.getMeta<string>('defaultViewId');
      const targetDefault = views.find(v => v.id === defaultMetaId) || views.find(v => v.isDefault) || views[0];
      if (targetDefault) {
        setActiveViewId(targetDefault.id);
        const f = targetDefault.filters;
        setFilterStatusCategory(f.statusCategory || 'all');
        if (f.statusIds && f.statusIds.length > 0) setFilterStatuses(f.statusIds);
        else if (f.statusId) setFilterStatuses([f.statusId]);
        else setFilterStatuses([]);

        if (f.projects && f.projects.length > 0) setFilterProjects(f.projects);
        else if (f.project) setFilterProjects([f.project]);
        else if (f.projectId) setFilterProjects([f.projectId]);
        else setFilterProjects([]);

        setFilterType(f.type || '');
        setFilterAssignee(f.assignee || '');
        setFilterPriority(f.priority || '');
        setFilterStarredOnly(!!f.starredOnly);
        setSortBy(f.sortBy || 'updated_desc');
      }

      const efforts = await db.getAllEfforts();
      setAllEfforts(efforts);

      const lastSync = await db.getMeta<number>('lastSyncTime');
      if (lastSync) {
        const minsAgo = Math.floor((Date.now() - lastSync) / 60000);
        setLastSyncText(minsAgo <= 0 ? 'Just now' : `${minsAgo}m ago`);
      } else {
        setLastSyncText('Local DB');
      }

      // If local cache was completely cleared (zero tickets) but Google Sheet is configured,
      // auto-fetch and restore all static and dynamic data from the sheet!
      const sheetUrl = sheetSyncService.getSheetUrl();
      if (allTickets.length === 0 && sheetUrl) {
        sheetSyncService.restoreFromSheet().then((res) => {
          if (res.success && res.data) {
            if (res.data.tickets && res.data.tickets.length > 0) setTickets(res.data.tickets);
            if (res.data.projects && res.data.projects.length > 0) setProjectsList(res.data.projects);
            if (res.data.statuses && res.data.statuses.length > 0) setStatuses(res.data.statuses);
            if (res.data.types && res.data.types.length > 0) setTypes(res.data.types);
            if (res.data.views && res.data.views.length > 0) {
              setSavedViews(res.data.views);
              const sheetDefault = res.data.views.find((v: SavedView) => v.isDefault) || res.data.views[0];
              if (sheetDefault) {
                setActiveViewId(sheetDefault.id);
                const f = sheetDefault.filters;
                setFilterStatusCategory(f.statusCategory || 'all');
                if (f.statusIds && f.statusIds.length > 0) setFilterStatuses(f.statusIds);
                else if (f.statusId) setFilterStatuses([f.statusId]);
                else setFilterStatuses([]);

                if (f.projects && f.projects.length > 0) setFilterProjects(f.projects);
                else if (f.project) setFilterProjects([f.project]);
                else if (f.projectId) setFilterProjects([f.projectId]);
                else setFilterProjects([]);

                setFilterType(f.type || '');
                setFilterAssignee(f.assignee || '');
                setFilterPriority(f.priority || '');
                setFilterStarredOnly(!!f.starredOnly);
                setSortBy(f.sortBy || 'updated_desc');
              }
            }
            if (res.data.efforts && res.data.efforts.length > 0) setAllEfforts(res.data.efforts);
            if (res.data.currentUser) setCurrentUser(res.data.currentUser);
            setSheetLastSyncTime(sheetSyncService.getLastSyncTime());
            showEphemeralNotice('Restored data from Google Sheet backup');
          }
        }).catch(() => {});
      }
    } catch (err) {
      console.error('[DB] Failed to load local records:', err);
    }
  }, []);

  // --- Network Sync ---
  const handleSync = useCallback(async (showNotice = false) => {
    if (isSyncing) return;
    setIsSyncing(true);

    try {
      const res = await syncService.syncAll();
      await loadLocalData();

      if (res.success) {
        setLastSyncText('Just now');
        if (showNotice) showEphemeralNotice('Synced with OpenProject');
      } else if (res.reason === 'OFFLINE') {
        setLastSyncText('Offline (Local)');
        if (showNotice) showEphemeralNotice('Offline - using Local DB');
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

  // --- Clipboard Auto-Reader ---
  const checkClipboard = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        const extractedId = extractTicketIdFromUrlOrText(text);
        if (extractedId && extractedId !== selectedTicketId) {
          setClipboardTicketId(extractedId);
        }
      }
    } catch {
      // Permission not granted or window inactive
    }
  }, [selectedTicketId]);

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

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', checkClipboard);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', checkClipboard);
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
    setDeletingEffortId(effort.id);

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
      setDeletingEffortId(null);
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

    setDeletingEffortId(entry.id);

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
      setDeletingEffortId(null);
    }
  };

  // --- Save Connection Settings ---
  const handleSaveSettings = async () => {
    await OpenProjectService.saveCredentials(opUrl, opApiKey);
    sheetSyncService.setSheetUrl(opSheetUrl);
    setSettingsNotice('Credentials saved. Initiating sync...');
    setTimeout(() => setSettingsNotice(null), 3000);
    handleSync(true);
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

  // --- Force Refresh PWA & Clear Cache (Updates to Latest Version) ---
  const handleRefreshPWA = async () => {
    setIsRefreshingPWA(true);
    showEphemeralNotice('Updating PWA & clearing cache...');

    try {
      // 1. Clear all browser caches
      if (typeof window !== 'undefined' && 'caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }

      // 2. Unregister or update Service Workers
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.update().catch(() => {});
          await reg.unregister().catch(() => {});
        }
      }
    } catch (e) {
      console.warn('PWA cache clear error:', e);
    }

    // 3. Force reload latest version from server with cache busting
    setTimeout(() => {
      window.location.href = window.location.origin + '?v=' + Date.now();
    }, 400);
  };

  // --- Project Resolution Helper ---
  const uniqueProjects = useMemo(() => {
    const map = new Map<string, string>(); // projectId -> projectName
    // 1. From projectsList
    projectsList.forEach(p => map.set(String(p.id), p.name));
    // 2. From local tickets
    tickets.forEach(t => {
      if (t.projectId && t.project) {
        map.set(t.projectId, t.project);
      } else if (t.project) {
        map.set(t.project, t.project);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [projectsList, tickets]);

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

  // --- Project-Specific Assignees Resolver ---
  const getAssigneesForProject = useCallback((projIdentOrName?: string): LookupItem[] => {
    if (!projIdentOrName) return [];

    const projId = resolveProjectId(projIdentOrName);

    // 1. Check cached project members from OpenProject API
    if (projId && projectAssigneesMap[projId] && projectAssigneesMap[projId].length > 0) {
      return projectAssigneesMap[projId];
    }

    // 2. Derive distinct assignees from tickets belonging to this project
    const assigneesMap = new Map<string, string>();
    tickets.forEach(t => {
      const match = (projId && t.projectId === projId) || (t.project === projIdentOrName);
      if (match && t.assigneeId && t.assignee && t.assignee.toLowerCase() !== 'unassigned') {
        assigneesMap.set(t.assigneeId, t.assignee);
      }
    });

    if (assigneesMap.size > 0) {
      return Array.from(assigneesMap.entries()).map(([id, name]) => ({ id, name }));
    }

    return [];
  }, [resolveProjectId, projectAssigneesMap, tickets]);

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

  const displayTypes = useMemo(() => {
    if (types.length > 0) return types;
    return DEFAULT_TYPES;
  }, [types]);

  const displayPriorities = useMemo(() => {
    return DEFAULT_PRIORITIES;
  }, []);

  const starredTickets = useMemo(() => tickets.filter(t => t.starred), [tickets]);

  // Selected Ticket Reference
  const selectedTicket = useMemo(() => {
    return tickets.find(t => t.id === selectedTicketId) || null;
  }, [tickets, selectedTicketId]);

  // Assignees strictly associated with the selected ticket's project
  const selectedTicketProjectAssignees = useMemo(() => {
    if (!selectedTicket) return [];
    const list = getAssigneesForProject(selectedTicket.projectId || selectedTicket.project);
    
    // Ensure current assignee is present in list if assigned
    if (selectedTicket.assigneeId && selectedTicket.assignee && selectedTicket.assignee.toLowerCase() !== 'unassigned') {
      const exists = list.some(u => u.id === selectedTicket.assigneeId);
      if (!exists) {
        return [{ id: selectedTicket.assigneeId, name: selectedTicket.assignee }, ...list];
      }
    }
    return list;
  }, [selectedTicket, getAssigneesForProject]);

  // Search filter for Assignee Picker Modal in Ticket Details
  const filteredAssigneePickerList = useMemo(() => {
    const q = assigneePickerSearch.toLowerCase().trim();
    if (!q) return selectedTicketProjectAssignees;
    return selectedTicketProjectAssignees.filter(u => u.name.toLowerCase().includes(q));
  }, [selectedTicketProjectAssignees, assigneePickerSearch]);

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

  // Automatically fetch up-to-date ticket details and time entries when a ticket is opened
  useEffect(() => {
    if (!selectedTicketId) {
      setTicketEffortsList([]);
      setIsLoadingTicketEfforts(false);
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

    return () => {
      isMounted = false;
    };
  }, [selectedTicketId, currentUser]);

  // Assignees strictly associated with the currently filtered projects in drawer
  const filterDrawerAssignees = useMemo(() => {
    if (filterProjects.length > 0) {
      const set = new Map<string, string>();
      for (const p of filterProjects) {
        const list = getAssigneesForProject(p);
        list.forEach(u => set.set(u.id, u.name));
      }
      return Array.from(set.entries()).map(([id, name]) => ({ id, name }));
    }
    const map = new Map<string, string>();
    tickets.forEach(t => {
      if (t.assigneeId && t.assignee && t.assignee.toLowerCase() !== 'unassigned') {
        map.set(t.assigneeId, t.assignee);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [filterProjects, getAssigneesForProject, tickets]);

  // Search filter for Project Picker in Filter Drawer
  const filteredProjectPickerList = useMemo(() => {
    const q = projectPickerSearch.toLowerCase().trim();
    if (!q) return uniqueProjects;
    return uniqueProjects.filter(p => p.name.toLowerCase().includes(q));
  }, [uniqueProjects, projectPickerSearch]);

  // Search filter for Assignee Picker in Filter Drawer
  const filteredDrawerAssigneeList = useMemo(() => {
    const q = drawerAssigneePickerSearch.toLowerCase().trim();
    if (!q) return filterDrawerAssignees;
    return filterDrawerAssignees.filter(u => u.name.toLowerCase().includes(q));
  }, [filterDrawerAssignees, drawerAssigneePickerSearch]);

  // Search filter for Saved Views menu
  const filteredSavedViews = useMemo(() => {
    const q = viewSearchQuery.toLowerCase().trim();
    if (!q) return savedViews;
    return savedViews.filter(v => v.name.toLowerCase().includes(q));
  }, [savedViews, viewSearchQuery]);

  // Search filter for Add Effort Ticket Picker
  const effortTicketSearchResults = useMemo(() => {
    const raw = effortTicketSearch.trim();
    if (!raw) return tickets.slice(0, 8);
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
  }, [tickets, effortTicketSearch, effortRemoteSearchResults]);

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

    setFilterType(f.type || '');
    setFilterAssignee(f.assignee || '');
    setFilterPriority(f.priority || '');
    setFilterStarredOnly(!!f.starredOnly);
    setSortBy(f.sortBy || 'updated_desc');

    setIsViewsMenuOpen(false);
    showEphemeralNotice(`Switched view: ${view.name}`);
  };

  const handleToggleFavoriteView = async (e: React.MouseEvent, viewId: string) => {
    e.stopPropagation();
    const isFav = await db.toggleFavoriteView(viewId);
    setSavedViews(prev => prev.map(v => v.id === viewId ? { ...v, isFavorite: isFav } : v));
  };

  const handleSetDefaultView = async (e: React.MouseEvent, viewId: string) => {
    e.stopPropagation();
    await db.setDefaultSavedView(viewId);
    setSavedViews(prev => prev.map(v => ({ ...v, isDefault: v.id === viewId })));
    const target = savedViews.find(v => v.id === viewId);
    if (target) {
      sheetSyncService.saveViewAsync({ ...target, isDefault: true });
    }
    showEphemeralNotice(`Set "${target?.name || 'View'}" as default startup view`);
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
        type: filterType || undefined,
        assignee: filterAssignee || undefined,
        priority: filterPriority || undefined,
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

  const handleDeleteView = async (viewId: string) => {
    await db.deleteSavedView(viewId);
    setSavedViews(prev => prev.filter(v => v.id !== viewId));
    if (activeViewId === viewId) {
      applySavedView(savedViews[0] || DEFAULT_SAVED_VIEWS[0]);
    }
    showEphemeralNotice('View deleted');
  };

  // --- Toggle Multi-Select Filters Helpers ---
  const toggleProjectFilter = (projName: string) => {
    setFilterProjects(prev => {
      if (prev.includes(projName)) {
        return prev.filter(p => p !== projName);
      } else {
        return [...prev, projName];
      }
    });
  };

  const toggleStatusFilter = (statusId: string) => {
    setFilterStatuses(prev => {
      if (prev.includes(statusId)) {
        return prev.filter(s => s !== statusId);
      } else {
        return [...prev, statusId];
      }
    });
  };

  // Extracted ticket ID from search query if user pasted a URL or #ID
  const searchExtractedId = useMemo(() => {
    if (!searchQuery) return null;
    return extractTicketIdFromUrlOrText(searchQuery) || null;
  }, [searchQuery]);

  // --- Filtered & Sorted Tickets ---
  const filteredTickets = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const extractedId = extractTicketIdFromUrlOrText(searchQuery);

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
        if (filterStatusCategory === 'open') {
          const isClosed = closedStatusIds.has(String(t.statusId)) || ['closed', 'tested', 'rejected'].includes(t.status.toLowerCase());
          if (isClosed) return false;
        } else if (filterStatusCategory === 'closed') {
          const isClosed = closedStatusIds.has(String(t.statusId)) || ['closed', 'tested', 'rejected'].includes(t.status.toLowerCase());
          if (!isClosed) return false;
        }
      }

      // 4. Multiple Projects Filter
      if (filterProjects.length > 0) {
        const matchProject = filterProjects.some(p => 
          t.project.toLowerCase() === p.toLowerCase() ||
          String(t.projectId) === String(p) ||
          (resolveProjectId(p) && String(t.projectId) === String(resolveProjectId(p)))
        );
        if (!matchProject) return false;
      }

      // 5. Type Filter
      if (filterType) {
        const matchType = String(t.typeId) === String(filterType) || (t.type && t.type.toLowerCase() === filterType.toLowerCase());
        if (!matchType) return false;
      }

      // 6. Assignee Filter
      if (filterAssignee) {
        if (filterAssignee === 'me') {
          const isMe = (currentUser?.id && String(t.assigneeId) === String(currentUser.id)) || 
                       t.assignee.toLowerCase() === 'me' || 
                       (currentUser?.name && t.assignee.toLowerCase() === currentUser.name.toLowerCase()) ||
                       (currentUser?.name && t.assignee.toLowerCase().includes(currentUser.name.toLowerCase())) ||
                       t.assignee.toLowerCase().includes('nibas');
          if (!isMe) return false;
        } else if (filterAssignee === 'unassigned') {
          if (t.assignee && t.assignee.toLowerCase() !== 'unassigned' && t.assignee.trim() !== '') return false;
        } else {
          const matchAssignee = String(t.assigneeId) === String(filterAssignee) || t.assignee.toLowerCase() === filterAssignee.toLowerCase();
          if (!matchAssignee) return false;
        }
      }

      // 7. Priority Filter
      if (filterPriority) {
        const matchPriority = String(t.priorityId) === String(filterPriority) || t.priority.toLowerCase() === filterPriority.toLowerCase();
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
    filterType, 
    filterAssignee, 
    currentUser, 
    filterPriority, 
    sortBy
  ]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterProjects.length > 0) count++;
    if (filterStatusCategory !== 'all') count++;
    if (filterStatuses.length > 0) count++;
    if (filterType) count++;
    if (filterAssignee) count++;
    if (filterPriority) count++;
    if (filterStarredOnly) count++;
    return count;
  }, [filterProjects, filterStatusCategory, filterStatuses, filterType, filterAssignee, filterPriority, filterStarredOnly]);

  const activeViewObj = useMemo(() => {
    return savedViews.find(v => v.id === activeViewId) || null;
  }, [savedViews, activeViewId]);

  const favoriteViews = useMemo(() => {
    return savedViews.filter(v => v.isFavorite);
  }, [savedViews]);

  // --- Efforts Calculations & Global Effort Search ---
  const weekDays = useMemo(() => getWorkWeekDays(weekOffset), [weekOffset]);
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }, []);

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
    return tickets.filter(t => t.pendingSync).length;
  }, [tickets]);

  // Quick reset filters helper
  const handleResetFilters = () => {
    setFilterProjects([]);
    setFilterStatuses([]);
    setFilterStatusCategory('open');
    setFilterType('');
    setFilterAssignee('');
    setFilterPriority('');
    setFilterStarredOnly(false);
  };

  // --- PC Desktop Workspace View Mode ---
  if (viewMode === 'desktop') {
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
          filterType={filterType}
          setFilterType={setFilterType}
          filterAssignee={filterAssignee}
          setFilterAssignee={setFilterAssignee}
          filterPriority={filterPriority}
          setFilterPriority={setFilterPriority}
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
          onSwitchToMobileView={() => handleSetViewMode('mobile')}
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
            } catch (err: any) {
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

        {/* Ephemeral Toast Notice for Desktop */}
        {syncNotice && (
          <div className="fixed top-4 right-4 bg-blue-600 text-white text-xs px-4 py-2 rounded-xl shadow-xl font-medium flex items-center gap-3 z-50 animate-in slide-in-from-top-2">
            <span>{syncNotice}</span>
            <button onClick={() => setSyncNotice(null)} className="p-0.5 hover:opacity-80">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090d16] text-[#f1f5f9] flex justify-center selection:bg-blue-600/30 font-sans">
      
      {/* Mobile Frame Container */}
      <div 
        style={{
          height: visualViewportHeight ? `${visualViewportHeight}px` : undefined,
          maxHeight: visualViewportHeight ? `${visualViewportHeight}px` : undefined
        }}
        className="w-full max-w-md bg-[#0f172a] sm:border sm:border-[#1e293b] sm:rounded-3xl sm:my-4 sm:shadow-2xl flex flex-col h-[100dvh] max-h-[100dvh] sm:h-[860px] overflow-hidden relative"
      >

        {/* Top Header */}
        <header className="p-3 border-b border-[#1e293b] bg-[#0f172a]/95 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-mono text-xs font-bold tracking-wider px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
              OP MOBILE
            </span>

            {/* Sync Button & Status Badge */}
            <button 
              onClick={() => handleSync(true)} 
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg border border-[#1e293b] bg-[#090d16] hover:border-blue-500/50 text-[11px] font-mono transition shrink-0"
              title="Click to Sync with OpenProject"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-blue-400' : isOnline ? 'text-emerald-400' : 'text-amber-400'}`} />
              <span className="text-slate-300 uppercase tracking-tight text-[10px]">
                {isSyncing ? 'SYNC' : lastSyncText}
              </span>
            </button>

            {pendingCount > 0 && (
              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold shrink-0">
                {pendingCount} PENDING
              </span>
            )}
          </div>

          {/* Effort Summary Pill & Settings Icon */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Quick Effort Pill (Tapping opens Log Effort modal) */}
            <button
              onClick={() => {
                setIsAddEffortModalOpen(true);
                setEffortTicketSearch('');
                setEffortSelectedTicket(null);
                setEffortTicketFetchError(null);
                setEffortModalComment('');
                setEffortModalHours('1.0');
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 transition group"
              title={`Logged today: ${todayTotalHours.toFixed(1)}h / 8h (Tap to log effort)`}
            >
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span className="font-mono text-xs font-bold leading-none">{todayTotalHours.toFixed(1)}h</span>
              <span className="font-mono text-[10px] text-[#64748b] leading-none">/8h</span>
            </button>

            {/* Switch to PC Desktop View Button */}
            <button 
              onClick={() => handleSetViewMode('desktop')}
              className="p-1.5 text-blue-400 hover:text-white border border-blue-500/30 bg-blue-500/10 hover:bg-blue-600 rounded-xl transition shrink-0"
              title="Switch to PC Desktop View"
            >
              <Monitor className="w-4 h-4" />
            </button>

            {/* Settings Modal Button */}
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-1.5 text-[#94a3b8] hover:text-[#f1f5f9] border border-[#1e293b] bg-[#090d16] hover:bg-[#1e293b] rounded-xl transition shrink-0"
              title="Open Settings & OP Key"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Ephemeral Toast Notice */}
        {syncNotice && (
          <div className="bg-blue-600 text-white text-xs px-3 py-1.5 font-medium flex items-center justify-between shrink-0 animate-in slide-in-from-top-1 z-30">
            <span>{syncNotice}</span>
            <button onClick={() => setSyncNotice(null)} className="p-0.5 hover:opacity-80">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Clipboard Detected Banner */}
        {clipboardTicketId && (
          <div className="bg-[#1e293b] border-b border-[#334155] p-2.5 flex items-center justify-between shrink-0 text-xs z-20">
            <div className="flex items-center gap-2">
              <Clipboard className="w-4 h-4 text-blue-400 shrink-0" />
              <span>Detected link: <strong className="font-mono text-blue-400">#{clipboardTicketId}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <button 
                onClick={() => {
                  openTicketById(clipboardTicketId);
                  setClipboardTicketId(null);
                }}
                className="bg-blue-600 text-white px-2.5 py-1 rounded font-medium text-xs hover:bg-blue-500"
              >
                Open
              </button>
              <button 
                onClick={() => setClipboardTicketId(null)}
                className="text-[#64748b] hover:text-white p-1 text-xs"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Search & Saved Views Bar */}
        {activeTab === 'tickets' && (
          <div className="p-3 border-b border-[#1e293b] bg-[#090d16]/70 shrink-0 space-y-2">
            
            {/* Search Bar with Remote Search Trigger & Filter Trigger */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 flex items-center">
                <Search className="w-4 h-4 absolute left-3 text-[#64748b] pointer-events-none" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRemoteSearch(); }}
                  placeholder="Search #ID, subject, assignee, or details..."
                  className="w-full bg-[#0f172a] text-xs text-[#f1f5f9] rounded-xl pl-9 pr-16 py-2 border border-[#1e293b] focus:outline-none focus:border-blue-500 placeholder:text-[#64748b] transition"
                />
                
                <div className="absolute right-2 flex items-center gap-1">
                  {isSearchingRemote && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                  )}
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="text-[#64748b] hover:text-white p-1 rounded transition" title="Clear">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button 
                    onClick={checkClipboard}
                    title="Paste / Detect link from Clipboard"
                    className="text-[#64748b] hover:text-blue-400 p-1 rounded transition"
                  >
                    <Clipboard className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Slide Filter Drawer Trigger */}
              <button 
                onClick={() => setIsFilterDrawerOpen(true)}
                className={`p-2.5 rounded-xl border transition shrink-0 relative ${
                  activeFilterCount > 0 
                    ? 'bg-blue-600/20 text-blue-400 border-blue-500/50' 
                    : 'bg-[#0f172a] text-[#64748b] border-[#1e293b] hover:text-white'
                }`}
                title="Open OpenProject Filters Drawer"
              >
                <SlidersHorizontal className="w-4 h-4" />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-500 text-white font-mono text-[10px] flex items-center justify-center font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>

            {/* Quick-Jump Card when a URL or Ticket ID is typed/pasted */}
            {searchExtractedId && (
              <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-1.5 text-xs text-blue-400 animate-in fade-in duration-150">
                <span className="flex items-center gap-1.5 font-mono">
                  <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span>Detected Ticket <strong className="text-white font-bold">#{searchExtractedId}</strong></span>
                </span>
                <button
                  onClick={() => openTicketById(searchExtractedId)}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs px-2.5 py-1 rounded-lg transition font-mono shadow-sm"
                >
                  Open Ticket
                </button>
              </div>
            )}

            {/* Saved Views (OpenProject Views & Favorites Bar) */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              
              {/* Favorite Views Chips */}
              {favoriteViews.map(view => {
                const isActive = activeViewId === view.id;
                const isStarredView = view.name.toLowerCase().includes('star');
                return (
                  <button
                    key={view.id}
                    onClick={() => applySavedView(view)}
                    className={`text-xs px-3 py-1 rounded-full font-medium shrink-0 flex items-center gap-1.5 transition ${
                      isActive 
                        ? 'bg-blue-600 text-white shadow-sm' 
                        : 'bg-[#0f172a] text-[#94a3b8] border border-[#1e293b] hover:border-slate-700'
                    }`}
                  >
                    {isStarredView && (
                      <Star className="w-3 h-3 text-amber-400 fill-current" />
                    )}
                    {view.isDefault && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="Default startup view" />
                    )}
                    <span>{view.name}</span>
                  </button>
                );
              })}

              {/* Save View Button */}
              <button
                onClick={() => setIsSaveViewModalOpen(true)}
                className="text-xs px-2.5 py-1 rounded-full font-medium shrink-0 flex items-center gap-1 bg-[#0f172a] text-[#64748b] border border-dashed border-[#334155] hover:text-white hover:border-slate-500 transition"
                title="Save current filters as a view"
              >
                <Plus className="w-3 h-3" />
                <span>Save View</span>
              </button>

              {/* All Views Menu Dropdown Trigger */}
              <div className="relative shrink-0">
                <button
                  onClick={() => {
                    setIsViewsMenuOpen(!isViewsMenuOpen);
                    setViewSearchQuery('');
                  }}
                  className="text-xs px-2.5 py-1 rounded-full font-medium shrink-0 flex items-center gap-1 bg-[#0f172a] text-[#94a3b8] border border-[#1e293b] hover:text-white transition"
                >
                  <Bookmark className="w-3 h-3 text-blue-400" />
                  <span>Views</span>
                  <ChevronDown className="w-3 h-3" />
                </button>

                {/* Dropdown Menu for All Views with Instant View Search */}
                {isViewsMenuOpen && (
                  <div className="absolute top-8 left-0 z-50 w-72 bg-[#0f172a] border border-[#1e293b] rounded-2xl shadow-2xl p-2 space-y-1.5 animate-in fade-in zoom-in-95">
                    {/* View Search Input */}
                    <div className="relative">
                      <Search className="w-3 h-3 absolute left-2.5 top-2 text-[#64748b]" />
                      <input
                        type="text"
                        autoFocus
                        value={viewSearchQuery}
                        onChange={e => setViewSearchQuery(e.target.value)}
                        placeholder="Search views..."
                        className="w-full bg-[#090d16] text-[11px] text-[#f1f5f9] rounded-lg pl-7 pr-6 py-1 border border-[#1e293b] focus:outline-none focus:border-blue-500 placeholder:text-[#64748b]"
                      />
                      {viewSearchQuery && (
                        <button onClick={() => setViewSearchQuery('')} className="absolute right-1.5 top-1 text-[#64748b] hover:text-white p-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    <div className="px-1 text-[10px] font-mono uppercase text-[#64748b] flex justify-between items-center">
                      <span>Saved Views ({filteredSavedViews.length})</span>
                      <span>Default / Pin</span>
                    </div>

                    <div className="max-h-60 overflow-y-auto space-y-0.5">
                      {filteredSavedViews.map(v => (
                        <div
                          key={v.id}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition cursor-pointer ${
                            activeViewId === v.id ? 'bg-blue-600/20 text-blue-300 font-medium' : 'text-slate-300 hover:bg-[#1e293b]'
                          }`}
                          onClick={() => applySavedView(v)}
                        >
                          <div className="flex items-center gap-1.5 truncate pr-2">
                            <span className="truncate">{v.name}</span>
                            {v.isDefault && (
                              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold shrink-0">
                                DEFAULT
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={(e) => handleSetDefaultView(e, v.id)}
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded transition ${
                                v.isDefault 
                                  ? 'text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20' 
                                  : 'text-[#64748b] hover:text-emerald-400 hover:bg-[#1e293b]'
                              }`}
                              title={v.isDefault ? 'Current default startup view' : 'Set as default startup view'}
                            >
                              {v.isDefault ? 'Default' : 'Make Default'}
                            </button>
                            <button
                              onClick={(e) => handleToggleFavoriteView(e, v.id)}
                              className="p-1 hover:text-amber-400"
                              title={v.isFavorite ? 'Remove from quick bar' : 'Pin as favorite'}
                            >
                              <Star className={`w-3.5 h-3.5 ${v.isFavorite ? 'text-amber-400 fill-current' : 'text-[#64748b]'}`} />
                            </button>
                            {!v.isSystem && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteView(v.id);
                                }}
                                className="p-1 text-[#64748b] hover:text-red-400"
                                title="Delete view"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}

                      {filteredSavedViews.length === 0 && (
                        <div className="p-3 text-center text-[11px] text-[#64748b]">
                          No views found
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* Main Body: Active Tab View */}
        {activeTab === 'tickets' && (
          <main className="flex-1 overflow-y-auto divide-y divide-[#1e293b]">
            
            {/* Daily Starred Tasks Quick Shelf */}
            {!filterStarredOnly && starredTickets.length > 0 && !searchQuery && (
              <div className="bg-[#090d16] p-3 border-b border-[#1e293b]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-mono uppercase text-amber-400 font-semibold tracking-wider flex items-center gap-1">
                    <Star className="w-3 h-3 fill-current" />
                    Daily Starred Tasks
                  </span>
                  <button 
                    onClick={() => setFilterStarredOnly(true)}
                    className="text-[11px] text-[#64748b] hover:text-white"
                  >
                    View All ({starredTickets.length})
                  </button>
                </div>

                <div className="flex gap-2 overflow-x-auto no-scrollbar py-0.5">
                  {starredTickets.map(st => (
                    <div 
                      key={st.id}
                      onClick={() => setSelectedTicketId(st.id)}
                      className="p-2.5 bg-[#0f172a] border border-[#1e293b] hover:border-amber-500/40 rounded-xl min-w-[200px] max-w-[220px] shrink-0 cursor-pointer transition select-none flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-xs font-bold text-blue-400">#{st.id}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded border border-[#1e293b] text-slate-300">
                          {st.status}
                        </span>
                      </div>
                      <h4 className="text-xs font-medium text-[#f1f5f9] truncate mb-2">
                        {st.subject}
                      </h4>
                      <div className="flex items-center justify-between text-[11px] text-[#64748b]">
                        <span className="truncate max-w-[120px]">{st.project}</span>
                        <span className="font-mono text-emerald-400 font-semibold">
                          {st.spentTime ? `${parseDurationToHours(st.spentTime)}h` : '0h'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tickets Count Header & Sort/Filter Summary */}
            <div className="px-3.5 py-2 bg-[#090d16]/80 flex items-center justify-between text-xs text-[#64748b]">
              <div className="flex items-center gap-1.5 truncate pr-2">
                <span>Showing <strong>{filteredTickets.length}</strong> ticket(s)</span>
                {activeViewObj && (
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[#1e293b] text-slate-300 truncate">
                      {activeViewObj.name}
                    </span>
                    {activeViewObj.isDefault ? (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold shrink-0">
                        DEFAULT
                      </span>
                    ) : (
                      <button
                        onClick={(e) => handleSetDefaultView(e, activeViewObj.id)}
                        className="text-[10px] font-mono text-slate-400 hover:text-emerald-400 hover:underline px-1 py-0.5 shrink-0"
                        title="Set this view as default startup view"
                      >
                        Set Default
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Quick Sort Toggle */}
              <button 
                onClick={() => setSortBy(prev => prev === 'updated_desc' ? 'id_desc' : prev === 'id_desc' ? 'updated_asc' : 'updated_desc')}
                className="flex items-center gap-1 hover:text-white transition font-mono text-[11px] shrink-0"
                title="Toggle sort order"
              >
                <ArrowUpDown className="w-3 h-3" />
                <span>{sortBy === 'updated_desc' ? 'Updated' : sortBy === 'id_desc' ? 'ID' : 'Oldest'}</span>
              </button>
            </div>

            {/* Ticket Cards List */}
            {filteredTickets.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <FolderKanban className="w-8 h-8 text-[#64748b] mx-auto opacity-50" />
                {isSearchingRemote ? (
                  <div className="space-y-1">
                    <p className="text-xs text-blue-400 font-mono flex items-center justify-center gap-1.5">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                      <span>Querying OpenProject server for "{searchQuery}"...</span>
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-[#64748b]">No tickets match "{searchQuery || 'your filters'}".</p>
                    <div className="flex justify-center gap-2 flex-wrap">
                      <button 
                        onClick={() => {
                          setFilterProjects([]);
                          setFilterStatuses([]);
                          setFilterStatusCategory('all');
                          setFilterType('');
                          setFilterAssignee('');
                          setFilterPriority('');
                          setFilterStarredOnly(false);
                          setSearchQuery('');
                        }}
                        className="text-xs bg-[#1e293b] hover:bg-[#334155] text-slate-200 px-3 py-1.5 rounded-xl font-medium transition"
                      >
                        Reset Filters
                      </button>
                      {searchQuery && (
                        <button
                          onClick={handleRemoteSearch}
                          disabled={isSearchingRemote}
                          className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl font-medium transition inline-flex items-center gap-1.5"
                        >
                          <Globe className={`w-3.5 h-3.5 ${isSearchingRemote ? 'animate-spin' : ''}`} />
                          <span>Search OP Server {extractTicketIdFromUrlOrText(searchQuery) ? `for #${extractTicketIdFromUrlOrText(searchQuery)}` : ''}</span>
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              filteredTickets.map((t) => (
                <div 
                  key={t.id}
                  onClick={() => setSelectedTicketId(t.id)}
                  className="p-3.5 hover:bg-[#1e293b]/40 cursor-pointer transition select-none flex items-start justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    {/* Top Row: Star, ID, Project, Type */}
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <button 
                        onClick={(e) => handleToggleStar(e, t.id)}
                        className={`p-0.5 rounded transition ${t.starred ? 'text-amber-400' : 'text-[#64748b] hover:text-white'}`}
                        title={t.starred ? 'Starred' : 'Star for daily access'}
                      >
                        <Star className={`w-3.5 h-3.5 ${t.starred ? 'fill-current' : ''}`} />
                      </button>

                      <span className="font-mono text-xs font-bold text-blue-400 shrink-0">
                        #{t.id}
                      </span>

                      <span className="text-[11px] font-mono text-[#64748b] truncate max-w-[150px]">
                        {t.project}
                      </span>

                      {t.type && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded border border-[#1e293b] text-slate-300">
                          {t.type}
                        </span>
                      )}

                      {t.pendingSync && (
                        <span className="font-mono text-[9px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          SYNC PENDING
                        </span>
                      )}
                    </div>

                    {/* Subject */}
                    <h3 className="text-xs font-medium text-[#f1f5f9] leading-snug line-clamp-2 mb-2">
                      {t.subject}
                    </h3>

                    {/* Bottom Metadata: Assignee, Spent/Estimated, Date */}
                    <div className="flex items-center gap-3 text-[11px] text-[#64748b] flex-wrap">
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        <span className="truncate max-w-[130px]">{t.assignee || 'Unassigned'}</span>
                      </div>

                      <div className="flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400 font-semibold">
                          {t.spentTime ? `${parseDurationToHours(t.spentTime)}h` : '0h'}
                        </span>
                        {t.estimatedTime && (
                          <span className="text-[#64748b]">/ {parseDurationToHours(t.estimatedTime)}h</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="shrink-0 text-right">
                    <span className="inline-block text-[10px] font-mono font-medium px-2 py-0.5 rounded border border-[#1e293b] bg-[#090d16] text-slate-200">
                      {t.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </main>
        )}

        {/* Tab 2: Daily & Weekly Efforts Dashboard with Effort Search & Add Effort Popup */}
        {activeTab === 'efforts' && (
          <main className="flex-1 overflow-y-auto p-4 space-y-4">
            
            {/* Search Input for Logged Efforts & Log Effort Button */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#64748b]" />
                <input 
                  type="text"
                  value={effortSearchQuery}
                  onChange={e => setEffortSearchQuery(e.target.value)}
                  placeholder="Search logged efforts (#ID, comment, date)..."
                  className="w-full bg-[#090d16] text-xs text-[#f1f5f9] rounded-xl pl-9 pr-8 py-2 border border-[#1e293b] focus:outline-none focus:border-blue-500 placeholder:text-[#64748b]"
                />
                {effortSearchQuery && (
                  <button 
                    onClick={() => setEffortSearchQuery('')} 
                    className="absolute right-2.5 top-2 text-[#64748b] hover:text-white p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Log Effort Button Trigger */}
              <button
                onClick={() => {
                  setIsAddEffortModalOpen(true);
                  setEffortTicketSearch('');
                  setEffortSelectedTicket(null);
                  setEffortTicketFetchError(null);
                  setEffortModalComment('');
                  setEffortModalHours('1.0');
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-2 rounded-xl font-medium shrink-0 flex items-center gap-1.5 transition shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Log Effort</span>
              </button>
            </div>

            {/* When Effort Search Query is Active: Display Searched Results */}
            {searchedEfforts !== null ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-[#64748b]">
                  <span>Found <strong>{searchedEfforts.length}</strong> effort log(s)</span>
                  <button 
                    onClick={() => setEffortSearchQuery('')}
                    className="text-blue-400 hover:underline"
                  >
                    Clear Search
                  </button>
                </div>

                {searchedEfforts.length === 0 ? (
                  <div className="p-8 bg-[#090d16] border border-[#1e293b] rounded-2xl text-center">
                    <p className="text-xs text-[#64748b]">No logged efforts match "{effortSearchQuery}".</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {searchedEfforts.map(e => (
                      <div 
                        key={e.id}
                        className="p-3 bg-[#090d16] border border-[#1e293b] rounded-xl flex items-center justify-between text-xs hover:border-slate-700 transition"
                      >
                        <div className="min-w-0 flex-1 pr-3">
                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-[#1e293b] text-slate-300">
                              {e.spentOn}
                            </span>
                            {e.workPackageId > 0 && (
                              <span 
                                onClick={() => {
                                  setSelectedTicketId(e.workPackageId);
                                  setActiveTab('tickets');
                                }}
                                className="font-mono font-bold text-blue-400 hover:underline cursor-pointer"
                              >
                                #{e.workPackageId}
                              </span>
                            )}
                            {e.ticketSubject && (
                              <span className="text-[#f1f5f9] truncate font-medium">{e.ticketSubject}</span>
                            )}
                          </div>
                          <span className="text-[#64748b] block truncate">{e.comment || 'Effort entry'}</span>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <div className="text-right">
                            <span className="font-mono font-bold text-emerald-400 text-sm">+{e.hours.toFixed(1)}h</span>
                            {e.pendingSync && (
                              <span className="block font-mono text-[9px] text-amber-400 uppercase">UNSYNCED</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleOpenEditEffort(e)}
                                className="p-1.5 rounded-lg bg-[#1e293b] text-slate-300 hover:text-white hover:bg-slate-700 transition flex items-center gap-1 text-[11px] font-mono"
                                title="Edit Logged Effort"
                              >
                                <Pencil className="w-3 h-3 text-blue-400" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                disabled={deletingEffortId === e.id}
                                onClick={() => {
                                  if (window.confirm(`Delete ${e.hours}h log for #${e.workPackageId}?`)) {
                                    handleDeleteEffort(e);
                                  }
                                }}
                                className="p-1.5 rounded-lg bg-[#1e293b] text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 border border-transparent hover:border-rose-900/40 transition flex items-center justify-center disabled:opacity-50"
                                title="Delete Logged Effort"
                              >
                                {deletingEffortId === e.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin text-rose-400" />
                                ) : (
                                  <Trash2 className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                            <button
                              type="button"
                              disabled={deletingEffortId === e.id}
                              onClick={() => {
                                if (window.confirm(`Delete ${e.hours}h log for #${e.workPackageId}?`)) {
                                  handleDeleteEffort(e);
                                }
                              }}
                              className="p-1.5 rounded-lg bg-[#1e293b] text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 border border-transparent hover:border-rose-900/40 transition flex items-center justify-center disabled:opacity-50"
                              title="Delete Logged Effort"
                            >
                              {deletingEffortId === e.id ? (
                                <Loader2 className="w-3 h-3 animate-spin text-rose-400" />
                              ) : (
                                <Trash2 className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Normal Efforts View: Summary + 5-Day Work Week (Mon-Fri) + Selected Date Logs */
              <>
                {/* Weekly Header Summary Card */}
                <div className="bg-[#090d16] border border-[#1e293b] rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono uppercase text-[#64748b]">Weekly Effort Total</span>
                      <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                        {getWeekRangeLabel(weekDays)}
                      </span>
                    </div>
                    <span className="text-2xl font-mono font-bold text-emerald-400">
                      {weeklyTotalHours.toFixed(1)} <span className="text-xs text-[#64748b] font-normal">hours</span>
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono uppercase text-[#64748b] block mb-1">Today</span>
                    <span className="text-lg font-mono font-semibold text-[#f1f5f9]">
                      {todayTotalHours.toFixed(1)}h <span className="text-xs text-[#64748b]">/ 8h</span>
                    </span>
                  </div>
                </div>

                {/* 5-Day Work Week Interactive Strip (Mon to Fri, Saturday & Sunday Hidden) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono uppercase text-[#64748b]">
                      Work Week ({getWeekRangeLabel(weekDays)})
                    </span>
                    <div className="flex items-center gap-1">
                      {weekOffset !== 0 && (
                        <button
                          onClick={() => {
                            setWeekOffset(0);
                            setSelectedEffortDate(todayStr);
                          }}
                          className="text-[10px] font-mono text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 mr-1"
                        >
                          This Week
                        </button>
                      )}
                      <button
                        onClick={() => setWeekOffset(prev => prev - 1)}
                        className="px-2 py-1 rounded-lg bg-[#090d16] border border-[#1e293b] text-[#94a3b8] hover:text-white text-xs font-mono transition"
                        title="Previous Week"
                      >
                        &larr; Prev
                      </button>
                      <button
                        onClick={() => setWeekOffset(prev => prev + 1)}
                        className="px-2 py-1 rounded-lg bg-[#090d16] border border-[#1e293b] text-[#94a3b8] hover:text-white text-xs font-mono transition"
                        title="Next Week"
                      >
                        Next &rarr;
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-5 gap-2">
                    {weekDays.map(d => {
                      const hours = hoursPerDateMap[d.dateStr] || 0;
                      const isSelected = d.dateStr === selectedEffortDate;
                      return (
                        <button
                          key={d.dateStr}
                          onClick={() => setSelectedEffortDate(d.dateStr)}
                          className={`p-2.5 rounded-xl text-center border transition flex flex-col justify-between items-center ${
                            isSelected 
                              ? 'bg-blue-600/20 border-blue-500 text-white shadow-sm ring-1 ring-blue-500/50' 
                              : 'bg-[#090d16] border-[#1e293b] text-[#64748b] hover:text-white'
                          }`}
                        >
                          <span className="text-[10px] uppercase font-mono font-semibold block">{d.dayName}</span>
                          <span className="text-sm font-bold my-1 block">{d.label.split(' ')[0]}</span>
                          <span className={`text-[11px] font-mono font-bold ${hours > 0 ? 'text-emerald-400' : 'text-[#64748b]'}`}>
                            {hours > 0 ? `${hours.toFixed(1)}h` : '-'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Day's Effort Logs List */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-mono uppercase text-[#64748b] block">
                        Logs for {selectedEffortDate === todayStr ? 'Today' : selectedEffortDate}
                      </span>
                      <span className="text-xs font-mono text-emerald-400 font-bold">
                        {(hoursPerDateMap[selectedEffortDate] || 0).toFixed(1)}h Total
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setIsAddEffortModalOpen(true);
                        setEffortModalDate(selectedEffortDate);
                        setEffortTicketSearch('');
                        setEffortSelectedTicket(null);
                        setEffortTicketFetchError(null);
                      }}
                      className="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-mono font-medium inline-flex items-center gap-1.5 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Add Hours</span>
                    </button>
                  </div>

                  {effortsForSelectedDate.length === 0 ? (
                    <div className="p-6 bg-[#090d16] border border-[#1e293b] rounded-2xl text-center">
                      <p className="text-xs text-[#64748b]">No effort logged for this date.</p>
                      <button
                        onClick={() => {
                          setIsAddEffortModalOpen(true);
                          setEffortModalDate(selectedEffortDate);
                          setEffortTicketSearch('');
                          setEffortSelectedTicket(null);
                          setEffortTicketFetchError(null);
                        }}
                        className="mt-3 text-xs bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-xl font-medium inline-flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Log Effort for {selectedEffortDate}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {effortsForSelectedDate.map(e => (
                        <div 
                          key={e.id}
                          className="p-3 bg-[#090d16] border border-[#1e293b] rounded-xl flex items-center justify-between text-xs hover:border-slate-700 transition"
                        >
                          <div className="min-w-0 flex-1 pr-3">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              {e.workPackageId > 0 && (
                                <span 
                                  onClick={() => {
                                    setSelectedTicketId(e.workPackageId);
                                    setActiveTab('tickets');
                                  }}
                                  className="font-mono font-bold text-blue-400 hover:underline cursor-pointer"
                                >
                                  #{e.workPackageId}
                                </span>
                              )}
                              {e.ticketSubject && (
                                <span className="text-[#f1f5f9] truncate font-medium">{e.ticketSubject}</span>
                              )}
                            </div>
                            <span className="text-[#64748b] block truncate">{e.comment || 'Effort entry'}</span>
                          </div>
                          <div className="flex items-center gap-2.5 shrink-0">
                            <div className="text-right">
                              <span className="font-mono font-bold text-emerald-400 text-sm">+{e.hours.toFixed(1)}h</span>
                              {e.pendingSync && (
                                <span className="block font-mono text-[9px] text-amber-400 uppercase">UNSYNCED</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleOpenEditEffort(e)}
                                className="p-1.5 rounded-lg bg-[#1e293b] text-slate-300 hover:text-white hover:bg-slate-700 transition flex items-center gap-1 text-[11px] font-mono"
                                title="Edit Logged Effort"
                              >
                                <Pencil className="w-3 h-3 text-blue-400" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                disabled={deletingEffortId === e.id}
                                onClick={() => {
                                  if (window.confirm(`Delete ${e.hours}h log for #${e.workPackageId}?`)) {
                                    handleDeleteEffort(e);
                                  }
                                }}
                                className="p-1.5 rounded-lg bg-[#1e293b] text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 border border-transparent hover:border-rose-900/40 transition flex items-center justify-center disabled:opacity-50"
                                title="Delete Logged Effort"
                              >
                                {deletingEffortId === e.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin text-rose-400" />
                                ) : (
                                  <Trash2 className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </main>
        )}

        {/* OpenProject-Style Multi-Attribute Filter Slide Panel (with Multiple Projects & Multiple Statuses) */}
        {isFilterDrawerOpen && (
          <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
            <div 
              className="w-5/6 max-w-xs bg-[#0f172a] h-full border-l border-[#1e293b] flex flex-col shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              {/* Drawer Header */}
              <div className="p-3.5 border-b border-[#1e293b] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-blue-400" />
                  <h3 className="text-xs font-mono font-bold uppercase text-[#f1f5f9]">Filter Tickets</h3>
                </div>
                <button 
                  onClick={() => setIsFilterDrawerOpen(false)}
                  className="text-[#64748b] hover:text-white p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Drawer Body (OpenProject Multi-Select Filters) */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                
                {/* 1. Projects Multi-Select Filter */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-mono uppercase text-[#64748b]">
                      Projects {filterProjects.length > 0 && `(${filterProjects.length} selected)`}
                    </label>
                    {filterProjects.length > 0 && (
                      <button 
                        onClick={() => setFilterProjects([])} 
                        className="text-[10px] text-blue-400 hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {/* Selected Project Tags */}
                  {filterProjects.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {filterProjects.map(p => (
                        <span 
                          key={p} 
                          className="bg-blue-600/20 text-blue-300 border border-blue-500/30 rounded-lg px-2 py-0.5 text-[10px] flex items-center gap-1 font-mono"
                        >
                          <span className="truncate max-w-[140px]">{p}</span>
                          <button onClick={() => toggleProjectFilter(p)} className="hover:text-white">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setProjectPickerSearch('');
                      setIsProjectPickerOpen(true);
                    }}
                    className="w-full bg-[#090d16] text-xs text-[#f1f5f9] border border-[#1e293b] hover:border-blue-500/50 rounded-xl p-2.5 flex items-center justify-between transition group font-medium"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FolderKanban className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span className="truncate">
                        {filterProjects.length === 0 
                          ? 'All Projects' 
                          : `${filterProjects.length} Project(s) selected`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[#64748b] group-hover:text-blue-400 shrink-0">
                      <span className="text-[10px] font-mono uppercase">Select</span>
                      <Search className="w-3 h-3" />
                    </div>
                  </button>
                </div>

                {/* 2. Status Category (Open vs Closed in OP) */}
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#64748b] mb-1.5">Status Category</label>
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      onClick={() => setFilterStatusCategory('open')}
                      className={`py-1.5 text-xs rounded-lg font-medium transition ${
                        filterStatusCategory === 'open' 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-[#090d16] text-[#94a3b8] border border-[#1e293b]'
                      }`}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterStatusCategory('closed')}
                      className={`py-1.5 text-xs rounded-lg font-medium transition ${
                        filterStatusCategory === 'closed' 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-[#090d16] text-[#94a3b8] border border-[#1e293b]'
                      }`}
                    >
                      Closed
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterStatusCategory('all')}
                      className={`py-1.5 text-xs rounded-lg font-medium transition ${
                        filterStatusCategory === 'all' 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-[#090d16] text-[#94a3b8] border border-[#1e293b]'
                      }`}
                    >
                      All
                    </button>
                  </div>
                </div>

                {/* 3. Specific Multi-Status Filter Chips */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-mono uppercase text-[#64748b]">
                      Specific Statuses {filterStatuses.length > 0 && `(${filterStatuses.length})`}
                    </label>
                    <div className="flex gap-2">
                      <button 
                        type="button"
                        onClick={() => setFilterStatuses(displayStatuses.filter(s => !closedStatusIds.has(s.id)).map(s => s.id))}
                        className="text-[10px] text-blue-400 hover:underline"
                      >
                        All Open
                      </button>
                      {filterStatuses.length > 0 && (
                        <button 
                          type="button"
                          onClick={() => setFilterStatuses([])}
                          className="text-[10px] text-[#64748b] hover:text-white"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto p-1.5 bg-[#090d16] border border-[#1e293b] rounded-xl">
                    {displayStatuses.map(s => {
                      const isSelected = filterStatuses.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggleStatusFilter(s.id)}
                          className={`text-[10px] px-2 py-1 rounded-lg transition font-medium flex items-center gap-1 ${
                            isSelected 
                              ? 'bg-blue-600 text-white font-semibold' 
                              : 'bg-[#0f172a] text-[#94a3b8] border border-[#1e293b] hover:border-slate-600'
                          }`}
                        >
                          {isSelected && <Check className="w-2.5 h-2.5" />}
                          <span>{s.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 4. Assignee Filter with Searchable Modal Trigger */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-mono uppercase text-[#64748b]">
                      Assignee
                    </label>
                    <span className="text-[10px] font-mono text-slate-400">
                      {filterProjects.length > 0 ? `${filterDrawerAssignees.length} project member(s)` : 'All members'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDrawerAssigneePickerSearch('');
                      setIsDrawerAssigneePickerOpen(true);
                    }}
                    className="w-full bg-[#090d16] text-xs text-[#f1f5f9] border border-[#1e293b] hover:border-blue-500/50 rounded-xl p-2.5 flex items-center justify-between transition group font-medium"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <User className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span className="truncate">
                        {filterAssignee === 'me'
                          ? `Assigned to Me (${currentUser.name})`
                          : filterAssignee === 'unassigned'
                          ? 'Unassigned'
                          : filterDrawerAssignees.find(u => u.id === filterAssignee)?.name || 'All Assignees'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[#64748b] group-hover:text-blue-400 shrink-0">
                      <span className="text-[10px] font-mono uppercase">Search</span>
                      <Search className="w-3 h-3" />
                    </div>
                  </button>
                </div>

                {/* 5. Type Filter */}
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#64748b] mb-1.5">Work Package Type</label>
                  <select
                    value={filterType}
                    onChange={e => setFilterType(e.target.value)}
                    className="w-full bg-[#090d16] text-xs text-[#f1f5f9] border border-[#1e293b] rounded-xl p-2.5 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">All Types</option>
                    {displayTypes.map(t => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                </div>

                {/* 6. Priority Filter */}
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#64748b] mb-1.5">Priority</label>
                  <select
                    value={filterPriority}
                    onChange={e => setFilterPriority(e.target.value)}
                    className="w-full bg-[#090d16] text-xs text-[#f1f5f9] border border-[#1e293b] rounded-xl p-2.5 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">All Priorities</option>
                    {displayPriorities.map(p => (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {/* 7. Starred Daily Tasks Only Toggle */}
                <div className="flex items-center justify-between p-3 bg-[#090d16] border border-[#1e293b] rounded-xl">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-400 fill-current" />
                    <span className="text-xs text-[#f1f5f9]">Starred Tasks Only</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={filterStarredOnly}
                    onChange={e => setFilterStarredOnly(e.target.checked)}
                    className="w-4 h-4 rounded border-[#1e293b] text-blue-600 focus:ring-0 cursor-pointer"
                  />
                </div>

                {/* Save Current Multi-Filters as View Trigger */}
                <button
                  type="button"
                  onClick={() => {
                    setIsFilterDrawerOpen(false);
                    setIsSaveViewModalOpen(true);
                  }}
                  className="w-full py-2.5 px-3 bg-[#1e293b] hover:bg-[#334155] border border-dashed border-[#475569] text-xs text-blue-400 rounded-xl font-medium flex items-center justify-center gap-1.5 transition"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>Save Multi-Filters as View</span>
                </button>

              </div>

              {/* Drawer Footer Actions */}
              <div className="p-3 border-t border-[#1e293b] flex gap-2">
                <button
                  onClick={() => {
                    setFilterProjects([]);
                    setFilterStatuses([]);
                    setFilterStatusCategory('open');
                    setFilterType('');
                    setFilterAssignee('');
                    setFilterPriority('');
                    setFilterStarredOnly(false);
                  }}
                  className="flex-1 py-2 bg-[#1e293b] hover:bg-[#334155] text-xs text-[#f1f5f9] rounded-xl font-medium transition"
                >
                  Reset
                </button>
                <button
                  onClick={() => setIsFilterDrawerOpen(false)}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-xs text-white rounded-xl font-medium transition"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Searchable Multi-Project Picker Modal (Filter Drawer) */}
        {isProjectPickerOpen && (
          <div 
            className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end sm:justify-center sm:p-4 animate-in fade-in duration-150 overflow-hidden"
            onClick={() => setIsProjectPickerOpen(false)}
          >
            <div 
              style={{
                maxHeight: visualViewportHeight ? `${Math.min(visualViewportHeight - 16, 600)}px` : undefined
              }}
              className="bg-[#0f172a] border border-[#1e293b] rounded-t-3xl sm:rounded-2xl max-h-[85vh] sm:max-h-[600px] flex flex-col shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-3.5 border-b border-[#1e293b] flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-xs font-mono font-bold uppercase text-[#f1f5f9]">Select Projects</h3>
                  <span className="text-[11px] text-[#64748b]">
                    {filterProjects.length} of {uniqueProjects.length} selected
                  </span>
                </div>
                <button onClick={() => setIsProjectPickerOpen(false)} className="p-1 text-[#64748b] hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Search Field & Quick Actions */}
              <div className="p-3 border-b border-[#1e293b] shrink-0 bg-[#090d16]/60 space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#64748b]" />
                  <input
                    type="text"
                    autoFocus
                    value={projectPickerSearch}
                    onChange={e => setProjectPickerSearch(e.target.value)}
                    placeholder="Search project name..."
                    className="w-full bg-[#0f172a] text-xs text-[#f1f5f9] rounded-xl pl-9 pr-8 py-2 border border-[#1e293b] focus:outline-none focus:border-blue-500 placeholder:text-[#64748b]"
                  />
                  {projectPickerSearch && (
                    <button onClick={() => setProjectPickerSearch('')} className="absolute right-2.5 top-2 text-[#64748b] hover:text-white p-0.5">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex justify-between items-center text-xs">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setFilterProjects(uniqueProjects.map(p => p.name))}
                      className="text-[11px] text-blue-400 hover:underline"
                    >
                      Select All
                    </button>
                    <button 
                      onClick={() => setFilterProjects([])}
                      className="text-[11px] text-[#64748b] hover:text-white"
                    >
                      Clear
                    </button>
                  </div>
                  <button 
                    onClick={() => setIsProjectPickerOpen(false)}
                    className="bg-blue-600 text-white text-[11px] px-2.5 py-1 rounded-lg font-medium"
                  >
                    Done
                  </button>
                </div>
              </div>

              {/* Filtered Project List with Checkboxes */}
              <div className="flex-1 overflow-y-auto divide-y divide-[#1e293b]/50 p-1">
                {filteredProjectPickerList.map(p => {
                  const isSelected = filterProjects.includes(p.name);
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggleProjectFilter(p.name)}
                      className={`w-full p-2.5 rounded-xl flex items-center justify-between text-left text-xs transition ${
                        isSelected ? 'bg-blue-600/20 text-blue-300 font-semibold' : 'text-slate-300 hover:bg-[#1e293b]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition ${
                          isSelected ? 'bg-blue-600 border-blue-500' : 'border-[#334155]'
                        }`}>
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <FolderKanban className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="truncate">{p.name}</span>
                      </div>
                    </button>
                  );
                })}

                {filteredProjectPickerList.length === 0 && projectPickerSearch && (
                  <div className="p-6 text-center text-xs text-[#64748b]">
                    No projects matching "{projectPickerSearch}"
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Searchable Assignee Picker Modal (Filter Drawer) */}
        {isDrawerAssigneePickerOpen && (
          <div 
            className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end sm:justify-center sm:p-4 animate-in fade-in duration-150 overflow-hidden"
            onClick={() => setIsDrawerAssigneePickerOpen(false)}
          >
            <div 
              style={{
                maxHeight: visualViewportHeight ? `${Math.min(visualViewportHeight - 16, 600)}px` : undefined
              }}
              className="bg-[#0f172a] border border-[#1e293b] rounded-t-3xl sm:rounded-2xl max-h-[85vh] sm:max-h-[600px] flex flex-col shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-3.5 border-b border-[#1e293b] flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-xs font-mono font-bold uppercase text-[#f1f5f9]">Filter by Assignee</h3>
                  <span className="text-[11px] text-[#64748b]">
                    {filterProjects.length > 0 ? `Members in ${filterProjects.length} project(s)` : `All members`} ({filterDrawerAssignees.length})
                  </span>
                </div>
                <button onClick={() => setIsDrawerAssigneePickerOpen(false)} className="p-1 text-[#64748b] hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 border-b border-[#1e293b] shrink-0 bg-[#090d16]/60">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#64748b]" />
                  <input
                    type="text"
                    autoFocus
                    value={drawerAssigneePickerSearch}
                    onChange={e => setDrawerAssigneePickerSearch(e.target.value)}
                    placeholder="Search assignee..."
                    className="w-full bg-[#0f172a] text-xs text-[#f1f5f9] rounded-xl pl-9 pr-8 py-2 border border-[#1e293b] focus:outline-none focus:border-blue-500 placeholder:text-[#64748b]"
                  />
                  {drawerAssigneePickerSearch && (
                    <button onClick={() => setDrawerAssigneePickerSearch('')} className="absolute right-2.5 top-2 text-[#64748b] hover:text-white p-0.5">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-[#1e293b]/50 p-1">
                {/* Option 1: All Assignees */}
                {(!drawerAssigneePickerSearch || 'all assignees'.includes(drawerAssigneePickerSearch.toLowerCase())) && (
                  <button
                    onClick={() => {
                      setFilterAssignee('');
                      setIsDrawerAssigneePickerOpen(false);
                    }}
                    className={`w-full p-2.5 rounded-xl flex items-center justify-between text-left text-xs transition ${
                      !filterAssignee ? 'bg-blue-600/20 text-blue-300 font-semibold' : 'text-slate-300 hover:bg-[#1e293b]'
                    }`}
                  >
                    <span>All Assignees</span>
                    {!filterAssignee && <Check className="w-4 h-4 text-blue-400" />}
                  </button>
                )}

                {/* Option 2: Assigned to Me */}
                {(!drawerAssigneePickerSearch || 'me'.includes(drawerAssigneePickerSearch.toLowerCase()) || currentUser.name.toLowerCase().includes(drawerAssigneePickerSearch.toLowerCase())) && (
                  <button
                    onClick={() => {
                      setFilterAssignee('me');
                      setIsDrawerAssigneePickerOpen(false);
                    }}
                    className={`w-full p-2.5 rounded-xl flex items-center justify-between text-left text-xs transition ${
                      filterAssignee === 'me' ? 'bg-blue-600/20 text-blue-300 font-semibold' : 'text-slate-300 hover:bg-[#1e293b]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                        ME
                      </div>
                      <span>Assigned to Me ({currentUser.name})</span>
                    </div>
                    {filterAssignee === 'me' && <Check className="w-4 h-4 text-blue-400" />}
                  </button>
                )}

                {/* Option 3: Unassigned */}
                {(!drawerAssigneePickerSearch || 'unassigned'.includes(drawerAssigneePickerSearch.toLowerCase())) && (
                  <button
                    onClick={() => {
                      setFilterAssignee('unassigned');
                      setIsDrawerAssigneePickerOpen(false);
                    }}
                    className={`w-full p-2.5 rounded-xl flex items-center justify-between text-left text-xs transition ${
                      filterAssignee === 'unassigned' ? 'bg-blue-600/20 text-blue-300 font-semibold' : 'text-slate-300 hover:bg-[#1e293b]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[#1e293b] text-[#64748b] flex items-center justify-center text-xs">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <span>Unassigned</span>
                    </div>
                    {filterAssignee === 'unassigned' && <Check className="w-4 h-4 text-blue-400" />}
                  </button>
                )}

                {/* Filtered Project Assignees */}
                {filteredDrawerAssigneeList.map(u => {
                  const isSelected = filterAssignee === u.id;
                  const initials = u.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                  return (
                    <button
                      key={u.id}
                      onClick={() => {
                        setFilterAssignee(u.id);
                        setIsDrawerAssigneePickerOpen(false);
                      }}
                      className={`w-full p-2.5 rounded-xl flex items-center justify-between text-left text-xs transition ${
                        isSelected ? 'bg-blue-600/20 text-blue-300 font-semibold' : 'text-slate-300 hover:bg-[#1e293b]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <div className="w-7 h-7 rounded-full bg-blue-600/20 text-blue-400 font-mono text-[11px] flex items-center justify-center font-bold shrink-0">
                          {initials}
                        </div>
                        <span className="truncate">{u.name}</span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-blue-400 shrink-0" />}
                    </button>
                  );
                })}

                {filteredDrawerAssigneeList.length === 0 && drawerAssigneePickerSearch && (
                  <div className="p-6 text-center text-xs text-[#64748b]">
                    No members matching "{drawerAssigneePickerSearch}"
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Direct Add Effort Popup (Search Tickets by Number & Log Effort) */}
        {isAddEffortModalOpen && (
          <div 
            className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end sm:justify-center sm:p-4 animate-in fade-in duration-150 overflow-hidden"
            onClick={() => setIsAddEffortModalOpen(false)}
          >
            <div 
              style={{
                maxHeight: visualViewportHeight ? `${Math.min(visualViewportHeight - 16, 640)}px` : undefined
              }}
              className="bg-[#0f172a] border border-[#1e293b] rounded-t-3xl sm:rounded-2xl max-h-[92%] sm:max-h-[640px] flex flex-col shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-3.5 border-b border-[#1e293b] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-mono font-bold uppercase text-[#f1f5f9]">Log Time Effort</h3>
                </div>
                <button onClick={() => setIsAddEffortModalOpen(false)} className="p-1 text-[#64748b] hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3.5 overflow-y-auto overscroll-contain pb-12">
                {/* 1. Ticket Selector / Searcher */}
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#64748b] mb-1">
                    Select Work Package
                  </label>

                  {effortSelectedTicket ? (
                    <div className="p-3.5 bg-[#090d16] border border-blue-500/30 rounded-xl space-y-2.5">
                      {/* Top row: ID, Type, Status & Change button */}
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

                      {/* Ticket Title */}
                      <p className="text-xs font-semibold text-[#f1f5f9] leading-snug">
                        {effortSelectedTicket.subject}
                      </p>

                      {/* Details row: Project, Assignee, Spent time */}
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
                              onFocus={e => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' })}
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

                          {/* Quick Fetch or Search Button */}
                          {hasValidTargetId ? (
                            <button
                              type="button"
                              disabled={isFetchingEffortTicket}
                              onClick={() => fetchTicketForEffort(effortTargetId)}
                              className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-mono font-medium shrink-0 flex items-center gap-1.5 transition shadow-sm"
                            >
                              {isFetchingEffortTicket ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Fetch Details'}
                            </button>
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

                        {/* Loading status */}
                        {isFetchingEffortTicket && (
                          <div className="p-3 bg-[#090d16] border border-blue-500/20 rounded-xl flex items-center justify-center gap-2 text-xs font-mono text-blue-400">
                            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                            <span>Querying OpenProject server...</span>
                          </div>
                        )}

                        {/* Error feedback */}
                        {effortTicketFetchError && (
                          <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-xl flex items-start gap-2 text-xs text-red-300">
                            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <span>{effortTicketFetchError}</span>
                            </div>
                          </div>
                        )}

                        {/* Matching Tickets List */}
                        <div className="max-h-56 overflow-y-auto divide-y divide-[#1e293b] border border-[#1e293b] rounded-xl bg-[#090d16]">
                          {/* If numeric ID or OP URL, provide direct query option at the top */}
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

                          {effortTicketSearchResults.map(t => (
                            <div
                              key={t.id}
                              onClick={() => setEffortSelectedTicket(t)}
                              className="p-2.5 hover:bg-[#1e293b] cursor-pointer transition text-xs flex items-center justify-between"
                            >
                              <div className="truncate pr-2">
                                <span className="font-mono font-bold text-blue-400 mr-1.5">#{t.id}</span>
                                <span className="text-slate-300 font-medium">{t.subject}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                  {t.status}
                                </span>
                                <span className="text-[10px] font-mono text-[#64748b] truncate max-w-[100px]">{t.project}</span>
                              </div>
                            </div>
                          ))}

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
                    onFocus={e => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' })}
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
                    onFocus={e => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' })}
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
            </div>
          </div>
        )}

        {/* Edit Existing Logged Effort Modal */}
        {editingEffort && (
          <div 
            className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end sm:justify-center sm:p-4 animate-in fade-in duration-150 overflow-hidden"
            onClick={() => setEditingEffort(null)}
          >
            <div 
              style={{
                maxHeight: visualViewportHeight ? `${Math.min(visualViewportHeight - 16, 640)}px` : undefined
              }}
              className="bg-[#0f172a] border border-[#1e293b] rounded-t-3xl sm:rounded-2xl max-h-[92%] sm:max-h-[640px] flex flex-col shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-3.5 border-b border-[#1e293b] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-blue-400" />
                  <h3 className="text-xs font-mono font-bold uppercase text-[#f1f5f9]">Edit Logged Effort</h3>
                </div>
                <button onClick={() => setEditingEffort(null)} className="p-1 text-[#64748b] hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3.5 overflow-y-auto overscroll-contain pb-12">
                {/* Work package info */}
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

                {/* Hours presets & custom input */}
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
                    onFocus={e => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                    onChange={e => setEditEffortHours(e.target.value)}
                    placeholder="Custom hours (e.g. 1.25)"
                    className="w-full bg-[#090d16] border border-[#1e293b] rounded-xl px-3 py-2 text-xs font-mono text-[#f1f5f9] focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Spent on date */}
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

                {/* Comment */}
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#64748b] mb-1">
                    Comment / Description
                  </label>
                  <input
                    type="text"
                    value={editEffortComment}
                    onFocus={e => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                    onChange={e => setEditEffortComment(e.target.value)}
                    placeholder="What did you work on?"
                    className="w-full bg-[#090d16] border border-[#1e293b] rounded-xl px-3 py-2 text-xs text-[#f1f5f9] focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Actions: Delete and Save */}
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
            </div>
          </div>
        )}

        {/* Save View Modal (OpenProject View Feature) */}
        {isSaveViewModalOpen && (
          <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in overflow-hidden">
            <div 
              style={{
                maxHeight: visualViewportHeight ? `${Math.min(visualViewportHeight - 16, 480)}px` : undefined
              }}
              className="bg-[#0f172a] border border-[#1e293b] rounded-2xl w-full max-w-sm p-4 space-y-3.5 shadow-2xl overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
                <div className="flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-blue-400" />
                  <h3 className="text-xs font-mono font-bold uppercase text-[#f1f5f9]">Save Current View</h3>
                </div>
                <button onClick={() => setIsSaveViewModalOpen(false)} className="text-[#64748b] hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase text-[#64748b] mb-1">View Name</label>
                <input
                  type="text"
                  value={newViewName}
                  onFocus={e => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                  onChange={e => setNewViewName(e.target.value)}
                  placeholder="e.g. D365 & James Team Bugs..."
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
            </div>
          </div>
        )}

        {/* Settings & Connection Modal (Only accessible via top Settings button) */}
        {isSettingsOpen && (
          <div 
            className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end sm:justify-center sm:p-4 animate-in fade-in duration-150 overflow-hidden"
            onClick={() => setIsSettingsOpen(false)}
          >
            <div 
              style={{
                maxHeight: visualViewportHeight ? `${Math.min(visualViewportHeight - 16, 680)}px` : undefined
              }}
              className="bg-[#0f172a] border border-[#1e293b] rounded-t-3xl sm:rounded-2xl max-h-[92%] sm:max-h-[680px] flex flex-col shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Settings Header */}
              <div className="p-3.5 border-b border-[#1e293b] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-blue-400" />
                  <h3 className="text-xs font-mono font-bold uppercase text-[#f1f5f9]">Settings & Connection</h3>
                </div>
                <button onClick={() => setIsSettingsOpen(false)} className="p-1 text-[#64748b] hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Settings Body */}
              <div className="p-4 space-y-4 overflow-y-auto overscroll-contain pb-8">
                {/* Active user status badge */}
                {currentUser && (
                  <div className="p-3 bg-[#090d16] border border-[#1e293b] rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-blue-600/20 text-blue-400 font-mono text-xs flex items-center justify-center font-bold shrink-0">
                        {currentUser.name ? currentUser.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : 'OP'}
                      </div>
                      <div className="min-w-0 truncate">
                        <span className="text-xs font-semibold text-[#f1f5f9] block truncate">{currentUser.name}</span>
                        <span className="text-[10px] font-mono text-[#64748b]">User ID #{currentUser.id}</span>
                      </div>
                    </div>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border shrink-0 ${isOnline ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                      {isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                )}

                {/* Status Notice */}
                {settingsNotice && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl font-mono">
                    {settingsNotice}
                  </div>
                )}

                {/* Host URL input */}
                <div>
                  <label className="block text-xs font-mono uppercase text-[#64748b] mb-1.5">OpenProject Host URL</label>
                  <input 
                    type="text" 
                    value={opUrl}
                    onFocus={e => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                    onChange={e => setOpUrl(e.target.value)}
                    className="w-full bg-[#090d16] border border-[#1e293b] rounded-xl p-3 text-xs text-[#f1f5f9] focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                {/* OP Key input */}
                <div>
                  <label className="block text-xs font-mono uppercase text-[#64748b] mb-1.5">OpenProject API Key</label>
                  <input 
                    type="password" 
                    value={opApiKey}
                    onFocus={e => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                    onChange={e => setOpApiKey(e.target.value)}
                    placeholder="Enter OpenProject API key..."
                    className="w-full bg-[#090d16] border border-[#1e293b] rounded-xl p-3 text-xs text-[#f1f5f9] focus:outline-none focus:border-blue-500 font-mono"
                  />
                  <span className="text-[10px] text-[#64748b] font-mono mt-1 block">
                    Saved locally on this device. Used for fetching tickets, logging efforts, and loading attachments.
                  </span>
                </div>

                {/* Save credentials button */}
                <button 
                  onClick={async () => {
                    await handleSaveSettings();
                    setIsSettingsOpen(false);
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-xl text-xs transition font-mono flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30"
                >
                  <Check className="w-4 h-4" />
                  <span>Save Credentials & Sync</span>
                </button>

                {/* Section Divider: Google Sheet & Excel Dual-Sync */}
                <div className="pt-3 border-t border-[#1e293b] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono uppercase text-[#64748b] block">
                      Google Sheet & Excel Dual-Sync
                    </span>
                    {sheetLastSyncTime && (
                      <span className="text-[10px] font-mono text-emerald-400">
                        Synced: {sheetLastSyncTime}
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase text-[#64748b] mb-1">
                      Apps Script Web App URL
                    </label>
                    <input 
                      type="url" 
                      value={opSheetUrl}
                      onFocus={e => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                      onChange={e => setOpSheetUrl(e.target.value)}
                      placeholder="https://script.google.com/macros/s/.../exec"
                      className="w-full bg-[#090d16] border border-[#1e293b] rounded-xl p-2.5 text-xs text-[#f1f5f9] focus:outline-none focus:border-blue-500 font-mono"
                    />
                    <span className="text-[10px] text-[#64748b] font-mono mt-1 block">
                      Syncs views, projects, statuses, tickets & efforts to Google Sheet / Excel. If cache is wiped, restores everything automatically.
                    </span>
                  </div>

                  {/* Dual Sync Action Buttons */}
                  <div className="grid grid-cols-2 gap-2 pt-0.5">
                    <button
                      type="button"
                      disabled={isSyncingSheet || !opSheetUrl}
                      onClick={handleSyncAllToSheet}
                      className="bg-[#090d16] hover:bg-[#1e293b] disabled:opacity-40 border border-[#1e293b] text-xs font-mono py-2.5 px-2 rounded-xl text-emerald-400 font-medium transition flex items-center justify-center gap-1.5"
                    >
                      <UploadCloud className={`w-3.5 h-3.5 ${isSyncingSheet ? 'animate-spin' : ''}`} />
                      <span>{isSyncingSheet ? 'Syncing...' : 'Backup to Sheet'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isRestoringSheet || !opSheetUrl}
                      onClick={handleRestoreFromSheet}
                      className="bg-[#090d16] hover:bg-[#1e293b] disabled:opacity-40 border border-[#1e293b] text-xs font-mono py-2.5 px-2 rounded-xl text-blue-400 font-medium transition flex items-center justify-center gap-1.5"
                    >
                      <DownloadCloud className={`w-3.5 h-3.5 ${isRestoringSheet ? 'animate-spin' : ''}`} />
                      <span>{isRestoringSheet ? 'Restoring...' : 'Restore from Sheet'}</span>
                    </button>
                  </div>
                </div>

                {/* Section Divider: PWA & Cache Management */}
                <div className="pt-3 border-t border-[#1e293b] space-y-2">
                  <span className="text-[11px] font-mono uppercase text-[#64748b] block">
                    PWA Updates & Cache
                  </span>

                  {/* Refresh PWA Button */}
                  <button
                    type="button"
                    disabled={isRefreshingPWA}
                    onClick={handleRefreshPWA}
                    className="w-full bg-[#090d16] hover:bg-[#1e293b] border border-[#1e293b] hover:border-slate-600 text-slate-200 py-2.5 px-3 rounded-xl text-xs font-mono transition flex items-center justify-center gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 text-emerald-400 ${isRefreshingPWA ? 'animate-spin' : ''}`} />
                    <span>{isRefreshingPWA ? 'Updating PWA & Cache...' : 'Refresh PWA & Clear Cache'}</span>
                  </button>
                  <span className="text-[10px] text-[#64748b] font-mono block text-center">
                    Purges service worker cache, loads the newest app deployment, and reloads the page.
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Detail Sheet Modal / Full View (Tapped from List) */}
        {selectedTicket && (
          <div className="absolute inset-0 z-30 bg-[#0f172a] flex flex-col animate-in slide-in-from-right duration-200">
            {/* Sheet Header */}
            <div className="p-3.5 border-b border-[#1e293b] flex items-center justify-between bg-[#090d16]/80 shrink-0">
              <button 
                onClick={() => setSelectedTicketId(null)} 
                className="flex items-center gap-1.5 text-xs text-blue-400 font-medium py-1 px-2 -ml-2 rounded hover:bg-[#1e293b] transition"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <div className="flex items-center gap-2">
                <button 
                  onClick={(e) => handleToggleStar(e, selectedTicket.id)}
                  className={`p-1.5 rounded transition ${selectedTicket.starred ? 'text-amber-400' : 'text-[#64748b] hover:text-white'}`}
                  title={selectedTicket.starred ? 'Starred' : 'Star for daily access'}
                >
                  <Star className={`w-4 h-4 ${selectedTicket.starred ? 'fill-current' : ''}`} />
                </button>

                {selectedTicket.pendingSync && (
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    PENDING SYNC
                  </span>
                )}
                <span className="font-mono text-xs font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                  #{selectedTicket.id}
                </span>
                <a 
                  href={`${opUrl.replace(/\/+$/, '')}/work_packages/${selectedTicket.id}`}
                  target="_blank"
                  rel="noreferrer"
                  title="Open in OpenProject Website"
                  className="p-1 text-[#64748b] hover:text-[#f1f5f9] transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Sheet Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              
              {/* Project & Subject */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-[#64748b] font-mono uppercase">
                    {selectedTicket.project}
                  </span>
                  {selectedTicket.type && (
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded border border-[#1e293b] text-slate-300">
                      {selectedTicket.type}
                    </span>
                  )}
                </div>
                <h2 className="text-sm font-semibold text-[#f1f5f9] leading-snug">
                  {selectedTicket.subject}
                </h2>
              </div>

              {/* Effort & Time Summary Banner */}
              <div className="bg-[#090d16] border border-[#1e293b] rounded-2xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-mono uppercase text-[#64748b] tracking-wider">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Effort & Time Tracking</span>
                  </div>
                  {isLoadingTicketEfforts && (
                    <div className="flex items-center gap-1 text-[10px] font-mono text-[#64748b]">
                      <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                      <span>Syncing...</span>
                    </div>
                  )}
                </div>

                {/* 3-Column Stats Grid */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-2.5">
                    <span className="text-[10px] font-mono uppercase text-[#64748b] block mb-0.5">Total Spent</span>
                    <span className="text-sm font-mono font-bold text-emerald-400">
                      {selectedTicketStats.spentHours}h
                    </span>
                  </div>

                  <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-2.5">
                    <span className="text-[10px] font-mono uppercase text-[#64748b] block mb-0.5">Estimated</span>
                    <span className="text-sm font-mono font-bold text-[#f1f5f9]">
                      {selectedTicketStats.estimatedHours > 0 ? `${selectedTicketStats.estimatedHours}h` : '-'}
                    </span>
                  </div>

                  <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-2.5">
                    <span className="text-[10px] font-mono uppercase text-[#64748b] block mb-0.5">Your Effort</span>
                    <span className="text-sm font-mono font-bold text-blue-400">
                      {selectedTicketStats.mySpentHours > 0 ? `${selectedTicketStats.mySpentHours}h` : '0h'}
                    </span>
                  </div>
                </div>

                {/* Progress Bar (if estimated hours exist) */}
                {selectedTicketStats.estimatedHours > 0 && (
                  <div className="space-y-1.5 pt-0.5">
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="text-[#64748b]">
                        Progress ({selectedTicketStats.percent}%)
                      </span>
                      <span className={selectedTicketStats.spentHours > selectedTicketStats.estimatedHours ? 'text-amber-400 font-semibold' : 'text-slate-400'}>
                        {selectedTicketStats.remainingHours !== null && selectedTicketStats.remainingHours > 0 
                          ? `${selectedTicketStats.remainingHours}h remaining` 
                          : selectedTicketStats.spentHours > selectedTicketStats.estimatedHours
                            ? `+${+(selectedTicketStats.spentHours - selectedTicketStats.estimatedHours).toFixed(2)}h over estimate`
                            : 'Estimate reached'}
                      </span>
                    </div>
                    <div className="w-full bg-[#0f172a] rounded-full h-1.5 overflow-hidden border border-[#1e293b]">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${
                          selectedTicketStats.spentHours > selectedTicketStats.estimatedHours 
                            ? 'bg-amber-400' 
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, selectedTicketStats.percent || 0)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Real OpenProject Status Selector */}
              <div className="bg-[#090d16] border border-[#1e293b] rounded-2xl p-3.5 space-y-2">
                <span className="text-xs font-mono uppercase text-[#64748b] tracking-wider block">
                  Status
                </span>
                <select
                  value={selectedTicket.statusId || ''}
                  onChange={(e) => {
                    const st = displayStatuses.find(s => s.id === e.target.value);
                    if (st) handleUpdateStatus(selectedTicket, st.id, st.name);
                  }}
                  className="w-full bg-[#0f172a] text-xs text-[#f1f5f9] border border-[#1e293b] rounded-xl p-2.5 focus:outline-none focus:border-blue-500 cursor-pointer font-medium"
                >
                  {displayStatuses.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Searchable Assignee Selector Modal Trigger (STRICTLY ASSOCIATED WITH THIS TICKET'S PROJECT) */}
              <div className="bg-[#090d16] border border-[#1e293b] rounded-2xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase text-[#64748b] tracking-wider block">
                    Assignee
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                    <User className="w-3 h-3 text-blue-400" />
                    <span>{selectedTicketProjectAssignees.length} project member(s)</span>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setAssigneePickerSearch('');
                    setIsAssigneePickerOpen(true);
                  }}
                  className="w-full bg-[#0f172a] text-xs text-[#f1f5f9] border border-[#1e293b] hover:border-blue-500/50 rounded-xl p-2.5 flex items-center justify-between transition group"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <div className="w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 font-mono text-[10px] flex items-center justify-center font-bold shrink-0">
                      {selectedTicket.assignee && selectedTicket.assignee.toLowerCase() !== 'unassigned'
                        ? selectedTicket.assignee.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                        : '-'}
                    </div>
                    <span className="font-medium truncate">
                      {selectedTicket.assignee && selectedTicket.assignee.toLowerCase() !== 'unassigned'
                        ? selectedTicket.assignee
                        : 'Unassigned'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[#64748b] group-hover:text-blue-400 shrink-0">
                    <span className="text-[10px] font-mono uppercase">Change</span>
                    <Search className="w-3.5 h-3.5" />
                  </div>
                </button>
              </div>

              {/* Ticket Details (Markdown Description with Click-to-Zoom Images) */}
              <div className="bg-[#090d16] border border-[#1e293b] rounded-2xl p-3.5 space-y-2">
                <span className="text-xs font-mono uppercase text-[#64748b] tracking-wider block">
                  Description & Details
                </span>
                {selectedTicket.description ? (
                  <div className="text-xs text-slate-300 prose prose-invert prose-xs max-w-none break-words leading-relaxed">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw]}
                      components={{
                        img: ({ node: _node, ...props }) => (
                          <AuthenticatedImage
                            src={props.src}
                            alt={props.alt}
                            onZoom={(url) => setZoomedImageUrl(url)}
                          />
                        )
                      }}
                    >
                      {preprocessOpenProjectMarkdown(selectedTicket.description)}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-xs text-[#64748b] italic">No description provided for this ticket.</p>
                )}
              </div>

              {/* Log Effort Section on Ticket */}
              <div className="bg-[#090d16] border border-[#1e293b] rounded-2xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase text-[#64748b] tracking-wider">
                    Log Time Effort
                  </span>
                  <div className="text-right">
                    <span className="text-xs font-mono text-emerald-400 font-bold">
                      {selectedTicketStats.spentHours}h Logged
                    </span>
                  </div>
                </div>

                {/* Date Selection Control */}
                <div className="flex items-center justify-between gap-1.5 bg-[#0f172a] border border-[#1e293b] rounded-xl px-2.5 py-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-[#64748b] font-mono shrink-0">
                    <Calendar className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-[11px] uppercase">Date</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setTicketEffortDate(todayStr)}
                      className={`px-2 py-0.5 rounded-lg text-[11px] font-mono transition ${
                        ticketEffortDate === todayStr 
                          ? 'bg-blue-600 text-white font-semibold shadow-sm' 
                          : 'bg-[#1e293b] text-slate-400 hover:text-white'
                      }`}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => setTicketEffortDate(yesterdayStr)}
                      className={`px-2 py-0.5 rounded-lg text-[11px] font-mono transition ${
                        ticketEffortDate === yesterdayStr 
                          ? 'bg-blue-600 text-white font-semibold shadow-sm' 
                          : 'bg-[#1e293b] text-slate-400 hover:text-white'
                      }`}
                    >
                      Yesterday
                    </button>
                    <input
                      type="date"
                      value={ticketEffortDate}
                      onChange={e => setTicketEffortDate(e.target.value)}
                      className="bg-[#090d16] border border-[#1e293b] text-[#f1f5f9] rounded-lg px-2 py-0.5 text-xs font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Preset quick buttons */}
                <div className="grid grid-cols-4 gap-2">
                  {[0.5, 1.0, 2.0, 4.0].map(hrs => (
                    <button
                      key={hrs}
                      onClick={() => handleLogEffortDirect(selectedTicket.id, selectedTicket.subject, hrs, ticketEffortDate || todayStr, 'Work on ticket')}
                      className="py-2 rounded-xl bg-[#0f172a] hover:bg-[#1e293b] border border-[#1e293b] text-xs font-mono font-semibold text-emerald-400 transition"
                    >
                      +{hrs}h
                    </button>
                  ))}
                </div>

                {/* Custom effort input */}
                <div className="space-y-2 pt-1">
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.25"
                      value={customEffortHours}
                      onFocus={e => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                      onChange={e => setCustomEffortHours(e.target.value)}
                      placeholder="Hours (e.g. 1.5)"
                      className="w-28 bg-[#0f172a] border border-[#1e293b] rounded-xl px-3 py-2 text-xs font-mono text-[#f1f5f9] focus:outline-none focus:border-blue-500"
                    />
                    <input
                      type="text"
                      value={customEffortComment}
                      onFocus={e => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                      onChange={e => setCustomEffortComment(e.target.value)}
                      placeholder="Work comment..."
                      className="flex-1 bg-[#0f172a] border border-[#1e293b] rounded-xl px-3 py-2 text-xs text-[#f1f5f9] focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <button
                    onClick={() => {
                      const h = parseFloat(customEffortHours);
                      if (h > 0) {
                        handleLogEffortDirect(selectedTicket.id, selectedTicket.subject, h, ticketEffortDate || todayStr, customEffortComment);
                        setCustomEffortHours('');
                        setCustomEffortComment('');
                      }
                    }}
                    disabled={!customEffortHours || parseFloat(customEffortHours) <= 0}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium py-2 rounded-xl text-xs transition font-mono flex items-center justify-center gap-1.5"
                  >
                    <span>Log Effort</span>
                    <span className="opacity-80 text-[10px]">({ticketEffortDate === todayStr ? 'Today' : ticketEffortDate === yesterdayStr ? 'Yesterday' : ticketEffortDate})</span>
                  </button>
                </div>
              </div>

              {/* Logged Efforts History on Ticket */}
              <div className="bg-[#090d16] border border-[#1e293b] rounded-2xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono uppercase text-[#64748b] tracking-wider">
                      Effort History
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1e293b] text-slate-300">
                      {ticketEffortsList.length}
                    </span>
                  </div>
                  {isLoadingTicketEfforts && (
                    <div className="flex items-center gap-1 text-[10px] font-mono text-[#64748b]">
                      <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                      <span>Fetching...</span>
                    </div>
                  )}
                </div>

                {isLoadingTicketEfforts && ticketEffortsList.length === 0 ? (
                  <div className="py-4 text-center text-xs text-[#64748b] font-mono flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                    <span>Loading logged efforts...</span>
                  </div>
                ) : ticketEffortsList.length === 0 ? (
                  <p className="text-xs text-[#64748b] italic py-1">No efforts logged yet on this ticket.</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {ticketEffortsList.map(entry => (
                      <div 
                        key={entry.id}
                        className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-2.5 flex items-start justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-[#f1f5f9] truncate max-w-[140px]">
                              {entry.userName}
                            </span>
                            <span className="text-[10px] font-mono text-[#64748b]">
                              {entry.spentOn}
                            </span>
                            {entry.activity && (
                              <span className="text-[9px] font-mono px-1 py-0.2 rounded border border-[#1e293b] text-slate-400">
                                {entry.activity}
                              </span>
                            )}
                            {entry.pendingSync && (
                              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                Pending
                              </span>
                            )}
                          </div>
                          {entry.comment ? (
                            <p className="text-[11px] text-slate-300 break-words line-clamp-2">
                              {entry.comment}
                            </p>
                          ) : (
                            <p className="text-[11px] text-[#64748b] italic">
                              No comment
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5">
                          <span className="font-mono font-bold text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            +{entry.hours}h
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const cleanId = entry.id.replace(/^pending-/, '');
                              handleOpenEditEffort({
                                id: cleanId,
                                workPackageId: selectedTicketId!,
                                ticketSubject: selectedTicket?.subject || `Ticket #${selectedTicketId}`,
                                hours: entry.hours,
                                comment: entry.comment,
                                spentOn: entry.spentOn,
                                createdAt: new Date().toISOString(),
                                pendingSync: entry.pendingSync
                              });
                            }}
                            className="p-1 rounded-lg bg-[#090d16] border border-[#1e293b] text-slate-400 hover:text-blue-400 hover:border-blue-900/50 transition flex items-center justify-center"
                            title="Edit Effort"
                          >
                            <Pencil className="w-3 h-3 text-blue-400" />
                          </button>
                          <button
                            type="button"
                            disabled={deletingEffortId === entry.id}
                            onClick={() => handleDeleteTicketHistoryEntry(entry)}
                            className="p-1 rounded-lg bg-[#090d16] border border-[#1e293b] text-slate-400 hover:text-rose-400 hover:border-rose-900/50 hover:bg-rose-950/30 transition flex items-center justify-center disabled:opacity-50"
                            title="Delete Effort"
                          >
                            {deletingEffortId === entry.id ? (
                              <Loader2 className="w-3 h-3 animate-spin text-rose-400" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* Searchable Assignee Picker Modal (for Ticket Reassignment) */}
        {isAssigneePickerOpen && selectedTicket && (
          <div 
            className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end sm:justify-center sm:p-4 animate-in fade-in duration-150 overflow-hidden"
            onClick={() => setIsAssigneePickerOpen(false)}
          >
            <div 
              style={{
                maxHeight: visualViewportHeight ? `${Math.min(visualViewportHeight - 16, 600)}px` : undefined
              }}
              className="bg-[#0f172a] border border-[#1e293b] rounded-t-3xl sm:rounded-2xl max-h-[85vh] sm:max-h-[600px] flex flex-col shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-3.5 border-b border-[#1e293b] flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-xs font-mono font-bold uppercase text-[#f1f5f9]">Assign Ticket #{selectedTicket.id}</h3>
                  <span className="text-[11px] text-[#64748b]">
                    {selectedTicket.project} ({selectedTicketProjectAssignees.length} members)
                  </span>
                </div>
                <button 
                  onClick={() => setIsAssigneePickerOpen(false)} 
                  className="p-1 text-[#64748b] hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Search Field */}
              <div className="p-3 border-b border-[#1e293b] shrink-0 bg-[#090d16]/60">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#64748b]" />
                  <input
                    type="text"
                    autoFocus
                    value={assigneePickerSearch}
                    onChange={e => setAssigneePickerSearch(e.target.value)}
                    placeholder="Search member by name..."
                    className="w-full bg-[#0f172a] text-xs text-[#f1f5f9] rounded-xl pl-9 pr-8 py-2 border border-[#1e293b] focus:outline-none focus:border-blue-500 placeholder:text-[#64748b]"
                  />
                  {assigneePickerSearch && (
                    <button 
                      onClick={() => setAssigneePickerSearch('')}
                      className="absolute right-2.5 top-2 text-[#64748b] hover:text-white p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Filtered Members List */}
              <div className="flex-1 overflow-y-auto divide-y divide-[#1e293b]/50 p-1">
                {/* Unassigned Option */}
                {(!assigneePickerSearch || 'unassigned'.includes(assigneePickerSearch.toLowerCase())) && (
                  <button
                    onClick={() => {
                      handleUpdateAssignee(selectedTicket, '', 'Unassigned');
                      setIsAssigneePickerOpen(false);
                    }}
                    className={`w-full p-2.5 rounded-xl flex items-center justify-between text-left text-xs transition ${
                      !selectedTicket.assigneeId || selectedTicket.assignee.toLowerCase() === 'unassigned'
                        ? 'bg-blue-600/20 text-blue-300 font-semibold'
                        : 'text-slate-300 hover:bg-[#1e293b]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[#1e293b] text-[#64748b] flex items-center justify-center text-xs">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <span>Unassigned</span>
                    </div>
                    {(!selectedTicket.assigneeId || selectedTicket.assignee.toLowerCase() === 'unassigned') && (
                      <Check className="w-4 h-4 text-blue-400" />
                    )}
                  </button>
                )}

                {/* Filtered Project Members */}
                {filteredAssigneePickerList.map(u => {
                  const isSelected = selectedTicket.assigneeId === u.id;
                  const initials = u.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                  return (
                    <button
                      key={u.id}
                      onClick={() => {
                        handleUpdateAssignee(selectedTicket, u.id, u.name);
                        setIsAssigneePickerOpen(false);
                      }}
                      className={`w-full p-2.5 rounded-xl flex items-center justify-between text-left text-xs transition ${
                        isSelected 
                          ? 'bg-blue-600/20 text-blue-300 font-semibold' 
                          : 'text-slate-300 hover:bg-[#1e293b]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <div className="w-7 h-7 rounded-full bg-blue-600/20 text-blue-400 font-mono text-[11px] flex items-center justify-center font-bold shrink-0">
                          {initials}
                        </div>
                        <span className="truncate">{u.name}</span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-blue-400 shrink-0" />}
                    </button>
                  );
                })}

                {filteredAssigneePickerList.length === 0 && assigneePickerSearch && (
                  <div className="p-6 text-center text-xs text-[#64748b]">
                    No project members matching "{assigneePickerSearch}"
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Click-to-Zoom Image Lightbox Modal */}
        {zoomedImageUrl && (
          <div 
            className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-200"
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

        {/* Bottom Tab Bar (Tickets and Efforts) */}
        <nav className="border-t border-[#1e293b] bg-[#0f172a] grid grid-cols-2 shrink-0">
          <button
            onClick={() => {
              setActiveTab('tickets');
              setSelectedTicketId(null);
            }}
            className={`py-3 flex flex-col items-center gap-1 transition ${
              activeTab === 'tickets' ? 'text-blue-400 font-medium' : 'text-[#64748b] hover:text-[#f1f5f9]'
            }`}
          >
            <FolderKanban className="w-4 h-4" />
            <span className="text-[10px] uppercase font-mono tracking-wider">Tickets</span>
          </button>

          <button
            onClick={() => setActiveTab('efforts')}
            className={`py-3 flex flex-col items-center gap-1 transition ${
              activeTab === 'efforts' ? 'text-blue-400 font-medium' : 'text-[#64748b] hover:text-[#f1f5f9]'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span className="text-[10px] uppercase font-mono tracking-wider">Efforts</span>
          </button>
        </nav>

      </div>
    </div>
  );
}
