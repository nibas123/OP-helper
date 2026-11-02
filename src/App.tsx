import { useEffect, useState, useMemo, useCallback } from 'react';
import { 
  Search, 
  Settings, 
  ArrowLeft, 
  ExternalLink, 
  RefreshCw, 
  Clock, 
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
  Check
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  db, 
  type LocalTicket, 
  type LocalEffort, 
  type LookupItem, 
  type SavedView,
  DEFAULT_SAVED_VIEWS 
} from './services/db';
import { syncService, parseDurationToHours } from './services/syncService';
import { OpenProjectService } from './services/OpenProjectService';
import { extractTicketIdFromUrlOrText } from './utils/urlParser';
import { DEFAULT_STATUSES, DEFAULT_TYPES, DEFAULT_PRIORITIES } from './constants/opDefaults';

// Helper to get past 7 days for weekly effort breakdown
function getWeekDays(): { dateStr: string; label: string; dayName: string; isToday: boolean }[] {
  const result = [];
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const label = `${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'short' })}`;
    result.push({
      dateStr,
      label,
      dayName,
      isToday: dateStr === todayStr
    });
  }
  return result;
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
  const [activeTab, setActiveTab] = useState<'tickets' | 'efforts' | 'settings'>('tickets');

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchingRemote, setIsSearchingRemote] = useState(false);

  // Multi-Attribute Filter Drawer (OP-Style)
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [filterProject, setFilterProject] = useState<string>(''); // Project Name or ID
  const [filterStatusCategory, setFilterStatusCategory] = useState<'all' | 'open' | 'closed'>('open');
  const [filterStatus, setFilterStatus] = useState<string>(''); // Specific Status ID
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

  // Saved Views State (OpenProject Views feature)
  const [savedViews, setSavedViews] = useState<SavedView[]>(DEFAULT_SAVED_VIEWS);
  const [activeViewId, setActiveViewId] = useState<string>('sys_all_open');
  const [isViewsMenuOpen, setIsViewsMenuOpen] = useState(false);
  const [isSaveViewModalOpen, setIsSaveViewModalOpen] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [newViewFavorite, setNewViewFavorite] = useState(true);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [lastSyncText, setLastSyncText] = useState<string>('Local DB');
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // Clipboard detection
  const [clipboardTicketId, setClipboardTicketId] = useState<number | null>(null);

  // Efforts & Weekly Tracking
  const [allEfforts, setAllEfforts] = useState<LocalEffort[]>([]);
  const [selectedEffortDate, setSelectedEffortDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [customEffortHours, setCustomEffortHours] = useState('');
  const [customEffortComment, setCustomEffortComment] = useState('');

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

      const efforts = await db.getAllEfforts();
      setAllEfforts(efforts);

      const lastSync = await db.getMeta<number>('lastSyncTime');
      if (lastSync) {
        const minsAgo = Math.floor((Date.now() - lastSync) / 60000);
        setLastSyncText(minsAgo <= 0 ? 'Just now' : `${minsAgo}m ago`);
      } else {
        setLastSyncText('Local DB');
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
    if (!searchQuery.trim()) return;
    setIsSearchingRemote(true);
    showEphemeralNotice('Searching OpenProject server...');

    const results = await syncService.searchRemoteAndCache(searchQuery);
    setIsSearchingRemote(false);
    await loadLocalData();

    if (results.length > 0) {
      showEphemeralNotice(`Found & stored ${results.length} ticket(s) locally`);
    } else {
      showEphemeralNotice('No tickets found on server');
    }
  };

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

  // --- Log Effort ---
  const handleLogEffort = async (hours: number, comment: string) => {
    if (!selectedTicket || hours <= 0) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const newEffort: LocalEffort = {
      id: `effort_${Date.now()}`,
      workPackageId: selectedTicket.id,
      ticketSubject: selectedTicket.subject,
      hours: hours,
      comment: comment || 'Effort logged via OP Mobile',
      spentOn: todayStr,
      createdAt: new Date().toISOString(),
      pendingSync: true
    };

    await db.putEffort(newEffort);
    setAllEfforts(prev => [newEffort, ...prev]);

    const currentSpent = parseDurationToHours(selectedTicket.spentTime);
    const newSpent = +(currentSpent + hours).toFixed(2);
    const updatedTicket: LocalTicket = {
      ...selectedTicket,
      spentTime: `PT${Math.floor(newSpent)}H${Math.round((newSpent % 1) * 60)}M`,
      pendingSync: true
    };
    await db.putTicket(updatedTicket);
    setTickets(prev => prev.map(t => t.id === selectedTicket.id ? updatedTicket : t));

    await db.enqueueSyncItem({
      id: `time_${selectedTicket.id}_${Date.now()}`,
      type: 'LOG_TIME',
      payload: {
        ticketId: selectedTicket.id,
        hours: `PT${Math.floor(hours)}H${Math.round((hours % 1) * 60)}M`,
        comment: newEffort.comment,
        date: todayStr
      },
      createdAt: new Date().toISOString(),
      retryCount: 0
    });

    setCustomEffortHours('');
    setCustomEffortComment('');
    showEphemeralNotice(`Logged ${hours}h locally`);

    if (navigator.onLine) {
      handleSync();
    }
  };

  // --- Save Connection Settings ---
  const handleSaveSettings = async () => {
    await OpenProjectService.saveCredentials(opUrl, opApiKey);
    setSettingsNotice('Credentials saved. Initiating sync...');
    setTimeout(() => setSettingsNotice(null), 3000);
    handleSync(true);
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

  // Assignees strictly associated with the currently filtered project in drawer
  const filterDrawerAssignees = useMemo(() => {
    if (filterProject) {
      return getAssigneesForProject(filterProject);
    }
    const map = new Map<string, string>();
    tickets.forEach(t => {
      if (t.assigneeId && t.assignee && t.assignee.toLowerCase() !== 'unassigned') {
        map.set(t.assigneeId, t.assignee);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [filterProject, getAssigneesForProject, tickets]);

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

  // --- Saved Views Activation & Application ---
  const applySavedView = (view: SavedView) => {
    setActiveViewId(view.id);
    const f = view.filters;

    setFilterStatusCategory(f.statusCategory || 'all');
    setFilterStatus(f.statusId || '');
    setFilterProject(f.project || f.projectId || '');
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

  const handleSaveCurrentAsNewView = async () => {
    if (!newViewName.trim()) return;

    const newView: SavedView = {
      id: `view_${Date.now()}`,
      name: newViewName.trim(),
      isFavorite: newViewFavorite,
      isSystem: false,
      createdAt: new Date().toISOString(),
      filters: {
        statusCategory: filterStatusCategory,
        statusId: filterStatus || undefined,
        project: filterProject || undefined,
        projectId: resolveProjectId(filterProject),
        type: filterType || undefined,
        assignee: filterAssignee || undefined,
        priority: filterPriority || undefined,
        starredOnly: filterStarredOnly,
        sortBy: sortBy
      }
    };

    await db.putSavedView(newView);
    setSavedViews(prev => [...prev, newView]);
    setActiveViewId(newView.id);
    setIsSaveViewModalOpen(false);
    setNewViewName('');
    showEphemeralNotice(`Saved view "${newView.name}"`);
  };

  const handleDeleteView = async (viewId: string) => {
    await db.deleteSavedView(viewId);
    setSavedViews(prev => prev.filter(v => v.id !== viewId));
    if (activeViewId === viewId) {
      applySavedView(savedViews[0] || DEFAULT_SAVED_VIEWS[0]);
    }
    showEphemeralNotice('View deleted');
  };

  // --- Filtered & Sorted Tickets ---
  const filteredTickets = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    const result = tickets.filter(t => {
      // 1. Text Search Query (checks ID, Subject, Project, Assignee, AND Description/Body)
      if (q) {
        const matchQuery = String(t.id).includes(q) || 
          t.subject.toLowerCase().includes(q) || 
          t.project.toLowerCase().includes(q) ||
          t.assignee.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q));
        if (!matchQuery) return false;
      }

      // 2. Starred Only
      if (filterStarredOnly && !t.starred) return false;

      // 3. Status Category (Open vs Closed in OP)
      if (filterStatusCategory === 'open') {
        const isClosed = closedStatusIds.has(t.statusId) || ['closed', 'tested', 'rejected'].includes(t.status.toLowerCase());
        if (isClosed) return false;
      } else if (filterStatusCategory === 'closed') {
        const isClosed = closedStatusIds.has(t.statusId) || ['closed', 'tested', 'rejected'].includes(t.status.toLowerCase());
        if (!isClosed) return false;
      }

      // 4. Specific Status
      if (filterStatus && t.statusId !== filterStatus && t.status !== filterStatus) {
        return false;
      }

      // 5. Project
      if (filterProject) {
        const projId = resolveProjectId(filterProject);
        const match = (projId && t.projectId === projId) || 
                      t.project.toLowerCase() === filterProject.toLowerCase() ||
                      (t.projectId && t.projectId === filterProject);
        if (!match) return false;
      }

      // 6. Type
      if (filterType && t.type !== filterType && t.typeId !== filterType) {
        return false;
      }

      // 7. Assignee
      if (filterAssignee) {
        if (filterAssignee === 'me') {
          const isMe = (currentUser.id && t.assigneeId === currentUser.id) || 
                       t.assignee.toLowerCase().includes('nibas') || 
                       t.assignee.toLowerCase().includes('me');
          if (!isMe) return false;
        } else if (filterAssignee === 'unassigned') {
          if (t.assignee && t.assignee.toLowerCase() !== 'unassigned') return false;
        } else {
          if (t.assigneeId !== filterAssignee && t.assignee !== filterAssignee) {
            return false;
          }
        }
      }

      // 8. Priority
      if (filterPriority && t.priority.toLowerCase() !== filterPriority.toLowerCase() && t.priorityId !== filterPriority) {
        return false;
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
    filterStatus, 
    filterProject, 
    resolveProjectId, 
    filterType, 
    filterAssignee, 
    currentUser, 
    filterPriority, 
    sortBy
  ]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterProject) count++;
    if (filterStatusCategory !== 'all') count++;
    if (filterStatus) count++;
    if (filterType) count++;
    if (filterAssignee) count++;
    if (filterPriority) count++;
    if (filterStarredOnly) count++;
    return count;
  }, [filterProject, filterStatusCategory, filterStatus, filterType, filterAssignee, filterPriority, filterStarredOnly]);

  const activeViewObj = useMemo(() => {
    return savedViews.find(v => v.id === activeViewId) || null;
  }, [savedViews, activeViewId]);

  const favoriteViews = useMemo(() => {
    return savedViews.filter(v => v.isFavorite);
  }, [savedViews]);

  // --- Efforts Calculations & Global Effort Search ---
  const weekDays = useMemo(() => getWeekDays(), []);
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

  const effortsForSelectedDate = useMemo(() => {
    return allEfforts.filter(e => e.spentOn === selectedEffortDate);
  }, [allEfforts, selectedEffortDate]);

  // Global search across all efforts (subject, comment, #ID, date)
  const searchedEfforts = useMemo(() => {
    const q = effortSearchQuery.toLowerCase().trim();
    if (!q) return null;
    return allEfforts.filter(e => 
      String(e.workPackageId).includes(q) ||
      (e.ticketSubject && e.ticketSubject.toLowerCase().includes(q)) ||
      (e.comment && e.comment.toLowerCase().includes(q)) ||
      (e.spentOn && e.spentOn.includes(q))
    );
  }, [allEfforts, effortSearchQuery]);

  const pendingCount = useMemo(() => {
    return tickets.filter(t => t.pendingSync).length;
  }, [tickets]);

  return (
    <div className="min-h-screen bg-[#090d16] text-[#f1f5f9] flex justify-center selection:bg-blue-600/30 font-sans">
      
      {/* Mobile Frame Container */}
      <div className="w-full max-w-md bg-[#0f172a] sm:border sm:border-[#1e293b] sm:rounded-3xl sm:my-4 sm:shadow-2xl flex flex-col h-screen sm:h-[860px] overflow-hidden relative">

        {/* Top Header */}
        <header className="p-3.5 border-b border-[#1e293b] bg-[#0f172a]/95 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold tracking-wider px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
              OP MOBILE
            </span>

            {/* Sync Button & Status Badge */}
            <button 
              onClick={() => handleSync(true)} 
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-[#1e293b] bg-[#090d16] hover:border-blue-500/50 text-[11px] font-mono transition"
              title="Click to Sync Now"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-blue-400' : isOnline ? 'text-emerald-400' : 'text-amber-400'}`} />
              <span className="text-slate-300 uppercase tracking-tight">
                {isSyncing ? 'SYNCING' : lastSyncText}
              </span>
            </button>

            {pendingCount > 0 && (
              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                {pendingCount} PENDING
              </span>
            )}
          </div>

          {/* Effort Summary Gauge & Settings Icon */}
          <div className="flex items-center gap-2.5">
            <div className="text-right">
              <div className="text-xs font-mono font-semibold text-emerald-400 leading-none">
                {todayTotalHours.toFixed(1)}h <span className="text-[#64748b] font-normal text-[11px]">/ 8h</span>
              </div>
              <div className="w-14 h-1 bg-[#1e293b] rounded-full mt-1 overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full transition-all" 
                  style={{ width: `${Math.min(100, (todayTotalHours / 8) * 100)}%` }}
                />
              </div>
            </div>

            <button 
              onClick={() => setActiveTab('settings')}
              className="p-1.5 text-[#64748b] hover:text-[#f1f5f9] border border-[#1e293b] rounded-lg transition"
              title="Open Settings"
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
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1 flex items-center">
                <Search className="w-4 h-4 absolute left-3 text-[#64748b]" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRemoteSearch(); }}
                  placeholder="Search #ID, subject, assignee, or details..."
                  className="w-full bg-[#0f172a] text-xs text-[#f1f5f9] rounded-xl pl-9 pr-14 py-2 border border-[#1e293b] focus:outline-none focus:border-blue-500 placeholder:text-[#64748b] transition"
                />
                
                <div className="absolute right-2 flex items-center gap-1">
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="text-[#64748b] hover:text-white p-1">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button 
                    onClick={checkClipboard}
                    title="Paste / Detect link from Clipboard"
                    className="text-[#64748b] hover:text-blue-400 p-1"
                  >
                    <Clipboard className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Remote Search Button */}
              {searchQuery && (
                <button
                  onClick={handleRemoteSearch}
                  disabled={isSearchingRemote}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-2.5 py-2 rounded-xl font-medium shrink-0 flex items-center gap-1 transition"
                  title="Search OpenProject Server directly and store result locally"
                >
                  <Globe className={`w-3.5 h-3.5 ${isSearchingRemote ? 'animate-spin' : ''}`} />
                  <span>OP</span>
                </button>
              )}

              {/* Slide Filter Drawer Trigger */}
              <button 
                onClick={() => setIsFilterDrawerOpen(true)}
                className={`p-2 rounded-xl border transition shrink-0 relative ${
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

            {/* Saved Views (OpenProject Views & Favorites Bar) */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              
              {/* Favorite Views Chips */}
              {favoriteViews.map(view => {
                const isActive = activeViewId === view.id;
                return (
                  <button
                    key={view.id}
                    onClick={() => applySavedView(view)}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 flex items-center gap-1.5 transition ${
                      isActive 
                        ? 'bg-blue-600 text-white shadow-sm' 
                        : 'bg-[#0f172a] text-[#94a3b8] border border-[#1e293b] hover:border-slate-700'
                    }`}
                  >
                    <Star className="w-3 h-3 text-amber-400 fill-current" />
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
                  <div className="absolute top-8 left-0 z-50 w-60 bg-[#0f172a] border border-[#1e293b] rounded-2xl shadow-2xl p-2 space-y-1.5 animate-in fade-in zoom-in-95">
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
                      <span>Favorite</span>
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
                          <span className="truncate pr-2">{v.name}</span>
                          <div className="flex items-center gap-1 shrink-0">
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
                  <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[#1e293b] text-slate-300 truncate">
                    {activeViewObj.name}
                  </span>
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
                <p className="text-xs text-[#64748b]">No tickets match your search or filters.</p>
                <div className="flex justify-center gap-2">
                  <button 
                    onClick={() => {
                      setFilterProject('');
                      setFilterStatusCategory('all');
                      setFilterStatus('');
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
                      className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-xl font-medium transition"
                    >
                      Search OP Server
                    </button>
                  )}
                </div>
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

        {/* Tab 2: Daily & Weekly Efforts Dashboard with Effort Search */}
        {activeTab === 'efforts' && (
          <main className="flex-1 overflow-y-auto p-4 space-y-4">
            
            {/* Search Input for Logged Efforts */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#64748b]" />
              <input 
                type="text"
                value={effortSearchQuery}
                onChange={e => setEffortSearchQuery(e.target.value)}
                placeholder="Search logged efforts (#ID, subject, comment, date)..."
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
                        className="p-3 bg-[#090d16] border border-[#1e293b] rounded-xl flex items-center justify-between text-xs"
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
                        <div className="text-right shrink-0">
                          <span className="font-mono font-bold text-emerald-400 text-sm">+{e.hours.toFixed(1)}h</span>
                          {e.pendingSync && (
                            <span className="block font-mono text-[9px] text-amber-400 uppercase">UNSYNCED</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Normal Efforts View: Summary + 7-Day Strip + Selected Date Logs */
              <>
                {/* Weekly Header Summary Card */}
                <div className="bg-[#090d16] border border-[#1e293b] rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-mono uppercase text-[#64748b] block mb-1">Weekly Effort Total</span>
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

                {/* 7-Day Interactive Strip */}
                <div>
                  <span className="text-xs font-mono uppercase text-[#64748b] block mb-2">Past 7 Days</span>
                  <div className="grid grid-cols-7 gap-1.5">
                    {weekDays.map(d => {
                      const hours = hoursPerDateMap[d.dateStr] || 0;
                      const isSelected = d.dateStr === selectedEffortDate;
                      return (
                        <button
                          key={d.dateStr}
                          onClick={() => setSelectedEffortDate(d.dateStr)}
                          className={`p-2 rounded-xl text-center border transition flex flex-col justify-between items-center ${
                            isSelected 
                              ? 'bg-blue-600/20 border-blue-500 text-white' 
                              : 'bg-[#090d16] border-[#1e293b] text-[#64748b] hover:text-white'
                          }`}
                        >
                          <span className="text-[10px] uppercase font-mono block">{d.dayName}</span>
                          <span className="text-xs font-bold my-1 block">{d.label.split(' ')[0]}</span>
                          <span className={`text-[10px] font-mono font-semibold ${hours > 0 ? 'text-emerald-400' : 'text-[#64748b]'}`}>
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
                    <span className="text-xs font-mono uppercase text-[#64748b]">
                      Logs for {selectedEffortDate === todayStr ? 'Today' : selectedEffortDate}
                    </span>
                    <span className="text-xs font-mono text-emerald-400 font-bold">
                      {(hoursPerDateMap[selectedEffortDate] || 0).toFixed(1)}h Total
                    </span>
                  </div>

                  {effortsForSelectedDate.length === 0 ? (
                    <div className="p-6 bg-[#090d16] border border-[#1e293b] rounded-2xl text-center">
                      <p className="text-xs text-[#64748b]">No effort logged for this date.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {effortsForSelectedDate.map(e => (
                        <div 
                          key={e.id}
                          className="p-3 bg-[#090d16] border border-[#1e293b] rounded-xl flex items-center justify-between text-xs"
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
                          <div className="text-right shrink-0">
                            <span className="font-mono font-bold text-emerald-400 text-sm">+{e.hours.toFixed(1)}h</span>
                            {e.pendingSync && (
                              <span className="block font-mono text-[9px] text-amber-400 uppercase">UNSYNCED</span>
                            )}
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

        {/* Tab 3: Quick Settings */}
        {activeTab === 'settings' && (
          <main className="flex-1 overflow-y-auto p-4 space-y-4">
            <h3 className="text-xs font-mono font-bold uppercase text-[#f1f5f9] border-b border-[#1e293b] pb-2">
              Connection Settings
            </h3>
            {settingsNotice && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl font-mono">
                {settingsNotice}
              </div>
            )}
            <div>
              <label className="block text-xs font-mono uppercase text-[#64748b] mb-1.5">OpenProject Host URL</label>
              <input 
                type="text" 
                value={opUrl}
                onChange={e => setOpUrl(e.target.value)}
                className="w-full bg-[#090d16] border border-[#1e293b] rounded-xl p-3 text-xs text-[#f1f5f9] focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase text-[#64748b] mb-1.5">API Key</label>
              <input 
                type="password" 
                value={opApiKey}
                onChange={e => setOpApiKey(e.target.value)}
                placeholder="Enter OpenProject API key..."
                className="w-full bg-[#090d16] border border-[#1e293b] rounded-xl p-3 text-xs text-[#f1f5f9] focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
            <button 
              onClick={handleSaveSettings}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-xl text-xs transition"
            >
              Save Credentials & Sync
            </button>
          </main>
        )}

        {/* OpenProject-Style Multi-Attribute Filter Slide Panel */}
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

              {/* Drawer Body (OpenProject Filters) */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                
                {/* 1. Project Filter with Searchable Modal Trigger */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-mono uppercase text-[#64748b]">Project</label>
                    <span className="text-[10px] font-mono text-[#64748b]">{uniqueProjects.length} projects</span>
                  </div>
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
                      <span className="truncate">{filterProject || 'All Projects'}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[#64748b] group-hover:text-blue-400 shrink-0">
                      <span className="text-[10px] font-mono uppercase">Search</span>
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

                {/* 3. Specific Real OpenProject Status */}
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#64748b] mb-1.5">Specific Status</label>
                  <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    className="w-full bg-[#090d16] text-xs text-[#f1f5f9] border border-[#1e293b] rounded-xl p-2.5 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Any Specific Status</option>
                    {displayStatuses.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {/* 4. Assignee Filter with Searchable Modal Trigger */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-mono uppercase text-[#64748b]">
                      Assignee
                    </label>
                    <span className="text-[10px] font-mono text-slate-400">
                      {filterProject ? `${filterDrawerAssignees.length} project member(s)` : 'All members'}
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

                {/* Save Current Filters as View Trigger */}
                <button
                  type="button"
                  onClick={() => {
                    setIsFilterDrawerOpen(false);
                    setIsSaveViewModalOpen(true);
                  }}
                  className="w-full py-2.5 px-3 bg-[#1e293b] hover:bg-[#334155] border border-dashed border-[#475569] text-xs text-blue-400 rounded-xl font-medium flex items-center justify-center gap-1.5 transition"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>Save Current Filters as View</span>
                </button>

              </div>

              {/* Drawer Footer Actions */}
              <div className="p-3 border-t border-[#1e293b] flex gap-2">
                <button
                  onClick={() => {
                    setFilterProject('');
                    setFilterStatusCategory('open');
                    setFilterStatus('');
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

        {/* Searchable Project Picker Modal (Filter Drawer) */}
        {isProjectPickerOpen && (
          <div 
            className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end sm:justify-center sm:p-4 animate-in fade-in duration-150"
            onClick={() => setIsProjectPickerOpen(false)}
          >
            <div 
              className="bg-[#0f172a] border border-[#1e293b] rounded-t-3xl sm:rounded-2xl max-h-[85vh] sm:max-h-[600px] flex flex-col shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-3.5 border-b border-[#1e293b] flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-xs font-mono font-bold uppercase text-[#f1f5f9]">Select Project</h3>
                  <span className="text-[11px] text-[#64748b]">{uniqueProjects.length} available project(s)</span>
                </div>
                <button onClick={() => setIsProjectPickerOpen(false)} className="p-1 text-[#64748b] hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 border-b border-[#1e293b] shrink-0 bg-[#090d16]/60">
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
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-[#1e293b]/50 p-1">
                {/* All Projects Option */}
                {(!projectPickerSearch || 'all projects'.includes(projectPickerSearch.toLowerCase())) && (
                  <button
                    onClick={() => {
                      setFilterProject('');
                      setIsProjectPickerOpen(false);
                    }}
                    className={`w-full p-2.5 rounded-xl flex items-center justify-between text-left text-xs transition ${
                      !filterProject ? 'bg-blue-600/20 text-blue-300 font-semibold' : 'text-slate-300 hover:bg-[#1e293b]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <FolderKanban className="w-4 h-4 text-blue-400" />
                      <span>All Projects</span>
                    </div>
                    {!filterProject && <Check className="w-4 h-4 text-blue-400" />}
                  </button>
                )}

                {/* Filtered Project List */}
                {filteredProjectPickerList.map(p => {
                  const isSelected = filterProject === p.name;
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setFilterProject(p.name);
                        if (filterAssignee && filterAssignee !== 'me' && filterAssignee !== 'unassigned') {
                          const newAssignees = getAssigneesForProject(p.name);
                          if (!newAssignees.some(u => u.id === filterAssignee)) {
                            setFilterAssignee('');
                          }
                        }
                        setIsProjectPickerOpen(false);
                      }}
                      className={`w-full p-2.5 rounded-xl flex items-center justify-between text-left text-xs transition ${
                        isSelected ? 'bg-blue-600/20 text-blue-300 font-semibold' : 'text-slate-300 hover:bg-[#1e293b]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <FolderKanban className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="truncate">{p.name}</span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-blue-400 shrink-0" />}
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
            className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end sm:justify-center sm:p-4 animate-in fade-in duration-150"
            onClick={() => setIsDrawerAssigneePickerOpen(false)}
          >
            <div 
              className="bg-[#0f172a] border border-[#1e293b] rounded-t-3xl sm:rounded-2xl max-h-[85vh] sm:max-h-[600px] flex flex-col shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-3.5 border-b border-[#1e293b] flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-xs font-mono font-bold uppercase text-[#f1f5f9]">Filter by Assignee</h3>
                  <span className="text-[11px] text-[#64748b]">
                    {filterProject ? `Members in ${filterProject}` : `All members`} ({filterDrawerAssignees.length})
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

        {/* Save View Modal (OpenProject View Feature) */}
        {isSaveViewModalOpen && (
          <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl w-full max-w-sm p-4 space-y-3.5 shadow-2xl">
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
                  onChange={e => setNewViewName(e.target.value)}
                  placeholder="e.g. My Sprint Bugs, James Team Tasks..."
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
                      components={{
                        img: ({ node, ...props }) => {
                          let src = props.src || '';
                          if (src.startsWith('/')) {
                            src = `${opUrl.replace(/\/+$/, '')}${src}`;
                          }
                          return (
                            <span className="block my-2 text-center">
                              <img
                                {...props}
                                src={src}
                                alt={props.alt || 'Attachment'}
                                onClick={() => setZoomedImageUrl(src)}
                                className="max-w-full h-auto rounded-xl border border-[#1e293b] cursor-zoom-in hover:opacity-90 transition active:scale-98 mx-auto"
                                loading="lazy"
                              />
                              <span className="text-[10px] text-[#64748b] font-mono mt-1 block">Tap image to zoom</span>
                            </span>
                          );
                        }
                      }}
                    >
                      {selectedTicket.description}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-xs text-[#64748b] italic">No description provided for this ticket.</p>
                )}
              </div>

              {/* Log Effort Section */}
              <div className="bg-[#090d16] border border-[#1e293b] rounded-2xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase text-[#64748b] tracking-wider">
                    Log Time Effort
                  </span>
                  <div className="text-right">
                    <span className="text-xs font-mono text-emerald-400 font-bold">
                      {selectedTicket.spentTime ? `${parseDurationToHours(selectedTicket.spentTime)}h` : '0h'} Spent
                    </span>
                  </div>
                </div>

                {/* Preset quick buttons */}
                <div className="grid grid-cols-4 gap-2">
                  {[0.5, 1.0, 2.0, 4.0].map(hrs => (
                    <button
                      key={hrs}
                      onClick={() => handleLogEffort(hrs, 'Work on ticket')}
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
                      onChange={e => setCustomEffortHours(e.target.value)}
                      placeholder="Hours (e.g. 1.5)"
                      className="w-28 bg-[#0f172a] border border-[#1e293b] rounded-xl px-3 py-2 text-xs font-mono text-[#f1f5f9] focus:outline-none focus:border-blue-500"
                    />
                    <input
                      type="text"
                      value={customEffortComment}
                      onChange={e => setCustomEffortComment(e.target.value)}
                      placeholder="Work comment..."
                      className="flex-1 bg-[#0f172a] border border-[#1e293b] rounded-xl px-3 py-2 text-xs text-[#f1f5f9] focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <button
                    onClick={() => {
                      const h = parseFloat(customEffortHours);
                      if (h > 0) handleLogEffort(h, customEffortComment);
                    }}
                    disabled={!customEffortHours || parseFloat(customEffortHours) <= 0}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium py-2 rounded-xl text-xs transition font-mono"
                  >
                    Log Custom Effort
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Searchable Assignee Picker Modal (for Ticket Reassignment) */}
        {isAssigneePickerOpen && selectedTicket && (
          <div 
            className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end sm:justify-center sm:p-4 animate-in fade-in duration-150"
            onClick={() => setIsAssigneePickerOpen(false)}
          >
            <div 
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

        {/* Bottom Tab Bar */}
        <nav className="border-t border-[#1e293b] bg-[#0f172a] grid grid-cols-3 shrink-0">
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

          <button
            onClick={() => setActiveTab('settings')}
            className={`py-3 flex flex-col items-center gap-1 transition ${
              activeTab === 'settings' ? 'text-blue-400 font-medium' : 'text-[#64748b] hover:text-[#f1f5f9]'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span className="text-[10px] uppercase font-mono tracking-wider">Settings</span>
          </button>
        </nav>

      </div>
    </div>
  );
}
