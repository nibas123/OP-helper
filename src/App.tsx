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
  Calendar,
  User,
  SlidersHorizontal,
  Globe,
  ZoomIn
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { db, type LocalTicket, type LocalEffort, type LookupItem } from './services/db';
import { syncService, parseDurationToHours } from './services/syncService';
import { OpenProjectService } from './services/OpenProjectService';
import { extractTicketIdFromUrlOrText } from './utils/urlParser';
import { DEFAULT_STATUSES, DEFAULT_TYPES } from './constants/opDefaults';

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
  const [users, setUsers] = useState<LookupItem[]>([]);

  // Selected Ticket & Active View
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'tickets' | 'efforts' | 'settings'>('tickets');

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchingRemote, setIsSearchingRemote] = useState(false);
  const [activeQuickFilter, setActiveQuickFilter] = useState<'all' | 'starred' | 'mine' | 'in_progress' | 'pending_sync'>('all');

  // Multi-Attribute Filter Slide Panel (from old dashboard)
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [filterProject, setFilterProject] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterAssignee, setFilterAssignee] = useState<string>('');

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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
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

      const dbUsers = await db.getUsers();
      setUsers(dbUsers);

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

  // --- Open Ticket By ID (Local lookup + Remote fallback, saved to local DB) ---
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
    setIsSettingsOpen(false);
    setSettingsNotice('Credentials saved. Initiating sync...');
    setTimeout(() => setSettingsNotice(null), 3000);
    handleSync(true);
  };

  // --- Filter Metadata Lists ---
  const uniqueProjects = useMemo(() => {
    const list = new Set<string>();
    tickets.forEach(t => { if (t.project) list.add(t.project); });
    return Array.from(list).sort();
  }, [tickets]);

  // Fallback status list if DB statuses not yet populated
  const displayStatuses = useMemo(() => {
    if (statuses.length > 0) return statuses;
    // Extract unique from current tickets
    const map = new Map<string, string>();
    tickets.forEach(t => {
      if (t.statusId && t.status) map.set(t.statusId, t.status);
    });
    if (map.size > 0) {
      return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    }
    return DEFAULT_STATUSES;
  }, [statuses, tickets]);

  const displayTypes = useMemo(() => {
    if (types.length > 0) return types;
    const list = new Set<string>();
    tickets.forEach(t => { if (t.type) list.add(t.type); });
    if (list.size > 0) {
      return Array.from(list).map(name => ({ id: name, name }));
    }
    return DEFAULT_TYPES;
  }, [types, tickets]);

  const displayUsers = useMemo(() => {
    if (users.length > 0) return users;
    const map = new Map<string, string>();
    tickets.forEach(t => {
      if (t.assigneeId && t.assignee) map.set(t.assigneeId, t.assignee);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [users, tickets]);

  const starredTickets = useMemo(() => tickets.filter(t => t.starred), [tickets]);

  // --- Filtered Tickets (Search + Multi-Attribute Slide Filters) ---
  const filteredTickets = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return tickets.filter(t => {
      // 1. Text Search Query
      const matchQuery = !q || String(t.id).includes(q) || t.subject.toLowerCase().includes(q) || t.project.toLowerCase().includes(q);
      if (!matchQuery) return false;

      // 2. Quick Pill Filters
      if (activeQuickFilter === 'starred' && !t.starred) return false;
      if (activeQuickFilter === 'mine' && !t.assignee.toLowerCase().includes('me') && !t.assignee.toLowerCase().includes('nibas')) return false;
      if (activeQuickFilter === 'in_progress' && t.status.toLowerCase() !== 'in progress' && t.status.toLowerCase() !== 'in development') return false;
      if (activeQuickFilter === 'pending_sync' && !t.pendingSync) return false;

      // 3. Multi-Attribute Slide Panel Filters (Project, Status, Type, Assignee)
      if (filterProject && t.project !== filterProject) return false;
      if (filterStatus && t.statusId !== filterStatus && t.status !== filterStatus) return false;
      if (filterType && t.type !== filterType && t.typeId !== filterType) return false;
      if (filterAssignee && t.assigneeId !== filterAssignee && t.assignee !== filterAssignee) return false;

      return true;
    });
  }, [tickets, searchQuery, activeQuickFilter, filterProject, filterStatus, filterType, filterAssignee]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterProject) count++;
    if (filterStatus) count++;
    if (filterType) count++;
    if (filterAssignee) count++;
    return count;
  }, [filterProject, filterStatus, filterType, filterAssignee]);

  // --- Efforts Calculations ---
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

  const selectedTicket = useMemo(() => {
    return tickets.find(t => t.id === selectedTicketId) || null;
  }, [tickets, selectedTicketId]);

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
              onClick={() => setIsSettingsOpen(true)}
              className="p-1.5 text-[#64748b] hover:text-[#f1f5f9] border border-[#1e293b] rounded-lg transition"
              title="Open Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Ephemeral Toast Notice */}
        {syncNotice && (
          <div className="bg-blue-600 text-white text-xs px-3 py-1.5 font-medium flex items-center justify-between shrink-0 animate-in slide-in-from-top-1">
            <span>{syncNotice}</span>
            <button onClick={() => setSyncNotice(null)} className="p-0.5 hover:opacity-80">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Clipboard Detected Banner */}
        {clipboardTicketId && (
          <div className="bg-[#1e293b] border-b border-[#334155] p-2.5 flex items-center justify-between shrink-0 text-xs">
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

        {/* Search, Filter Drawer Trigger, & Filter Chips */}
        {activeTab === 'tickets' && (
          <div className="p-3 border-b border-[#1e293b] bg-[#090d16]/60 shrink-0 space-y-2">
            
            {/* Search Bar with Remote Search Trigger */}
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1 flex items-center">
                <Search className="w-4 h-4 absolute left-3 text-[#64748b]" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRemoteSearch(); }}
                  placeholder="Search #ID or subject..."
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

              {/* Remote Search Button (fetches from OP server and caches locally) */}
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

              {/* Slide Panel Filter Drawer Trigger */}
              <button 
                onClick={() => setIsFilterDrawerOpen(true)}
                className={`p-2 rounded-xl border transition shrink-0 relative ${
                  activeFilterCount > 0 
                    ? 'bg-blue-600/20 text-blue-400 border-blue-500/50' 
                    : 'bg-[#0f172a] text-[#64748b] border-[#1e293b] hover:text-white'
                }`}
                title="Open Advanced Filters Drawer"
              >
                <SlidersHorizontal className="w-4 h-4" />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-500 text-white font-mono text-[10px] flex items-center justify-center font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>

            {/* Horizontal Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <button 
                onClick={() => setActiveQuickFilter('starred')} 
                className={`text-xs px-3 py-1 rounded-full font-medium shrink-0 flex items-center gap-1 transition ${
                  activeQuickFilter === 'starred' ? 'bg-amber-500 text-black font-semibold' : 'bg-[#0f172a] text-[#64748b] border border-[#1e293b]'
                }`}
              >
                <Star className="w-3 h-3 fill-current" />
                Starred ({starredTickets.length})
              </button>

              <button 
                onClick={() => setActiveQuickFilter('all')} 
                className={`text-xs px-3 py-1 rounded-full font-medium shrink-0 transition ${
                  activeQuickFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-[#0f172a] text-[#64748b] border border-[#1e293b]'
                }`}
              >
                All ({tickets.length})
              </button>

              <button 
                onClick={() => setActiveQuickFilter('mine')} 
                className={`text-xs px-3 py-1 rounded-full font-medium shrink-0 transition ${
                  activeQuickFilter === 'mine' ? 'bg-blue-600 text-white' : 'bg-[#0f172a] text-[#64748b] border border-[#1e293b]'
                }`}
              >
                Mine
              </button>

              <button 
                onClick={() => setActiveQuickFilter('in_progress')} 
                className={`text-xs px-3 py-1 rounded-full font-medium shrink-0 transition ${
                  activeQuickFilter === 'in_progress' ? 'bg-blue-600 text-white' : 'bg-[#0f172a] text-[#64748b] border border-[#1e293b]'
                }`}
              >
                In Progress
              </button>

              <button 
                onClick={() => setActiveQuickFilter('pending_sync')} 
                className={`text-xs px-3 py-1 rounded-full font-medium shrink-0 transition ${
                  activeQuickFilter === 'pending_sync' ? 'bg-amber-600 text-white' : 'bg-[#0f172a] text-[#64748b] border border-[#1e293b]'
                }`}
              >
                Pending Sync {pendingCount > 0 && `(${pendingCount})`}
              </button>
            </div>
          </div>
        )}

        {/* Main Body: Active Tab View */}
        {activeTab === 'tickets' && (
          <main className="flex-1 overflow-y-auto divide-y divide-[#1e293b]">
            
            {/* Daily Starred Tasks Quick Shelf */}
            {activeQuickFilter !== 'starred' && starredTickets.length > 0 && !searchQuery && (
              <div className="bg-[#090d16] p-3 border-b border-[#1e293b]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-mono uppercase text-amber-400 font-semibold tracking-wider flex items-center gap-1">
                    <Star className="w-3 h-3 fill-current" />
                    Daily Starred Tasks
                  </span>
                  <button 
                    onClick={() => setActiveQuickFilter('starred')}
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
                          {parseDurationToHours(st.spentTime).toFixed(1)}h
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {filteredTickets.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#64748b] font-mono space-y-3">
                <div>No tickets match your filters in local database.</div>
                {searchQuery && (
                  <button 
                    onClick={handleRemoteSearch}
                    disabled={isSearchingRemote}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-sans text-xs px-3 py-2 rounded-xl font-medium inline-flex items-center gap-1.5 transition"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Search "{searchQuery}" on OpenProject Server</span>
                  </button>
                )}
                {activeFilterCount > 0 && (
                  <div>
                    <button 
                      onClick={() => {
                        setFilterProject('');
                        setFilterStatus('');
                        setFilterType('');
                        setFilterAssignee('');
                      }} 
                      className="text-blue-400 underline"
                    >
                      Reset advanced filters
                    </button>
                  </div>
                )}
              </div>
            ) : (
              filteredTickets.map(t => {
                const spentHours = parseDurationToHours(t.spentTime);
                return (
                  <div 
                    key={t.id}
                    onClick={() => setSelectedTicketId(t.id)}
                    className="p-3.5 active:bg-[#090d16] hover:bg-[#090d16]/60 cursor-pointer transition select-none"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={(e) => handleToggleStar(e, t.id)}
                          className={`p-1 -ml-1 rounded transition ${t.starred ? 'text-amber-400' : 'text-[#475569] hover:text-slate-300'}`}
                          title={t.starred ? 'Starred (Daily task)' : 'Star for daily access'}
                        >
                          <Star className={`w-3.5 h-3.5 ${t.starred ? 'fill-current' : ''}`} />
                        </button>

                        <span className="font-mono text-xs font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                          #{t.id}
                        </span>
                        <span className="text-xs text-[#64748b] font-mono truncate max-w-[140px]">
                          {t.project}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1.5">
                        {t.pendingSync && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            UNSYNCED
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono uppercase border border-[#1e293b] text-slate-300 bg-[#090d16]">
                          {t.status}
                        </span>
                      </div>
                    </div>

                    <h3 className="text-xs font-semibold text-[#f1f5f9] leading-snug line-clamp-2 mb-2">
                      {t.subject}
                    </h3>

                    <div className="flex items-center justify-between text-xs text-[#64748b]">
                      <span className="truncate max-w-[140px]">{t.assignee}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-slate-400">{t.type || t.priority}</span>
                        <span className="font-mono text-emerald-400 font-medium">{spentHours.toFixed(1)}h</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </main>
        )}

        {/* Tab 2: Daily & Weekly Efforts View */}
        {activeTab === 'efforts' && (
          <main className="flex-1 overflow-y-auto p-4 space-y-4">
            
            {/* Weekly Overview Card */}
            <div className="bg-[#090d16] border border-[#1e293b] rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono uppercase text-[#64748b] block">Weekly Total (Past 7 Days)</span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-lg font-mono font-bold text-emerald-400">{weeklyTotalHours.toFixed(1)}h</span>
                    <span className="text-xs font-mono text-[#64748b]">/ 40.0h quota</span>
                  </div>
                </div>
                <Calendar className="w-5 h-5 text-blue-400" />
              </div>

              {/* Progress Bar */}
              <div className="w-full h-1.5 bg-[#1e293b] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full transition-all" 
                  style={{ width: `${Math.min(100, (weeklyTotalHours / 40) * 100)}%` }}
                />
              </div>

              {/* 7-Day Interactive Day Strip */}
              <div className="pt-2 border-t border-[#1e293b]">
                <span className="text-[11px] font-mono uppercase text-[#64748b] block mb-2">Select Day</span>
                <div className="grid grid-cols-7 gap-1">
                  {weekDays.map(d => {
                    const dayHours = hoursPerDateMap[d.dateStr] || 0;
                    const isSelected = selectedEffortDate === d.dateStr;
                    return (
                      <button
                        key={d.dateStr}
                        onClick={() => setSelectedEffortDate(d.dateStr)}
                        className={`py-2 px-1 rounded-xl text-center transition flex flex-col items-center justify-between ${
                          isSelected 
                            ? 'bg-blue-600 text-white font-bold shadow-sm' 
                            : 'bg-[#0f172a] border border-[#1e293b] text-[#64748b] hover:border-slate-500'
                        }`}
                      >
                        <span className="text-[10px] font-mono block">{d.dayName}</span>
                        <span className="text-xs font-mono font-semibold my-0.5">{d.label.split(' ')[0]}</span>
                        <span className={`text-[10px] font-mono block ${isSelected ? 'text-blue-100 font-bold' : dayHours > 0 ? 'text-emerald-400' : 'text-[#475569]'}`}>
                          {dayHours > 0 ? `${dayHours}h` : '-'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Selected Day's Tasks & Efforts */}
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
                <div>
                  <span className="text-xs font-mono uppercase text-[#f1f5f9] font-semibold">
                    {selectedEffortDate === todayStr ? "Today's Tasks & Efforts" : `Efforts on ${selectedEffortDate}`}
                  </span>
                </div>
                <span className="font-mono text-xs font-semibold text-emerald-400">
                  {(hoursPerDateMap[selectedEffortDate] || 0).toFixed(1)}h logged
                </span>
              </div>

              {effortsForSelectedDate.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#64748b] font-mono bg-[#090d16] border border-[#1e293b] rounded-2xl">
                  No efforts logged on this day.
                </div>
              ) : (
                <div className="space-y-2">
                  {effortsForSelectedDate.map(e => (
                    <div 
                      key={e.id} 
                      onClick={() => openTicketById(e.workPackageId)}
                      className="p-3 bg-[#090d16] border border-[#1e293b] hover:border-blue-500/40 rounded-xl flex items-center justify-between text-xs cursor-pointer transition select-none"
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono text-blue-400 font-bold">#{e.workPackageId}</span>
                          {e.ticketSubject && (
                            <span className="text-slate-300 font-medium truncate max-w-[200px]">{e.ticketSubject}</span>
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
          </main>
        )}

        {/* Tab 3: Quick Settings */}
        {activeTab === 'settings' && (
          <main className="flex-1 overflow-y-auto p-4 space-y-4">
            <h3 className="text-xs font-mono font-bold uppercase text-[#f1f5f9] border-b border-[#1e293b] pb-2">
              Connection Settings
            </h3>
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

        {/* Multi-Attribute Filter Slide Panel (Project, Status, Type, Assignee) */}
        {isFilterDrawerOpen && (
          <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
            <div 
              className="w-4/5 max-w-xs bg-[#0f172a] h-full border-l border-[#1e293b] flex flex-col shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-4 border-b border-[#1e293b] flex items-center justify-between">
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

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                
                {/* 1. Project Filter */}
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#64748b] mb-1.5">Project</label>
                  <select
                    value={filterProject}
                    onChange={e => setFilterProject(e.target.value)}
                    className="w-full bg-[#090d16] text-xs text-[#f1f5f9] border border-[#1e293b] rounded-xl p-2.5 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">All Projects</option>
                    {uniqueProjects.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                {/* 2. Real OpenProject Status Filter */}
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#64748b] mb-1.5">Status</label>
                  <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    className="w-full bg-[#090d16] text-xs text-[#f1f5f9] border border-[#1e293b] rounded-xl p-2.5 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">All Statuses</option>
                    {displayStatuses.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {/* 3. Type Filter (Task, Bug, etc.) */}
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#64748b] mb-1.5">Type</label>
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

                {/* 4. Assignee Filter */}
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#64748b] mb-1.5">Assignee</label>
                  <select
                    value={filterAssignee}
                    onChange={e => setFilterAssignee(e.target.value)}
                    className="w-full bg-[#090d16] text-xs text-[#f1f5f9] border border-[#1e293b] rounded-xl p-2.5 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">All Assignees</option>
                    {displayUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>

              </div>

              {/* Drawer Footer Actions */}
              <div className="p-3 border-t border-[#1e293b] flex gap-2">
                <button
                  onClick={() => {
                    setFilterProject('');
                    setFilterStatus('');
                    setFilterType('');
                    setFilterAssignee('');
                  }}
                  className="flex-1 py-2 bg-[#1e293b] hover:bg-[#334155] text-xs text-[#f1f5f9] rounded-xl font-medium transition"
                >
                  Clear All
                </button>
                <button
                  onClick={() => setIsFilterDrawerOpen(false)}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-xs text-white rounded-xl font-medium transition"
                >
                  Apply
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

              {/* Assignee Selector (Change Assignee feature) */}
              <div className="bg-[#090d16] border border-[#1e293b] rounded-2xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase text-[#64748b] tracking-wider block">
                    Assignee
                  </span>
                  <User className="w-3.5 h-3.5 text-[#64748b]" />
                </div>
                <select
                  value={selectedTicket.assigneeId || ''}
                  onChange={(e) => {
                    const u = displayUsers.find(user => user.id === e.target.value);
                    if (u) handleUpdateAssignee(selectedTicket, u.id, u.name);
                  }}
                  className="w-full bg-[#0f172a] text-xs text-[#f1f5f9] border border-[#1e293b] rounded-xl p-2.5 focus:outline-none focus:border-blue-500 cursor-pointer font-medium"
                >
                  <option value="">Unassigned</option>
                  {displayUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              {/* Ticket Details (Description & Metadata) */}
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

              {/* Metadata Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 rounded-xl border border-[#1e293b] bg-[#090d16]">
                  <span className="text-[#64748b] block font-mono text-[11px] uppercase">Priority</span>
                  <span className="font-medium text-amber-400 mt-0.5 block">{selectedTicket.priority}</span>
                </div>
                <div className="p-3 rounded-xl border border-[#1e293b] bg-[#090d16]">
                  <span className="text-[#64748b] block font-mono text-[11px] uppercase">Total Spent</span>
                  <span className="font-mono text-emerald-400 font-semibold mt-0.5 block">
                    {parseDurationToHours(selectedTicket.spentTime).toFixed(1)}h
                  </span>
                </div>
              </div>

              {/* Daily Effort Logging */}
              <div className="bg-[#090d16] border border-[#1e293b] rounded-2xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase text-[#64748b] tracking-wider">Log Effort (Today)</span>
                  <span className="text-xs text-[#64748b] font-mono">Instant Local</span>
                </div>

                {/* Quick Increment Buttons for Thumb-Tapping */}
                <div className="grid grid-cols-4 gap-1.5">
                  <button onClick={() => handleLogEffort(0.5, 'Quick logged 0.5h')} className="py-2 border border-[#1e293b] rounded-xl text-xs hover:bg-[#1e293b] font-mono text-center active:scale-95 transition">+0.5h</button>
                  <button onClick={() => handleLogEffort(1.0, 'Quick logged 1.0h')} className="py-2 border border-[#1e293b] rounded-xl text-xs hover:bg-[#1e293b] font-mono text-center active:scale-95 transition">+1.0h</button>
                  <button onClick={() => handleLogEffort(2.0, 'Quick logged 2.0h')} className="py-2 border border-[#1e293b] rounded-xl text-xs hover:bg-[#1e293b] font-mono text-center active:scale-95 transition">+2.0h</button>
                  <button onClick={() => handleLogEffort(4.0, 'Quick logged 4.0h')} className="py-2 border border-[#1e293b] rounded-xl text-xs hover:bg-[#1e293b] font-mono text-center active:scale-95 transition">+4.0h</button>
                </div>

                {/* Custom Effort Input */}
                <div className="space-y-2 pt-1">
                  <div className="flex gap-2">
                    <input 
                      type="number" 
                      step="0.25" 
                      placeholder="Hours (e.g. 1.5)"
                      value={customEffortHours}
                      onChange={e => setCustomEffortHours(e.target.value)}
                      className="w-28 bg-[#0f172a] border border-[#1e293b] rounded-xl px-3 py-2 text-xs text-[#f1f5f9] focus:outline-none focus:border-blue-500 font-mono"
                    />
                    <input 
                      type="text" 
                      placeholder="Comment (optional)"
                      value={customEffortComment}
                      onChange={e => setCustomEffortComment(e.target.value)}
                      className="flex-1 bg-[#0f172a] border border-[#1e293b] rounded-xl px-3 py-2 text-xs text-[#f1f5f9] focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <button 
                    onClick={() => {
                      const h = parseFloat(customEffortHours);
                      if (h > 0) handleLogEffort(h, customEffortComment);
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-500 active:scale-98 text-white font-medium py-2.5 rounded-xl text-xs transition"
                  >
                    Log Effort
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Settings Drawer Modal */}
        {isSettingsOpen && (
          <div className="absolute inset-0 z-40 bg-[#0f172a] flex flex-col animate-in fade-in duration-150">
            <div className="p-3.5 border-b border-[#1e293b] flex items-center justify-between shrink-0">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#f1f5f9]">Settings</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="text-xs text-[#64748b] hover:text-white px-2 py-1">
                Close
              </button>
            </div>
            <div className="p-4 space-y-4 flex-1 overflow-y-auto">
              {settingsNotice && (
                <div className="bg-emerald-600 text-white text-xs p-2 rounded-lg font-medium">{settingsNotice}</div>
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

              <div className="p-3 rounded-xl border border-[#1e293b] bg-[#090d16] text-xs text-[#64748b] space-y-1">
                <span className="font-mono text-slate-300 block mb-1">LOCAL DATABASE STORAGE</span>
                <div>Cached Tickets: <strong className="text-slate-200">{tickets.length} items</strong></div>
                <div>Starred Daily Tasks: <strong className="text-amber-400">{starredTickets.length} items</strong></div>
                <div>Pending Outbox Queue: <strong className="text-amber-400">{pendingCount} changes</strong></div>
              </div>

              <button 
                onClick={handleSaveSettings}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-xl text-xs transition"
              >
                Save Credentials & Trigger Full Sync
              </button>
            </div>
          </div>
        )}

        {/* Bottom Navigation Bar */}
        <nav className="h-14 border-t border-[#1e293b] bg-[#0f172a] px-6 flex items-center justify-around shrink-0 z-10">
          <button 
            onClick={() => setActiveTab('tickets')}
            className={`flex flex-col items-center gap-1 transition ${activeTab === 'tickets' ? 'text-blue-400 font-medium' : 'text-[#64748b]'}`}
          >
            <FolderKanban className="w-5 h-5" />
            <span className="text-[11px] font-mono tracking-tight">Tickets</span>
          </button>

          <button 
            onClick={() => setActiveTab('efforts')}
            className={`flex flex-col items-center gap-1 transition ${activeTab === 'efforts' ? 'text-blue-400 font-medium' : 'text-[#64748b]'}`}
          >
            <Clock className="w-5 h-5" />
            <span className="text-[11px] font-mono tracking-tight">Efforts</span>
          </button>

          <button 
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center gap-1 transition ${activeTab === 'settings' ? 'text-blue-400 font-medium' : 'text-[#64748b]'}`}
          >
            <Settings className="w-5 h-5" />
            <span className="text-[11px] font-mono tracking-tight">Settings</span>
          </button>
        </nav>

        {/* Full-Screen Image Lightbox / Zoom Modal */}
        {zoomedImageUrl && (
          <div 
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between p-4 animate-in fade-in duration-200"
            onClick={() => setZoomedImageUrl(null)}
          >
            <div className="flex items-center justify-between text-xs text-white shrink-0" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2">
                <ZoomIn className="w-4 h-4 text-blue-400" />
                <span className="font-mono text-xs text-slate-300">Image Viewer</span>
              </div>
              <div className="flex items-center gap-2">
                <a 
                  href={zoomedImageUrl} 
                  target="_blank" 
                  rel="noreferrer"
                  className="p-2 bg-[#1e293b] hover:bg-[#334155] rounded-xl text-white transition flex items-center gap-1 font-mono text-[11px]"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open Full
                </a>
                <button 
                  onClick={() => setZoomedImageUrl(null)}
                  className="p-2 bg-[#1e293b] hover:bg-[#334155] rounded-xl text-white transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 flex items-center justify-center p-2 overflow-auto" onClick={() => setZoomedImageUrl(null)}>
              <img 
                src={zoomedImageUrl} 
                alt="Zoomed view"
                onClick={e => e.stopPropagation()}
                className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl transition-transform cursor-default"
              />
            </div>

            <div className="text-center text-[11px] font-mono text-[#64748b] shrink-0">
              Tap anywhere or click close to exit
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
