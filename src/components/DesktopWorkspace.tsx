import React, { useState, useMemo, useEffect } from 'react';
import {
  FolderKanban,
  Clock,
  ExternalLink,
  RefreshCw,
  Star,
  Search,
  Settings,
  X,
  Check,
  Plus,
  ArrowUpDown,
  Menu,
  Trash2,
  Pencil,
  UploadCloud,
  DownloadCloud,
  ChevronLeft,
  ChevronRight,
  Database,
  Bookmark,
  MessageSquare,
  Timer,
  Copy,
  FileText,
  Globe,
  CheckCircle2,
  Send,
  Calendar,
  Maximize2,
  Minimize2,
  ArrowRight
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import type { LocalTicket, LocalEffort, LookupItem, SavedView, SyncQueueItem } from '../services/db';
import { parseDurationToHours } from '../services/syncService';
import { AuthenticatedImage } from './AuthenticatedImage';
import { preprocessOpenProjectMarkdown } from '../utils/markdownUtils';
import { extractTicketIdFromUrlOrText } from '../utils/urlParser';
import MultiSelect from './MultiSelect';
import { useResizableWindow } from '../hooks/useResizableWindow';

export interface DesktopWorkspaceProps {
  tickets: LocalTicket[];
  filteredTickets: LocalTicket[];
  starredTickets: LocalTicket[];
  statuses: LookupItem[];
  types: LookupItem[];
  displayPriorities: LookupItem[];
  projectsList: { id: string; name: string }[];
  projectAssigneesMap: Record<string, LookupItem[]>;
  currentUser: { id: string; name: string };
  selectedTicketId: number | null;
  setSelectedTicketId: (id: number | null) => void;
  selectedTicket: LocalTicket | null;
  selectedTicketStats: {
    spentHours: number;
    estimatedHours: number;
    mySpentHours: number;
    percent: number | null;
    remainingHours: number | null;
  };
  ticketEffortsList: {
    id: string;
    hours: number;
    spentOn: string;
    userName: string;
    userId?: string;
    comment: string;
    activity?: string;
    pendingSync?: boolean;
  }[];
  isLoadingTicketEfforts: boolean;
  ticketActivities?: {
    id: number;
    userName: string;
    createdAt: string;
    commentRaw: string;
    details: string[];
  }[];
  isLoadingActivities?: boolean;
  allEfforts: LocalEffort[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  isSearchingRemote: boolean;
  handleRemoteSearch?: () => void;
  filterProjects: string[];
  setFilterProjects: React.Dispatch<React.SetStateAction<string[]>>;
  filterStatuses: string[];
  setFilterStatuses: React.Dispatch<React.SetStateAction<string[]>>;
  filterStatusCategory: 'all' | 'open' | 'closed';
  setFilterStatusCategory: (cat: 'all' | 'open' | 'closed') => void;
  filterType?: string;
  setFilterType?: (type: string) => void;
  filterTypes?: string[];
  setFilterTypes?: React.Dispatch<React.SetStateAction<string[]>>;
  filterAssignee?: string;
  setFilterAssignee?: (assignee: string) => void;
  filterAssignees?: string[];
  setFilterAssignees?: React.Dispatch<React.SetStateAction<string[]>>;
  filterPriority?: string;
  setFilterPriority?: (priority: string) => void;
  filterPriorities?: string[];
  setFilterPriorities?: React.Dispatch<React.SetStateAction<string[]>>;
  filterStarredOnly: boolean;
  setFilterStarredOnly: React.Dispatch<React.SetStateAction<boolean>>;
  sortBy: 'updated_desc' | 'updated_asc' | 'id_desc' | 'id_asc' | 'priority';
  setSortBy: (sort: 'updated_desc' | 'updated_asc' | 'id_desc' | 'id_asc' | 'priority') => void;
  activeFilterCount: number;
  resetFilters: () => void;
  savedViews: SavedView[];
  activeViewId: string;
  applySavedView: (view: SavedView) => void;
  todayTotalHours: number;
  weeklyTotalHours: number;
  hoursPerDateMap: Record<string, number>;
  weekDays: { dateStr: string; label: string; dayName: string; isToday: boolean }[];
  weekOffset: number;
  setWeekOffset: React.Dispatch<React.SetStateAction<number>>;
  selectedEffortDate: string;
  setSelectedEffortDate: (date: string) => void;
  effortsForSelectedDate: LocalEffort[];
  effortSearchQuery: string;
  setEffortSearchQuery: (q: string) => void;
  searchedEfforts: LocalEffort[] | null;
  isSyncing: boolean;
  isOnline: boolean;
  lastSyncText: string;
  pendingCount: number;
  handleSync: (force?: boolean) => void;
  handleToggleStar: (e: React.MouseEvent, ticketId: number) => void;
  handleUpdateStatus: (ticket: LocalTicket, newStatusId: string, newStatusName: string) => void;
  handleUpdateAssignee: (ticket: LocalTicket, newAssigneeId: string, newAssigneeName: string) => void;
  handleUpdatePriority?: (ticket: LocalTicket, newPriorityId: string) => void;
  handleDeleteEffort: (entry: { id: string; hours: number; spentOn: string }) => void;
  handleEditEffort: (entry: {
    id: string;
    workPackageId: number;
    ticketSubject?: string;
    hours: number;
    comment: string;
    spentOn: string;
    activity?: string;
  }) => void;
  setIsAddEffortModalOpen: (open: boolean) => void;
  setZoomedImageUrl: (url: string | null) => void;
  opUrl: string;
  opSheetUrl: string;
  isSyncingSheet: boolean;
  isRestoringSheet: boolean;
  sheetLastSyncTime: string;
  handleSyncWithSheet: () => void;
  handleRestoreFromSheet: () => void;
  setIsSaveViewModalOpen?: (open: boolean) => void;
  onQuickLogEffortSubmit?: (ticketId: number, hours: string, comment: string) => Promise<void>;
  onAddCommentSubmit?: (ticketId: number, comment: string) => Promise<void>;
  currentWeekTotalHours?: number;
  monthTotalHours?: number;
  syncQueue?: SyncQueueItem[];
  handleProcessSingleSyncItem?: (item: SyncQueueItem) => Promise<void>;
  handleDiscardSyncItem?: (item: SyncQueueItem) => Promise<void>;
  onSaveSettings?: (url: string, key: string, sheetUrl: string) => Promise<void>;
}

export default function DesktopWorkspace(props: DesktopWorkspaceProps) {
  const {
    tickets,
    filteredTickets,
    starredTickets,
    statuses,
    types,
    displayPriorities,
    projectsList,
    projectAssigneesMap,
    currentUser,
    selectedTicketId,
    setSelectedTicketId,
    selectedTicket,
    selectedTicketStats,
    ticketEffortsList,
    isLoadingTicketEfforts,
    ticketActivities = [],
    isLoadingActivities = false,
    allEfforts,
    searchQuery,
    setSearchQuery,
    isSearchingRemote,
    handleRemoteSearch,
    filterProjects,
    setFilterProjects,
    filterStatuses,
    setFilterStatuses,
    filterStatusCategory,
    setFilterStatusCategory,
    filterType,
    setFilterType,
    filterTypes,
    setFilterTypes,
    filterAssignee,
    setFilterAssignee,
    filterAssignees,
    setFilterAssignees,
    filterPriority,
    setFilterPriority,
    filterPriorities,
    setFilterPriorities,
    filterStarredOnly,
    setFilterStarredOnly,
    sortBy,
    setSortBy,
    activeFilterCount,
    resetFilters,
    savedViews,
    activeViewId,
    applySavedView,
    todayTotalHours,
    weeklyTotalHours,
    currentWeekTotalHours = weeklyTotalHours,
    monthTotalHours = 0,
    syncQueue = [],
    handleProcessSingleSyncItem,
    handleDiscardSyncItem,
    hoursPerDateMap,
    weekDays,
    weekOffset,
    setWeekOffset,
    selectedEffortDate,
    setSelectedEffortDate,
    effortsForSelectedDate,
    effortSearchQuery,
    setEffortSearchQuery,
    searchedEfforts,
    isSyncing,
    isOnline,
    lastSyncText,
    pendingCount,
    handleSync,
    handleToggleStar,
    handleUpdateStatus,
    handleUpdateAssignee,
    handleDeleteEffort,
    handleEditEffort,
    setIsAddEffortModalOpen,
    setZoomedImageUrl,
    opUrl,
    opSheetUrl,
    isSyncingSheet,
    isRestoringSheet,
    sheetLastSyncTime,
    handleSyncWithSheet,
    handleRestoreFromSheet,
    setIsSaveViewModalOpen,
    onQuickLogEffortSubmit,
    onAddCommentSubmit,
    onSaveSettings
  } = props;

  // Helper to open in full screen / new tab and automatically close side panel
  const openInFullScreenAndClose = (url: string) => {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url }, () => {
        try { window.close(); } catch(e) {}
      });
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
      try { window.close(); } catch(e) {}
    }
  };

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'tickets' | 'efforts' | 'sheet' | 'settings'>(() => {
    try {
      const saved = localStorage.getItem('op_active_tab');
      if (saved && ['tickets', 'efforts', 'sheet', 'settings'].includes(saved)) {
        return saved as any;
      }
    } catch (e) {}
    return 'tickets';
  });

  useEffect(() => {
    try {
      localStorage.setItem('op_active_tab', activeTab);
    } catch (e) {}
  }, [activeTab]);
  // Inspector tab: overview (all-in-one in full view), details, efforts, comments
  const [inspectorTab, setInspectorTab] = useState<'overview' | 'details' | 'efforts' | 'comments'>('details');

  // Ticket navigation history stack for back navigation when opening ticket-from-ticket
  const [ticketHistory, setTicketHistory] = useState<number[]>([]);

  // Desktop Full View mode state (persisted)
  const [isInspectorFullView, setIsInspectorFullView] = useState<boolean>(() => {
    try {
      return localStorage.getItem('op_inspector_full_view') === 'true';
    } catch (e) {
      return false;
    }
  });

  const toggleInspectorFullView = () => {
    setIsInspectorFullView(prev => {
      const next = !prev;
      try { localStorage.setItem('op_inspector_full_view', String(next)); } catch (e) {}
      if (next) {
        setInspectorTab('overview');
      } else {
        setInspectorTab('details');
      }
      return next;
    });
  };

  // Helper to drill down into a ticket from another ticket (maintaining back history)
  const navigateToLinkedTicket = (targetId: number) => {
    if (selectedTicketId && selectedTicketId !== targetId) {
      setTicketHistory(prev => [...prev, selectedTicketId]);
    }
    setSelectedTicketId(targetId);
  };

  // Helper to select a ticket from the top-level table or card list (resets history)
  const selectRootTicket = (ticketId: number) => {
    setTicketHistory([]);
    setSelectedTicketId(ticketId);
  };

  // Back navigation handler: pops previous ticket from history, or closes inspector if at root
  const handleBackNavigation = () => {
    if (ticketHistory.length > 0) {
      const nextHist = [...ticketHistory];
      const prevTicketId = nextHist.pop()!;
      setTicketHistory(nextHist);
      setSelectedTicketId(prevTicketId);
    } else {
      setSelectedTicketId(null);
    }
  };

  // Full close inspector handler
  const handleCloseInspector = () => {
    setTicketHistory([]);
    setSelectedTicketId(null);
  };
  const [copiedId, setCopiedId] = useState(false);
  const [isOutboxModalOpen, setIsOutboxModalOpen] = useState(false);
  const [processingItemId, setProcessingItemId] = useState<string | null>(null);

  // Responsive breakpoint tracker for mobile vs desktop
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- Resizable Sidebar Window / Rail ---
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('op_workspace_sidebar_width');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 180 && parsed <= 500) return parsed;
      }
    }
    return 256;
  });

  const handleSidebarResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const prevSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(180, Math.min(480, startWidth + delta));
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      document.body.style.userSelect = prevSelect;
      setSidebarWidth(current => {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('op_workspace_sidebar_width', String(current));
        }
        return current;
      });
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // --- Resizable Ticket Detail Inspector Window / Pane ---
  const [inspectorWidth, setInspectorWidth] = useState<number>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('op_workspace_inspector_width');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 320 && parsed <= 1000) return parsed;
      }
    }
    return 520;
  });

  const handleInspectorResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = inspectorWidth;
    const prevSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const maxW = typeof window !== 'undefined' ? Math.max(400, window.innerWidth - 320) : 900;
      const newWidth = Math.max(340, Math.min(maxW, startWidth + delta));
      setInspectorWidth(newWidth);
    };

    const onMouseUp = () => {
      document.body.style.userSelect = prevSelect;
      setInspectorWidth(current => {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('op_workspace_inspector_width', String(current));
        }
        return current;
      });
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // --- Resizable Outbox Modal Window ---
  const outboxModalWindow = useResizableWindow({
    storageKey: 'op_modal_outbox_size',
    defaultWidth: 680,
    defaultHeight: 580,
    minWidth: 420,
    minHeight: 350
  });

  // Quick effort state inside inspector
  const [quickEffortHours, setQuickEffortHours] = useState('1.0');
  const [quickEffortComment, setQuickEffortComment] = useState('');
  const [isSubmittingQuickEffort, setIsSubmittingQuickEffort] = useState(false);

  // Inline comment state inside inspector
  const [newCommentText, setNewCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // Settings form local state (for dedicated settings tab)
  const [formOpUrl, setFormOpUrl] = useState(opUrl);
  const [formOpApiKey, setFormOpApiKey] = useState('');
  const [formOpSheetUrl, setFormOpSheetUrl] = useState(opSheetUrl);
  const [isSavingFormSettings, setIsSavingFormSettings] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);

  // Preprocessed markdown description for selected ticket
  const preprocessedDescription = useMemo(() => {
    return preprocessOpenProjectMarkdown(selectedTicket?.description);
  }, [selectedTicket?.description]);

  // Detected linked work package or production ticket in description (Requirement 3)
  const linkedWorkPackageMatch = useMemo(() => {
    if (!selectedTicket?.description) return null;
    const match = selectedTicket.description.match(/work[\\_]+packages\/(\d+)/i) || 
                  selectedTicket.description.match(/work_packages\/(\d+)/i);
    return match ? parseInt(match[1], 10) : null;
  }, [selectedTicket?.description]);

  // Comprehensive project options: union of API projects and distinct ticket.project values
  const allProjectOptions = useMemo(() => {
    const set = new Set<string>();
    (projectsList || []).forEach(p => {
      if (p.name?.trim()) set.add(p.name.trim());
    });
    tickets.forEach(t => {
      if (t.project?.trim() && t.project.trim().toLowerCase() !== 'unknown project') {
        set.add(t.project.trim());
      }
    });
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map(name => ({ id: name, name }));
  }, [projectsList, tickets]);

  // Comprehensive status options: union of API statuses and distinct ticket.status values
  const allStatusOptions = useMemo(() => {
    const map = new Map<string, string>();
    (statuses || []).forEach(s => {
      map.set(String(s.id), s.name);
    });
    tickets.forEach(t => {
      if (t.status?.trim()) {
        const key = t.statusId ? String(t.statusId) : t.status.trim();
        if (!map.has(key)) {
          map.set(key, t.status.trim());
        }
      }
    });
    return Array.from(map.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name]) => ({ id, name }));
  }, [statuses, tickets]);

  // Comprehensive type options: union of API types and distinct ticket.type values
  const allTypeOptions = useMemo(() => {
    const set = new Set<string>();
    (types || []).forEach(t => {
      if (t.name?.trim()) set.add(t.name.trim());
    });
    tickets.forEach(t => {
      if (t.type?.trim()) set.add(t.type.trim());
    });
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map(name => ({ id: name, name }));
  }, [types, tickets]);

  // Comprehensive priority options: union of API priorities and distinct ticket.priority values
  const allPriorityOptions = useMemo(() => {
    const set = new Set<string>();
    (displayPriorities || []).forEach(p => {
      if (p.name?.trim()) set.add(p.name.trim());
    });
    tickets.forEach(t => {
      if (t.priority?.trim()) set.add(t.priority.trim());
    });
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map(name => ({ id: name, name }));
  }, [displayPriorities, tickets]);

  // Distinct assignee options for multi-select
  const allAssigneeOptions = useMemo(() => {
    const list = [
      { id: 'me', name: 'Assigned to Me' },
      { id: 'unassigned', name: 'Unassigned' }
    ];
    const seen = new Set(['me', 'unassigned']);
    tickets.forEach(t => {
      const aName = (t.assignee || '').trim();
      if (aName && aName.toLowerCase() !== 'unassigned' && !seen.has(aName)) {
        seen.add(aName);
        list.push({ id: aName, name: aName });
      }
    });
    return list;
  }, [tickets]);

  // Effective multi-select values
  const effectiveFilterTypes = useMemo(() => {
    if (filterTypes && filterTypes.length > 0) return filterTypes;
    return filterType ? [filterType] : [];
  }, [filterTypes, filterType]);

  const effectiveFilterAssignees = useMemo(() => {
    if (filterAssignees && filterAssignees.length > 0) return filterAssignees;
    return filterAssignee ? [filterAssignee] : [];
  }, [filterAssignees, filterAssignee]);

  const effectiveFilterPriorities = useMemo(() => {
    if (filterPriorities && filterPriorities.length > 0) return filterPriorities;
    return filterPriority ? [filterPriority] : [];
  }, [filterPriorities, filterPriority]);

  // Tracked tickets summary for Effort tab (Requirement 8)
  const trackedTicketsSummary = useMemo(() => {
    const map = new Map<number, { id: number; subject: string; project: string; totalHours: number }>();
    allEfforts.forEach(eff => {
      const existing = map.get(eff.workPackageId);
      const hours = eff.hours || 0;
      if (existing) {
        existing.totalHours = +(existing.totalHours + hours).toFixed(2);
      } else {
        const ticket = tickets.find(t => t.id === eff.workPackageId);
        map.set(eff.workPackageId, {
          id: eff.workPackageId,
          subject: ticket?.subject || eff.ticketSubject || `Ticket #${eff.workPackageId}`,
          project: ticket?.project || 'Tracked Work Package',
          totalHours: hours
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.totalHours - a.totalHours);
  }, [allEfforts, tickets]);

  // Automatically select Monday (or today if present in week) when switching weeks if current selected date is outside week
  useEffect(() => {
    if (weekDays && weekDays.length > 0) {
      const inWeek = weekDays.some(d => d.dateStr === selectedEffortDate);
      if (!inWeek) {
        const todayItem = weekDays.find(d => d.isToday);
        setSelectedEffortDate(todayItem ? todayItem.dateStr : weekDays[0].dateStr);
      }
    }
  }, [weekDays, selectedEffortDate, setSelectedEffortDate]);

  // Active day details for the first KPI card in Time Tracking tab
  const activeDayHours = useMemo(() => {
    return hoursPerDateMap[selectedEffortDate] || 0;
  }, [hoursPerDateMap, selectedEffortDate]);

  const activeDayCardTitle = useMemo(() => {
    const today = new Date();
    const todayDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (selectedEffortDate === todayDateStr) {
      return "Today's Total";
    }
    const dayObj = weekDays.find(d => d.dateStr === selectedEffortDate);
    if (dayObj) {
      return `${dayObj.dayName}, ${dayObj.label} Total`;
    }
    return "Selected Day Total";
  }, [selectedEffortDate, weekDays]);

  // Active week card title for Time Tracking tab
  const activeWeekCardTitle = useMemo(() => {
    return weekOffset === 0 ? "This Week Total" : "Week Total";
  }, [weekOffset]);

  // Active month calculation for the third KPI card in Time Tracking tab
  const activeMonthPrefix = useMemo(() => {
    if (selectedEffortDate && selectedEffortDate.length >= 7) {
      return selectedEffortDate.slice(0, 7);
    }
    if (weekDays && weekDays.length > 2 && weekDays[2].dateStr) {
      return weekDays[2].dateStr.slice(0, 7);
    }
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  }, [selectedEffortDate, weekDays]);

  const activeMonthName = useMemo(() => {
    try {
      const [y, m] = activeMonthPrefix.split('-');
      const d = new Date(Number(y), Number(m) - 1, 1);
      return d.toLocaleDateString('en-US', { month: 'long' });
    } catch {
      return "Month";
    }
  }, [activeMonthPrefix]);

  const activeMonthTotalHours = useMemo(() => {
    return allEfforts.reduce((sum, eff) => {
      if (eff.spentOn && eff.spentOn.startsWith(activeMonthPrefix)) {
        return +(sum + eff.hours).toFixed(2);
      }
      return sum;
    }, 0);
  }, [allEfforts, activeMonthPrefix]);

  const activeMonthCardTitle = useMemo(() => {
    const today = new Date();
    const currentPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    if (activeMonthPrefix === currentPrefix) {
      return "This Month Total";
    }
    return `${activeMonthName} Total`;
  }, [activeMonthPrefix, activeMonthName]);

  // Project assignees for selected ticket
  const selectedTicketAssignees = useMemo(() => {
    if (!selectedTicket) return [];
    const pId = selectedTicket.projectId || selectedTicket.project;
    const list = projectAssigneesMap[pId] || projectAssigneesMap[selectedTicket.project] || [];
    if (selectedTicket.assigneeId && selectedTicket.assignee && selectedTicket.assignee.toLowerCase() !== 'unassigned') {
      if (!list.some(u => u.id === selectedTicket.assigneeId)) {
        return [{ id: selectedTicket.assigneeId, name: selectedTicket.assignee }, ...list];
      }
    }
    return list;
  }, [selectedTicket, projectAssigneesMap]);

  // Helper to copy ticket link or ID
  const handleCopyLink = () => {
    if (!selectedTicket) return;
    const url = `${opUrl.replace(/\/+$/, '')}/work_packages/${selectedTicket.id}`;
    navigator.clipboard.writeText(url);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  // Quick effort submit inside inspector
  const handleInlineEffortSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !onQuickLogEffortSubmit) return;
    setIsSubmittingQuickEffort(true);
    try {
      await onQuickLogEffortSubmit(selectedTicket.id, quickEffortHours, quickEffortComment);
      setQuickEffortComment('');
    } finally {
      setIsSubmittingQuickEffort(false);
    }
  };

  // Inline comment submit inside inspector
  const handleInlineCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !onAddCommentSubmit || !newCommentText.trim()) return;
    setIsSubmittingComment(true);
    try {
      await onAddCommentSubmit(selectedTicket.id, newCommentText.trim());
      setNewCommentText('');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Settings save handler
  const handleSettingsSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveSettings) return;
    setIsSavingFormSettings(true);
    try {
      await onSaveSettings(formOpUrl, formOpApiKey, formOpSheetUrl);
      setSettingsNotice('Configuration saved successfully!');
      setTimeout(() => setSettingsNotice(null), 3000);
    } finally {
      setIsSavingFormSettings(false);
    }
  };

  // Helper to color-code status badge
  const getStatusBadgeClass = (statusName: string = '') => {
    const s = statusName.toLowerCase();
    if (s.includes('closed') || s.includes('resolved') || s.includes('done')) {
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    }
    if (s.includes('progress') || s.includes('develop')) {
      return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    }
    if (s.includes('feedback') || s.includes('review') || s.includes('testing')) {
      return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
    }
    if (s.includes('reject') || s.includes('cancel')) {
      return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
    }
    return 'bg-slate-700/40 text-slate-300 border-slate-600/40';
  };

  // Helper for priority badges
  const getPriorityBadgeClass = (priorityName: string = '') => {
    const p = priorityName.toLowerCase();
    if (p.includes('urgent') || p.includes('immediate')) {
      return 'text-rose-400 bg-rose-500/10 border-rose-500/25';
    }
    if (p.includes('high')) {
      return 'text-amber-400 bg-amber-500/10 border-amber-500/25';
    }
    if (p.includes('low')) {
      return 'text-slate-400 bg-slate-800 border-slate-700';
    }
    return 'text-blue-300 bg-blue-500/10 border-blue-500/20';
  };

  // Render Sidebar Content (shared between Desktop fixed rail and Mobile drawer)
  const renderSidebarContent = (isMobile = false) => (
    <div className="flex flex-col h-full">
      {/* Brand / Logo Header */}
      <div className="p-4 border-b border-[#1e293b] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
            OP
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm text-white tracking-wide">OpenProject</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 font-semibold border border-blue-500/30">
                PRO
              </span>
            </div>
            <p className="text-[11px] text-[#64748b] font-mono">Web Workspace</p>
          </div>
        </div>
        {isMobile && (
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-[#1e293b] transition"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Current User Pill */}
      <div className="px-4 py-3 border-b border-[#1e293b]/70 bg-[#0a0e1a]/60 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-full bg-blue-600/20 text-blue-400 font-bold font-mono text-xs flex items-center justify-center shrink-0 border border-blue-500/30">
            {currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="truncate">
            <p className="text-xs font-medium text-slate-200 truncate">{currentUser.name}</p>
            <p className="text-[10px] text-[#64748b] font-mono">ID: #{currentUser.id}</p>
          </div>
        </div>
        <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 ring-4 ring-emerald-400/20' : 'bg-amber-400'}`} title={isOnline ? 'Online' : 'Offline'} />
      </div>

      {/* Primary Navigation Menu */}
      <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
        <div className="px-3 py-1.5 text-[10px] font-mono font-semibold tracking-wider text-[#64748b] uppercase">
          Workspace
        </div>

        <button
          onClick={() => {
            setActiveTab('tickets');
            if (isMobile) setIsMobileMenuOpen(false);
          }}
          className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between text-xs font-medium transition ${
            activeTab === 'tickets'
              ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/20'
              : 'text-slate-300 hover:bg-[#1e293b]/60 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <FolderKanban className="w-4 h-4" />
            <span>Work Packages</span>
          </div>
          <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full ${activeTab === 'tickets' ? 'bg-blue-700/60 text-white' : 'bg-[#1e293b] text-[#94a3b8]'}`}>
            {filteredTickets.length}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('efforts');
            if (isMobile) setIsMobileMenuOpen(false);
          }}
          className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between text-xs font-medium transition ${
            activeTab === 'efforts'
              ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/20'
              : 'text-slate-300 hover:bg-[#1e293b]/60 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Clock className="w-4 h-4" />
            <span>Effort & Time Tracker</span>
          </div>
          <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full ${activeTab === 'efforts' ? 'bg-blue-700/60 text-white' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
            {todayTotalHours.toFixed(1)}h
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('sheet');
            if (isMobile) setIsMobileMenuOpen(false);
          }}
          className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between text-xs font-medium transition ${
            activeTab === 'sheet'
              ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/20'
              : 'text-slate-300 hover:bg-[#1e293b]/60 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Database className="w-4 h-4" />
            <span>Google Sheet Dual-Sync</span>
          </div>
          {opSheetUrl && (
            <span className="w-2 h-2 rounded-full bg-emerald-400" title="Sheet connected" />
          )}
        </button>

        <button
          onClick={() => {
            setActiveTab('settings');
            if (isMobile) setIsMobileMenuOpen(false);
          }}
          className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between text-xs font-medium transition ${
            activeTab === 'settings'
              ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/20'
              : 'text-slate-300 hover:bg-[#1e293b]/60 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Settings className="w-4 h-4" />
            <span>Settings & Server</span>
          </div>
        </button>

        {/* Quick Filters / Saved Views in Sidebar */}
        <div className="pt-4 px-3 py-1.5 flex items-center justify-between text-[10px] font-mono font-semibold tracking-wider text-[#64748b] uppercase">
          <span>Quick Views</span>
          {setIsSaveViewModalOpen && (
            <button
              onClick={() => {
                if (isMobile) setIsMobileMenuOpen(false);
                setIsSaveViewModalOpen(true);
              }}
              className="text-blue-400 hover:text-blue-300 normal-case flex items-center gap-0.5 text-[10px]"
              title="Save current filters as a new saved view"
            >
              <Plus className="w-3 h-3" />
              <span>Save</span>
            </button>
          )}
        </div>
        <div className="space-y-1">
          {savedViews.slice(0, 6).map(view => {
            const isActive = activeViewId === view.id;
            return (
              <button
                key={view.id}
                onClick={() => {
                  setActiveTab('tickets');
                  applySavedView(view);
                  if (isMobile) setIsMobileMenuOpen(false);
                }}
                className={`w-full px-3 py-2 rounded-lg flex items-center gap-2 text-xs transition text-left ${
                  isActive && activeTab === 'tickets'
                    ? 'bg-[#1e293b] text-blue-400 font-semibold'
                    : 'text-slate-400 hover:bg-[#1e293b]/40 hover:text-slate-200'
                }`}
              >
                <Bookmark className={`w-3.5 h-3.5 ${isActive ? 'text-blue-400 fill-current' : 'text-[#64748b]'}`} />
                <span className="truncate">{view.name}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Sidebar Bottom Footer Actions */}
      <div className="p-3 border-t border-[#1e293b] space-y-2 bg-[#090d16]/70">
        {/* Quick Effort Trigger */}
        <button
          onClick={() => {
            if (isMobile) setIsMobileMenuOpen(false);
            setIsAddEffortModalOpen(true);
          }}
          className="w-full py-2 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center justify-center gap-2 transition active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          <span>Log Effort (+Hours)</span>
        </button>

        {/* Sync Button & Connection Status */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleSync(true)}
            disabled={isSyncing}
            className="flex-1 py-1.5 px-2.5 rounded-lg border border-[#1e293b] bg-[#0d1322] hover:border-blue-500/40 text-[11px] font-mono text-slate-300 flex items-center justify-center gap-2 transition"
            title="Click to sync with OpenProject"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-400' : 'text-slate-400'}`} />
            <span className="truncate">{isSyncing ? 'Syncing...' : lastSyncText}</span>
          </button>

          <button
            onClick={() => {
              if (isMobile) setIsMobileMenuOpen(false);
              setIsOutboxModalOpen(true);
            }}
            className={`px-2 py-1.5 rounded-lg border text-[11px] font-mono font-bold flex items-center gap-1 transition ${
              pendingCount > 0
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25'
                : 'bg-[#0d1322] text-slate-400 border-[#1e293b] hover:text-white'
            }`}
            title="Outbox & Pending Changes - Click to review & send manually"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{pendingCount}</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('settings');
              if (isMobile) setIsMobileMenuOpen(false);
            }}
            className="p-1.5 rounded-lg border border-[#1e293b] bg-[#0d1322] text-slate-400 hover:text-white hover:border-slate-600 transition"
            title="Open Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Live Status & Expand to Full Tab */}
        <div className="py-2 px-3 rounded-xl bg-[#090d16] border border-[#1e293b] flex items-center justify-between text-[11px] font-mono text-[#64748b]">
          <div className="flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-slate-300 font-medium">Extension & Web</span>
          </div>
          <button
            onClick={() => {
              if (typeof chrome !== 'undefined' && chrome.tabs && chrome.runtime?.getURL) {
                chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
                try { window.close(); } catch(e) {}
              } else {
                window.open(window.location.href, '_blank');
              }
            }}
            className="text-blue-400 hover:text-blue-300 flex items-center gap-1 hover:underline text-[10px]"
            title="Open in a full browser tab"
          >
            <span>Full Tab</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );

  // --- Helper Section Renderers for Ticket Details, Efforts, and Comments ---
  const renderDescriptionSection = () => (
    <div className="space-y-4 bg-[#090d16] p-4 rounded-xl border border-[#1e293b]">
      {/* Linked Production / Parent Work Package Banner (Requirement 3) */}
      {linkedWorkPackageMatch && (
        <div className="p-3 bg-blue-950/40 border border-blue-500/30 rounded-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-blue-300 min-w-0">
            <FolderKanban className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="truncate">
              Linked OP Ticket: <strong className="text-white font-mono">#{linkedWorkPackageMatch}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => navigateToLinkedTicket(linkedWorkPackageMatch)}
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-mono font-medium transition flex items-center gap-1 shadow-sm"
              title={`Switch to ticket #${linkedWorkPackageMatch} in app`}
            >
              <span>View #{linkedWorkPackageMatch}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => openInFullScreenAndClose(`${opUrl.replace(/\/+$/, '')}/work_packages/${linkedWorkPackageMatch}`)}
              className="p-1.5 bg-[#1e293b] hover:bg-[#283548] text-slate-300 hover:text-white rounded-lg transition"
              title="Open in OpenProject tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="prose prose-invert max-w-none text-xs leading-relaxed text-slate-300">
        {preprocessedDescription ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
            components={{
              img: ({ src, alt }) => (
                <AuthenticatedImage src={src} alt={alt} onZoom={setZoomedImageUrl} />
              ),
              a: ({ href, children }) => {
                if (!href) return <span>{children}</span>;
                const match = href.match(/work[\\_]+packages\/(\d+)/i) || href.match(/work_packages\/(\d+)/i);
                if (match) {
                  const targetId = parseInt(match[1], 10);
                  return (
                    <span className="inline-flex items-center gap-1.5 my-0.5 align-middle">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigateToLinkedTicket(targetId);
                        }}
                        className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 px-2 py-0.5 rounded text-xs font-mono font-medium transition cursor-pointer"
                        title={`Switch to ticket #${targetId} in app`}
                      >
                        <span>#{targetId}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openInFullScreenAndClose(href);
                        }}
                        className="text-[#64748b] hover:text-white p-0.5"
                        title="Open in OpenProject tab"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  );
                }
                return (
                  <a
                    href={href}
                    onClick={(e) => {
                      e.preventDefault();
                      openInFullScreenAndClose(href);
                    }}
                    className="text-blue-400 hover:underline inline-flex items-center gap-1"
                  >
                    <span>{children}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                );
              }
            }}
          >
            {preprocessedDescription}
          </ReactMarkdown>
        ) : (
          <p className="italic text-[#64748b]">No description provided for this work package.</p>
        )}
      </div>
    </div>
  );

  const renderEffortsSection = () => (
    <div className="space-y-4">
      {/* Quick Effort Entry Card */}
      <div className="p-4 bg-[#090d16] border border-[#1e293b] rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-200">Quick Log Time</span>
          <div className="flex items-center gap-1">
            {['0.25', '0.5', '1.0', '2.0'].map(h => (
              <button
                key={h}
                type="button"
                onClick={() => setQuickEffortHours(h)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono border transition ${
                  quickEffortHours === h
                    ? 'bg-blue-600 border-blue-500 text-white font-bold'
                    : 'bg-[#1e293b] border-transparent text-[#94a3b8] hover:text-white'
                }`}
              >
                +{h}h
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleInlineEffortSubmit} className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.25"
              min="0.1"
              value={quickEffortHours}
              onChange={e => setQuickEffortHours(e.target.value)}
              className="w-20 bg-[#0d1322] border border-[#1e293b] rounded-lg px-2.5 py-1 text-xs text-white font-mono focus:border-blue-500 focus:outline-none"
              placeholder="Hours"
              required
            />
            <input
              type="text"
              value={quickEffortComment}
              onChange={e => setQuickEffortComment(e.target.value)}
              placeholder="What did you work on?"
              className="flex-1 bg-[#0d1322] border border-[#1e293b] rounded-lg px-2.5 py-1 text-xs text-white placeholder-[#64748b] focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isSubmittingQuickEffort}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50"
            >
              {isSubmittingQuickEffort ? 'Saving...' : 'Log'}
            </button>
          </div>
        </form>
      </div>

      {/* Time logs history */}
      <div className="space-y-2 bg-[#090d16] p-4 rounded-xl border border-[#1e293b]">
        <h4 className="text-[11px] font-mono uppercase text-[#64748b] tracking-wider">Log History</h4>
        {isLoadingTicketEfforts ? (
          <p className="text-xs text-blue-400 font-mono animate-pulse">Loading logged efforts...</p>
        ) : ticketEffortsList.length === 0 ? (
          <p className="text-xs text-[#64748b]">No time entries logged for this work package yet.</p>
        ) : (
          ticketEffortsList.map(entry => (
            <div
              key={entry.id}
              className="p-2.5 bg-[#0d1322] border border-[#1e293b] rounded-xl flex items-start justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-emerald-400">
                    {entry.hours.toFixed(2)}h
                  </span>
                  <span className="text-[10px] text-[#64748b] font-mono">{entry.spentOn}</span>
                  <span className="text-[11px] text-slate-300 font-medium">{entry.userName}</span>
                </div>
                {entry.comment && (
                  <p className="text-xs text-[#94a3b8] mt-1 break-words">{entry.comment}</p>
                )}
              </div>
              <button
                onClick={() => handleDeleteEffort({ id: entry.id, hours: entry.hours, spentOn: entry.spentOn })}
                className="p-1 text-[#64748b] hover:text-rose-400 transition"
                title="Delete effort record"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderCommentsSection = () => (
    <div className="space-y-4">
      {/* New Comment / Activity Form */}
      <form onSubmit={handleInlineCommentSubmit} className="space-y-2.5 bg-[#090d16] p-4 rounded-xl border border-[#1e293b]">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
            <span>Add Activity / Comment</span>
          </label>
          <span className="text-[10px] font-mono text-[#64748b]">Markdown supported</span>
        </div>
        <textarea
          rows={3}
          value={newCommentText}
          onChange={e => setNewCommentText(e.target.value)}
          placeholder="Write a comment or activity update for this work package..."
          className="w-full bg-[#0d1322] border border-[#1e293b] rounded-lg p-2.5 text-xs text-white placeholder-[#64748b] focus:border-blue-500 focus:outline-none resize-none"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmittingComment || !newCommentText.trim()}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
          >
            <Send className="w-3 h-3" />
            <span>{isSubmittingComment ? 'Posting...' : 'Post Activity'}</span>
          </button>
        </div>
      </form>

      {/* Activities Stream */}
      <div className="space-y-3 bg-[#090d16] p-4 rounded-xl border border-[#1e293b]">
        <div className="flex items-center justify-between">
          <h4 className="text-[11px] font-mono uppercase text-[#64748b] tracking-wider">
            Activities & Comments ({ticketActivities?.length || 0})
          </h4>
          {isLoadingActivities && (
            <span className="text-[10px] font-mono text-blue-400 flex items-center gap-1 animate-pulse">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Loading...
            </span>
          )}
        </div>

        {isLoadingActivities && (!ticketActivities || ticketActivities.length === 0) ? (
          <div className="p-4 text-center text-xs font-mono text-[#64748b] space-y-2 bg-[#0d1322] rounded-xl border border-[#1e293b]">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-400 mx-auto" />
            <p>Fetching activities from OpenProject...</p>
          </div>
        ) : !ticketActivities || ticketActivities.length === 0 ? (
          <div className="p-4 text-center text-xs text-[#64748b] bg-[#0d1322] rounded-xl border border-[#1e293b]">
            No activities or comments recorded yet.
          </div>
        ) : (
          <div className="space-y-2.5">
            {ticketActivities.map(act => (
              <div
                key={act.id}
                className="p-3 bg-[#0d1322] border border-[#1e293b] rounded-xl space-y-2 transition hover:border-slate-700"
              >
                <div className="flex items-center justify-between gap-2 border-b border-[#1e293b]/50 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 font-bold font-mono text-[10px] flex items-center justify-center border border-blue-500/30">
                      {(act.userName || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-xs font-semibold text-slate-200">{act.userName}</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#64748b]">
                    {new Date(act.createdAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>

                {act.details && act.details.length > 0 && (
                  <ul className="text-[11px] font-mono text-[#94a3b8] space-y-0.5 pl-2 border-l-2 border-blue-500/30">
                    {act.details.map((detail, idx) => (
                      <li key={idx} className="flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-blue-400 shrink-0" />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {act.commentRaw && (
                  <div className="prose prose-invert max-w-none text-xs leading-relaxed text-slate-300 pt-0.5">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw]}
                      components={{
                        img: ({ src, alt }) => (
                          <AuthenticatedImage src={src} alt={alt} onZoom={setZoomedImageUrl} />
                        ),
                        a: ({ href, children }) => {
                          if (!href) return <span>{children}</span>;
                          const match = href.match(/work[\\_]+packages\/(\d+)/i) || href.match(/work_packages\/(\d+)/i);
                          if (match) {
                            const targetId = parseInt(match[1], 10);
                            return (
                              <button
                                type="button"
                                onClick={() => navigateToLinkedTicket(targetId)}
                                className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 underline font-mono cursor-pointer"
                              >
                                <span>#{targetId}</span>
                              </button>
                            );
                          }
                          return (
                            <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                              {children}
                            </a>
                          );
                        }
                      }}
                    >
                      {preprocessOpenProjectMarkdown(act.commentRaw)}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-[#090d16] text-[#f1f5f9] font-sans select-text relative">
      {/* Mobile Drawer (Slide-Over Navigation) */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden animate-in fade-in duration-200">
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] bg-[#0d1322] border-r border-[#1e293b] flex flex-col h-full shadow-2xl z-10 animate-in slide-in-from-left duration-200 select-text">
            {renderSidebarContent(true)}
          </aside>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. LEFT NAVIGATION RAIL (Desktop Resizable Sidebar) */}
      {/* ========================================================================= */}
      <aside 
        style={{ width: `${sidebarWidth}px` }} 
        className="hidden md:flex bg-[#0d1322] border-r border-[#1e293b] flex-col shrink-0 z-20 relative select-text"
      >
        {renderSidebarContent(false)}

        {/* Sidebar Horizontal Resize Handle */}
        <div
          onMouseDown={handleSidebarResizeStart}
          onDoubleClick={() => setSidebarWidth(256)}
          className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500 transition-colors z-30 group flex items-center justify-center select-none"
          title="Drag to resize sidebar width (Double-click to reset)"
        >
          <div className="w-[1.5px] h-8 bg-slate-600 group-hover:bg-blue-400 group-hover:h-12 transition-all rounded-full" />
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 2. MAIN WEBSITE AREA (Header + Content) */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col min-w-0 h-[100dvh] overflow-hidden pb-14 md:pb-0">
        {/* Mobile Top App Bar (md:hidden) */}
        <header className="md:hidden bg-[#0d1322] border-b border-[#1e293b] flex flex-col shrink-0 z-10">
          <div className="h-12 px-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="p-1.5 rounded-lg border border-[#1e293b] bg-[#090d16] text-slate-300 hover:text-white transition shrink-0"
                title="Open navigation menu"
              >
                <Menu className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-white">
                <FolderKanban className="w-4 h-4 text-blue-400" />
                <span>OP Helper</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setIsAddEffortModalOpen(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-mono font-bold"
                title="Log time effort"
              >
                <Timer className="w-3.5 h-3.5" />
                <span>{todayTotalHours.toFixed(1)}h</span>
              </button>

              <button
                onClick={() => setIsOutboxModalOpen(true)}
                className="p-1.5 rounded-lg border border-[#1e293b] bg-[#090d16] text-slate-300 relative"
                title="Outbox"
              >
                <Send className="w-3.5 h-3.5 text-amber-400" />
                {pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 px-1 rounded-full bg-amber-500 text-[9px] font-bold text-black">
                    {pendingCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => handleSync(true)}
                disabled={isSyncing}
                className="p-1.5 rounded-lg border border-[#1e293b] bg-[#090d16] text-slate-300"
                title="Sync now"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-400' : 'text-slate-400'}`} />
              </button>
            </div>
          </div>

          {/* Search bar row on mobile */}
          <div className="px-3 pb-2.5">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-[#64748b] absolute left-3 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by #ID, subject, project..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#090d16] border border-[#1e293b] rounded-xl pl-9 pr-8 py-1.5 text-xs text-slate-200 placeholder-[#64748b] focus:border-blue-500 focus:outline-none transition shadow-inner font-sans"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 p-0.5 text-[#64748b] hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Desktop Top App Bar (hidden md:flex) */}
        <header className="hidden md:flex h-14 bg-[#0d1322] border-b border-[#1e293b] px-6 items-center justify-between shrink-0 gap-3 z-10">
          {/* Global Search with Debounce & Remote Fallback */}
          <div className="flex-1 max-w-xl relative flex items-center">
            <Search className="w-4 h-4 text-[#64748b] absolute left-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Search work packages by #ID, subject, project, assignee..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#090d16] border border-[#1e293b] rounded-xl pl-9 pr-9 py-1.5 text-xs text-slate-200 placeholder-[#64748b] focus:border-blue-500 focus:outline-none transition shadow-inner font-sans"
            />
            {(() => {
              const extractedSearchId = extractTicketIdFromUrlOrText(searchQuery) || parseInt(searchQuery.replace(/^#/, ''), 10);
              const hasSearchTargetId = !isNaN(extractedSearchId) && extractedSearchId > 0;
              if (hasSearchTargetId) {
                return (
                  <button
                    type="button"
                    onClick={() => openInFullScreenAndClose(`${opUrl.replace(/\/$/, '')}/work_packages/${extractedSearchId}`)}
                    className="absolute right-16 px-2 py-0.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded text-[10px] font-mono flex items-center gap-1 transition"
                    title="Open directly in OpenProject tab"
                  >
                    <span>Open in OP</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </button>
                );
              }
              return null;
            })()}
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 p-0.5 text-[#64748b] hover:text-white transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            {isSearchingRemote && (
              <span className="absolute right-9 flex items-center gap-1 text-[10px] text-blue-400 font-mono animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Remote
              </span>
            )}
            {handleRemoteSearch && !isSearchingRemote && searchQuery && (
              <button
                onClick={handleRemoteSearch}
                className="absolute right-8 text-[10px] font-mono text-blue-400 hover:underline px-1"
                title="Search on OpenProject server"
              >
                Server
              </button>
            )}
          </div>

          {/* Right Top Header Actions */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Quick Effort Summary Pill - Today, Week, Month */}
            <div className="flex items-center bg-[#090d16] border border-[#1e293b] rounded-xl p-1 gap-1 text-xs font-mono">
              <button
                onClick={() => setIsAddEffortModalOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition"
                title="Today's hours - click to log time"
              >
                <Timer className="w-3.5 h-3.5" />
                <span>Today: <strong className="text-white">{todayTotalHours.toFixed(1)}h</strong></span>
              </button>

              <div className="h-3.5 w-px bg-[#1e293b]" />

              <span className="px-2 py-1 text-blue-400 flex items-center gap-1" title="This week's total logged hours">
                <Clock className="w-3 h-3 text-blue-400" />
                <span>Week: <strong className="text-white">{currentWeekTotalHours.toFixed(1)}h</strong></span>
              </span>

              <div className="h-3.5 w-px bg-[#1e293b] hidden md:block" />

              <span className="px-2 py-1 text-purple-400 hidden md:flex items-center gap-1" title="This month's total logged hours">
                <Calendar className="w-3 h-3 text-purple-400" />
                <span>Month: <strong className="text-white">{monthTotalHours.toFixed(1)}h</strong></span>
              </span>
            </div>

            {/* Outbox / Pending Syncs Button */}
            <button
              onClick={() => setIsOutboxModalOpen(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono transition ${
                pendingCount > 0
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
                  : 'bg-[#090d16] border-[#1e293b] text-slate-300 hover:border-slate-600'
              }`}
              title="View pending syncs & outbox"
            >
              <Send className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Outbox</span>
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-md bg-amber-500/30 text-amber-300 font-bold text-[10px]">
                  {pendingCount}
                </span>
              )}
            </button>

            {/* Manual Sync Button */}
            <button
              onClick={() => handleSync(true)}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#1e293b] bg-[#090d16] hover:border-blue-500/50 text-xs font-mono text-slate-300 transition"
              title="Sync now"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-400' : 'text-slate-400'}`} />
              <span className="hidden md:inline">Sync</span>
            </button>

            {/* Settings */}
            <button
              onClick={() => setActiveTab('settings')}
              className="p-1.5 rounded-xl border border-[#1e293b] bg-[#090d16] text-[#64748b] hover:text-white hover:border-slate-600 transition"
              title="Open Settings"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Expand to Full Tab */}
            <button
              onClick={() => {
                if (typeof chrome !== 'undefined' && chrome.tabs && chrome.runtime?.getURL) {
                  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
                  try { window.close(); } catch(e) {}
                } else {
                  window.open(window.location.href, '_blank');
                }
              }}
              className="p-1.5 rounded-xl border border-[#1e293b] bg-[#090d16] text-[#64748b] hover:text-white hover:border-slate-600 transition"
              title="Expand to Full Tab"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* ===================================================================== */}
        {/* TAB 1: WORK PACKAGES / TICKETS (High Density Split View) */}
        {/* ===================================================================== */}
        {activeTab === 'tickets' && (
          <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Top Bento KPI Summary Cards */}
            <div className="px-3 sm:px-6 py-2 sm:py-3.5 bg-[#0a0f1d] border-b border-[#1e293b] grid grid-cols-3 gap-2 sm:gap-3 shrink-0">
              <div className="bg-[#0f172a] p-2 sm:p-3 rounded-xl border border-[#1e293b] flex flex-col justify-between hover:border-emerald-500/30 transition text-center sm:text-left">
                <span className="text-[10px] sm:text-[11px] font-mono text-emerald-400 uppercase tracking-wide">Today</span>
                <div className="flex items-baseline justify-center sm:justify-start gap-1 sm:gap-2 mt-0.5 sm:mt-1">
                  <span className="text-base sm:text-xl font-bold text-emerald-400 font-mono">{todayTotalHours.toFixed(1)}h</span>
                  <span className="text-[10px] sm:text-[11px] text-[#64748b] hidden sm:inline">/ 8.0h</span>
                </div>
              </div>

              <div className="bg-[#0f172a] p-2 sm:p-3 rounded-xl border border-[#1e293b] flex flex-col justify-between hover:border-blue-500/30 transition text-center sm:text-left">
                <span className="text-[10px] sm:text-[11px] font-mono text-blue-400 uppercase tracking-wide">Week</span>
                <div className="flex items-baseline justify-center sm:justify-start gap-1 sm:gap-2 mt-0.5 sm:mt-1">
                  <span className="text-base sm:text-xl font-bold text-blue-400 font-mono">{currentWeekTotalHours.toFixed(1)}h</span>
                  <span className="text-[10px] sm:text-[11px] text-[#64748b] hidden sm:inline">/ 40.0h</span>
                </div>
              </div>

              <div className="bg-[#0f172a] p-2 sm:p-3 rounded-xl border border-[#1e293b] flex flex-col justify-between hover:border-purple-500/30 transition text-center sm:text-left">
                <span className="text-[10px] sm:text-[11px] font-mono text-purple-400 uppercase tracking-wide">Month</span>
                <div className="flex items-baseline justify-center sm:justify-start gap-1 sm:gap-2 mt-0.5 sm:mt-1">
                  <span className="text-base sm:text-xl font-bold text-purple-400 font-mono">{monthTotalHours.toFixed(1)}h</span>
                  <span className="text-[10px] sm:text-[11px] text-[#64748b] hidden sm:inline">/ 160h</span>
                </div>
              </div>
            </div>

            {/* Filter & Sorting Toolbar */}
            <div className="px-3 sm:px-6 py-2 bg-[#0d1322] border-b border-[#1e293b] flex flex-wrap items-center justify-between gap-2 shrink-0 relative z-30">
              {/* Left filter pill group */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                {/* Category toggle */}
                <div className="flex items-center bg-[#090d16] border border-[#1e293b] rounded-lg p-0.5 text-xs">
                  <button
                    onClick={() => setFilterStatusCategory('open')}
                    className={`px-2.5 py-1 rounded-md font-medium transition ${filterStatusCategory === 'open' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    Open
                  </button>
                  <button
                    onClick={() => setFilterStatusCategory('closed')}
                    className={`px-2.5 py-1 rounded-md font-medium transition ${filterStatusCategory === 'closed' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    Closed
                  </button>
                  <button
                    onClick={() => setFilterStatusCategory('all')}
                    className={`px-2.5 py-1 rounded-md font-medium transition ${filterStatusCategory === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    All
                  </button>
                </div>

                {/* Project MultiSelect */}
                <MultiSelect
                  label="Project"
                  options={allProjectOptions}
                  selected={filterProjects}
                  onChange={setFilterProjects}
                  placeholder="All Projects"
                />

                {/* Status MultiSelect */}
                <MultiSelect
                  label="Status"
                  options={allStatusOptions}
                  selected={filterStatuses}
                  onChange={setFilterStatuses}
                  placeholder="All Statuses"
                />

                {/* Type MultiSelect */}
                <MultiSelect
                  label="Type"
                  options={allTypeOptions}
                  selected={effectiveFilterTypes}
                  onChange={(vals) => {
                    if (setFilterTypes) setFilterTypes(vals);
                    else if (setFilterType) setFilterType(vals[0] || '');
                  }}
                  placeholder="All Types"
                />

                {/* Assignee MultiSelect */}
                <MultiSelect
                  label="Assignee"
                  options={allAssigneeOptions}
                  selected={effectiveFilterAssignees}
                  onChange={(vals) => {
                    if (setFilterAssignees) setFilterAssignees(vals);
                    else if (setFilterAssignee) setFilterAssignee(vals[0] || '');
                  }}
                  placeholder="All Assignees"
                />

                {/* Priority MultiSelect */}
                <MultiSelect
                  label="Priority"
                  options={allPriorityOptions}
                  selected={effectiveFilterPriorities}
                  onChange={(vals) => {
                    if (setFilterPriorities) setFilterPriorities(vals);
                    else if (setFilterPriority) setFilterPriority(vals[0] || '');
                  }}
                  placeholder="All Priorities"
                  align="right"
                />

                {/* Starred Filter Pill */}
                <button
                  type="button"
                  onClick={() => setFilterStarredOnly(prev => !prev)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition cursor-pointer ${
                    filterStarredOnly
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 font-bold'
                      : 'bg-[#090d16] border-[#1e293b] text-slate-300 hover:border-slate-600'
                  }`}
                  title={filterStarredOnly ? 'Showing starred only (click to clear)' : 'Filter starred tickets'}
                >
                  <Star className={`w-3.5 h-3.5 ${filterStarredOnly ? 'text-amber-400 fill-current' : 'text-slate-400'}`} />
                  <span>Starred ({starredTickets.length})</span>
                </button>

                {/* Clear Filters if active */}
                {activeFilterCount > 0 && (
                  <button
                    onClick={resetFilters}
                    className="text-xs text-rose-400 hover:text-rose-300 font-mono flex items-center gap-1 px-2 py-1 rounded hover:bg-rose-950/20 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                    Reset ({activeFilterCount})
                  </button>
                )}
              </div>

              {/* Right sorting dropdown */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-[#64748b]">Sort:</span>
                <div className="relative">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-[#090d16] border border-[#1e293b] text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:border-blue-500 focus:outline-none appearance-none pr-7 cursor-pointer"
                  >
                    <option value="updated_desc">Recently Updated</option>
                    <option value="updated_asc">Oldest Updated</option>
                    <option value="id_desc">ID (High → Low)</option>
                    <option value="id_asc">ID (Low → High)</option>
                    <option value="priority">Priority</option>
                  </select>
                  <ArrowUpDown className="w-3 h-3 text-[#64748b] absolute right-2 top-2.5 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Split View Content Workspace */}
            <div className="flex-1 flex min-h-0 overflow-hidden">
              {/* =============================================================== */}
              {/* LEFT: High-Density Work Package Table (100% on mobile, 58% on desktop) */}
              {/* =============================================================== */}
              <div className={`flex-1 flex flex-col border-r border-[#1e293b] min-w-0 bg-[#090d16] ${selectedTicketId ? (isInspectorFullView ? 'hidden' : 'hidden lg:flex') : 'flex'}`}>
                <div className="flex-1 overflow-auto">
                  <table className="hidden md:table w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-[#0d1322] z-10 border-b border-[#1e293b] text-[11px] font-mono text-[#64748b] uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">⭐</th>
                        <th className="py-2.5 px-3 w-20">ID</th>
                        <th className="py-2.5 px-3">Subject & Type</th>
                        <th className="py-2.5 px-3 w-28">Project</th>
                        <th className="py-2.5 px-3 w-28">Status</th>
                        <th className="py-2.5 px-3 w-24">Priority</th>
                        <th className="py-2.5 px-3 w-28">Assignee</th>
                        <th className="py-2.5 px-3 w-20 text-right">Hours</th>
                        <th className="py-2.5 px-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e293b]/70 text-xs">
                      {filteredTickets.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-12 text-center text-[#64748b]">
                            <FolderKanban className="w-8 h-8 mx-auto mb-2 opacity-40 text-blue-400" />
                            <p className="text-sm font-medium text-slate-400">No work packages match your filter criteria.</p>
                            <p className="text-xs font-mono mt-1">Try resetting filters or searching a different term.</p>
                          </td>
                        </tr>
                      ) : (
                        filteredTickets.map(ticket => {
                          const isSelected = selectedTicketId === ticket.id;
                          const spentNum = parseDurationToHours(ticket.spentTime);
                          const estNum = parseDurationToHours(ticket.estimatedTime);
                          const assigneeInitials = (ticket.assignee || 'U')
                            .split(' ')
                            .map(w => w[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase();

                          return (
                            <tr
                              key={ticket.id}
                              onClick={() => selectRootTicket(ticket.id)}
                              className={`cursor-pointer transition group select-text ${
                                isSelected
                                  ? 'bg-blue-600/15 border-l-4 border-l-blue-500'
                                  : 'hover:bg-[#131b2e]'
                              }`}
                            >
                              {/* Star column */}
                              <td className="py-2.5 px-3 text-center" onClick={(e) => handleToggleStar(e, ticket.id)}>
                                <Star
                                  className={`w-4 h-4 mx-auto transition ${
                                    ticket.starred ? 'text-amber-400 fill-current' : 'text-[#334155] group-hover:text-slate-400'
                                  }`}
                                />
                              </td>

                              {/* Ticket ID */}
                              <td className="py-2.5 px-3 font-mono font-bold text-blue-400 whitespace-nowrap">
                                #{ticket.id}
                              </td>

                              {/* Subject & Type */}
                              <td className="py-2.5 px-3 min-w-[200px] max-w-[340px]">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-[#1e293b] text-[#94a3b8] shrink-0">
                                    {ticket.type}
                                  </span>
                                  <span className="truncate font-medium text-slate-200 group-hover:text-white" title={ticket.subject}>
                                    {ticket.subject}
                                  </span>
                                </div>
                              </td>

                              {/* Project */}
                              <td className="py-2.5 px-3 text-[#94a3b8] truncate max-w-[120px]" title={ticket.project}>
                                {ticket.project}
                              </td>

                              {/* Status Badge */}
                              <td className="py-2.5 px-3">
                                <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold uppercase border ${getStatusBadgeClass(ticket.status)}`}>
                                  {ticket.status}
                                </span>
                              </td>

                              {/* Priority */}
                              <td className="py-2.5 px-3">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono border ${getPriorityBadgeClass(ticket.priority)}`}>
                                  {ticket.priority || 'Normal'}
                                </span>
                              </td>

                              {/* Assignee */}
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-1.5 truncate">
                                  <div className="w-5 h-5 rounded-full bg-blue-600/20 text-blue-400 font-mono text-[9px] font-bold flex items-center justify-center shrink-0">
                                    {assigneeInitials}
                                  </div>
                                  <span className="truncate text-slate-300 text-[11px]" title={ticket.assignee}>
                                    {ticket.assignee}
                                  </span>
                                </div>
                              </td>

                              {/* Spent / Est Hours */}
                              <td className="py-2.5 px-3 text-right font-mono text-[11px] text-[#94a3b8] whitespace-nowrap">
                                <span className={spentNum > 0 ? 'text-emerald-400 font-bold' : ''}>
                                  {spentNum.toFixed(1)}h
                                </span>
                                {estNum > 0 && <span className="text-[#64748b]"> / {estNum.toFixed(1)}h</span>}
                              </td>

                              {/* External link action */}
                              <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => openInFullScreenAndClose(`${opUrl.replace(/\/+$/, '')}/work_packages/${ticket.id}`)}
                                  className="text-[#64748b] hover:text-blue-400 transition p-1"
                                  title="Open in OpenProject tab"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>

                  {/* Mobile Card List (md:hidden) */}
                  <div className="md:hidden divide-y divide-[#1e293b] pb-24">
                    {filteredTickets.length === 0 ? (
                      <div className="p-8 text-center text-[#64748b]">
                        <div className="w-12 h-12 rounded-xl bg-[#1e293b]/40 flex items-center justify-center mx-auto mb-3 text-[#94a3b8]">
                          <Search className="w-6 h-6" />
                        </div>
                        <p className="text-sm font-semibold text-slate-300">No work packages found</p>
                        <p className="text-xs text-[#64748b] mt-1">Try clearing filters or search terms</p>
                      </div>
                    ) : (
                      filteredTickets.map((ticket) => {
                        const isSelected = ticket.id === selectedTicketId;
                        const isUrgent = ticket.priority?.toLowerCase() === 'high' || ticket.priority?.toLowerCase() === 'urgent';
                        const spentNum = parseDurationToHours(ticket.spentTime);
                        return (
                          <div
                            key={ticket.id}
                            onClick={() => selectRootTicket(ticket.id)}
                            className={`p-3.5 flex flex-col gap-2 transition cursor-pointer active:bg-blue-600/10 ${
                              isSelected ? 'bg-blue-600/15 border-l-4 border-blue-500' : 'hover:bg-[#0f172a]'
                            }`}
                          >
                            {/* Top row: Star, ID, Type, Status, Spent, Open OP */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <button
                                  type="button"
                                  onClick={(e) => handleToggleStar(e, ticket.id)}
                                  className="p-1 -m-1 text-[#64748b] hover:text-amber-400 transition"
                                  title={ticket.starred ? "Starred task (Click to unstar)" : "Star task"}
                                >
                                  <Star
                                    className={`w-4 h-4 ${
                                      ticket.starred ? 'text-amber-400 fill-amber-400' : 'opacity-40 hover:opacity-100'
                                    }`}
                                  />
                                </button>
                                <span className="font-mono text-xs font-bold text-blue-400">#{ticket.id}</span>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1e293b] text-[#94a3b8] truncate max-w-[80px]">
                                  {ticket.type}
                                </span>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 truncate max-w-[90px]">
                                  {ticket.status}
                                </span>
                                {isUrgent && (
                                  <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold">
                                    🔥
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {spentNum > 0 && (
                                  <span className="font-mono text-xs font-bold text-emerald-400">
                                    {spentNum.toFixed(1)}h
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openInFullScreenAndClose(`${opUrl.replace(/\/+$/, '')}/work_packages/${ticket.id}`);
                                  }}
                                  className="p-1 text-[#64748b] hover:text-white"
                                  title="Open in OpenProject"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Subject */}
                            <p className="text-xs font-semibold text-slate-100 leading-snug line-clamp-2">
                              {ticket.subject}
                            </p>

                            {/* Bottom row: Project & Assignee */}
                            <div className="flex items-center justify-between text-[11px] text-[#64748b] pt-0.5">
                              <span className="truncate max-w-[60%] font-mono text-slate-400">
                                {ticket.project || 'No Project'}
                              </span>
                              <span className="truncate max-w-[38%] text-slate-400 text-right">
                                {ticket.assignee || 'Unassigned'}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Table Footer Summary */}
                <div className="h-9 px-4 sm:px-6 bg-[#0d1322] border-t border-[#1e293b] flex items-center justify-between text-xs text-[#64748b] font-mono shrink-0">
                  <span>Showing {filteredTickets.length} of {tickets.length} work packages</span>
                  <span className="hidden sm:inline">Click any row to view & edit details</span>
                </div>
              </div>

              {/* =============================================================== */}
              {/* RIGHT: Live Work Package Detail Inspector (Responsive / Resizable Pane) */}
              {/* =============================================================== */}
              <div 
                style={isDesktop && !isInspectorFullView ? { width: `${inspectorWidth}px` } : undefined}
                className={`${selectedTicketId ? (isDesktop ? 'flex h-full' : 'flex fixed inset-0 z-50 bg-[#090d16] h-[100dvh] w-full') : 'hidden lg:flex'} flex-1 lg:flex-none bg-[#0c1220] flex-col h-full overflow-hidden border-l border-[#1e293b] relative select-text ${isDesktop && !isInspectorFullView ? 'max-w-[85vw]' : 'w-full'}`}
              >
                {/* Inspector Horizontal Resize Handle (Desktop side-by-side mode only) */}
                {isDesktop && !isInspectorFullView && (
                  <div
                    onMouseDown={handleInspectorResizeStart}
                    onDoubleClick={() => setInspectorWidth(520)}
                    className="hidden lg:flex absolute top-0 left-0 w-1.5 h-full cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500 transition-colors z-30 group items-center justify-center select-none"
                    title="Drag to resize details pane width (Double-click to reset)"
                  >
                    <div className="w-[1.5px] h-8 bg-slate-600 group-hover:bg-blue-400 group-hover:h-12 transition-all rounded-full" />
                  </div>
                )}
                {!selectedTicket ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#64748b]">
                    <div className="w-16 h-16 rounded-2xl bg-[#1e293b]/40 flex items-center justify-center mb-4 text-[#94a3b8]">
                      <FileText className="w-8 h-8" />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-300 mb-1">
                      {selectedTicketId ? `Loading Ticket #${selectedTicketId}...` : 'No Work Package Selected'}
                    </h3>
                    <p className="text-xs max-w-xs text-[#64748b]">
                      {selectedTicketId 
                        ? 'Fetching ticket details from OpenProject...'
                        : 'Select any work package to preview details, log effort, and edit comments.'
                      }
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
                    {/* Inspector Header */}
                    <div className="p-4 border-b border-[#1e293b] bg-[#0d1322] shrink-0">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                          {/* Back button with navigation history */}
                          <button
                            type="button"
                            onClick={handleBackNavigation}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 active:bg-blue-500/30 border border-blue-500/30 rounded-lg transition"
                            title={ticketHistory.length > 0 ? `Back to #${ticketHistory[ticketHistory.length - 1]}` : (isDesktop ? "Back to Table" : "Back to Work Packages")}
                          >
                            <ChevronLeft className="w-4 h-4" />
                            <span>{ticketHistory.length > 0 ? `#${ticketHistory[ticketHistory.length - 1]}` : (isDesktop && isInspectorFullView ? "Back to Table" : "Back")}</span>
                          </button>

                          {/* Breadcrumbs for deep navigation */}
                          {ticketHistory.length > 0 && (
                            <div className="hidden sm:flex items-center gap-1 text-[11px] font-mono text-slate-400 overflow-x-auto no-scrollbar py-0.5">
                              {ticketHistory.map((histId, idx) => (
                                <React.Fragment key={histId}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextHist = ticketHistory.slice(0, idx);
                                      setTicketHistory(nextHist);
                                      setSelectedTicketId(histId);
                                    }}
                                    className="hover:text-blue-400 hover:underline text-slate-400 transition"
                                  >
                                    #{histId}
                                  </button>
                                  <span className="text-slate-600">/</span>
                                </React.Fragment>
                              ))}
                            </div>
                          )}

                          <span className="font-mono text-xs font-bold text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded-lg border border-blue-500/20">
                            #{selectedTicket.id}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1e293b] text-[#94a3b8]">
                            {selectedTicket.type}
                          </span>
                          {selectedTicket.pendingSync && (
                            <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                              PENDING SYNC
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Desktop Full View Toggle Button */}
                          <button
                            type="button"
                            onClick={toggleInspectorFullView}
                            className="hidden lg:flex p-1.5 rounded-lg border border-[#1e293b] bg-[#090d16] text-[#94a3b8] hover:text-white hover:border-slate-600 transition"
                            title={isInspectorFullView ? "Exit Full View (Side-by-side mode)" : "Expand to Full View"}
                          >
                            {isInspectorFullView ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                          </button>

                          <button
                            onClick={handleCopyLink}
                            className="p-1.5 rounded-lg border border-[#1e293b] bg-[#090d16] text-[#94a3b8] hover:text-white hover:border-slate-600 transition"
                            title={copiedId ? 'Copied URL!' : 'Copy ticket link'}
                          >
                            {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>

                          <button
                            type="button"
                            onClick={() => openInFullScreenAndClose(`${opUrl.replace(/\/+$/, '')}/work_packages/${selectedTicket.id}`)}
                            className="p-1.5 rounded-lg border border-[#1e293b] bg-[#090d16] text-[#94a3b8] hover:text-blue-400 hover:border-blue-500/40 transition"
                            title="Open in OpenProject tab"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={(e) => handleToggleStar(e, selectedTicket.id)}
                            className="p-1.5 rounded-lg border border-[#1e293b] bg-[#090d16] hover:border-amber-500/50 text-[#94a3b8] hover:text-amber-400 transition"
                            title={selectedTicket.starred ? 'Starred' : 'Star for daily access'}
                          >
                            <Star className={`w-3.5 h-3.5 ${selectedTicket.starred ? 'text-amber-400 fill-current' : ''}`} />
                          </button>

                          <button
                            onClick={handleCloseInspector}
                            className="p-1.5 rounded-lg border border-[#1e293b] bg-[#090d16] text-[#64748b] hover:text-white hover:border-slate-600 transition"
                            title="Close ticket view"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Ticket Subject Title */}
                      <h2 className="text-sm font-bold text-white leading-snug">
                        {selectedTicket.subject}
                      </h2>
                      <p className="text-[11px] text-[#64748b] font-mono mt-0.5 truncate">
                        Project: <span className="text-slate-300">{selectedTicket.project}</span>
                      </p>
                    </div>

                    {/* Quick Metadata Bar (Status, Assignee) */}
                    <div className="p-3 bg-[#0a0f1d] border-b border-[#1e293b] grid grid-cols-2 gap-2 text-xs shrink-0">
                      {/* Interactive Status Selector */}
                      <div>
                        <span className="text-[10px] font-mono text-[#64748b] block mb-1">Status</span>
                        <select
                          value={selectedTicket.statusId || ''}
                          onChange={(e) => {
                            const newStatusId = e.target.value;
                            const statusObj = statuses.find(s => s.id === newStatusId);
                            handleUpdateStatus(selectedTicket, newStatusId, statusObj?.name || 'New Status');
                          }}
                          className="w-full bg-[#090d16] border border-[#1e293b] rounded-lg px-2 py-1 text-xs text-slate-200 focus:border-blue-500 focus:outline-none cursor-pointer"
                        >
                          {statuses.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Interactive Assignee Selector */}
                      <div>
                        <span className="text-[10px] font-mono text-[#64748b] block mb-1">Assignee</span>
                        <select
                          value={selectedTicket.assigneeId || ''}
                          onChange={(e) => {
                            const newId = e.target.value;
                            const member = selectedTicketAssignees.find(m => m.id === newId);
                            handleUpdateAssignee(selectedTicket, newId, member?.name || 'Unassigned');
                          }}
                          className="w-full bg-[#090d16] border border-[#1e293b] rounded-lg px-2 py-1 text-xs text-slate-200 focus:border-blue-500 focus:outline-none cursor-pointer"
                        >
                          <option value="">Unassigned</option>
                          {selectedTicketAssignees.map(u => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Effort Progress Pill */}
                    <div className="px-4 py-2.5 bg-[#090d16] border-b border-[#1e293b] flex items-center justify-between text-xs font-mono shrink-0">
                      <div className="flex items-center gap-3">
                        <span className="text-[#64748b]">Spent: <strong className="text-emerald-400 font-bold">{selectedTicketStats.spentHours.toFixed(1)}h</strong></span>
                        {selectedTicketStats.estimatedHours > 0 && (
                          <span className="text-[#64748b]">Est: <strong className="text-slate-300">{selectedTicketStats.estimatedHours.toFixed(1)}h</strong></span>
                        )}
                        <span className="text-[#64748b]">Mine: <strong className="text-blue-400">{selectedTicketStats.mySpentHours.toFixed(1)}h</strong></span>
                      </div>
                      {selectedTicketStats.percent !== null && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          {selectedTicketStats.percent}% logged
                        </span>
                      )}
                    </div>

                    {/* Inspector Tab Switcher */}
                    <div className="flex border-b border-[#1e293b] bg-[#0d1322] shrink-0 text-xs font-mono">
                      <button
                        onClick={() => setInspectorTab('details')}
                        className={`flex-1 py-2 text-center transition border-b-2 ${
                          inspectorTab === 'details'
                            ? 'border-blue-500 text-blue-400 font-bold bg-[#090d16]/50'
                            : 'border-transparent text-[#64748b] hover:text-slate-300'
                        }`}
                      >
                        Description
                      </button>
                      <button
                        onClick={() => setInspectorTab('efforts')}
                        className={`flex-1 py-2 text-center transition border-b-2 ${
                          inspectorTab === 'efforts'
                            ? 'border-blue-500 text-blue-400 font-bold bg-[#090d16]/50'
                            : 'border-transparent text-[#64748b] hover:text-slate-300'
                        }`}
                      >
                        Time Logs ({ticketEffortsList.length})
                      </button>
                      <button
                        onClick={() => setInspectorTab('comments')}
                        className={`flex-1 py-2 text-center transition border-b-2 ${
                          inspectorTab === 'comments'
                            ? 'border-blue-500 text-blue-400 font-bold bg-[#090d16]/50'
                            : 'border-transparent text-[#64748b] hover:text-slate-300'
                        }`}
                      >
                        Activity ({ticketActivities?.length || 0})
                      </button>
                    </div>

                    {/* Inspector Scrollable Body */}
                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                      {inspectorTab === 'overview' && (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-7xl mx-auto">
                          <div className="lg:col-span-7 space-y-5">
                            {renderDescriptionSection()}
                            {renderEffortsSection()}
                          </div>
                          <div className="lg:col-span-5 space-y-5">
                            {renderCommentsSection()}
                          </div>
                        </div>
                      )}

                      {inspectorTab === 'details' && (
                        <div className={isInspectorFullView ? "max-w-4xl mx-auto" : ""}>
                          {renderDescriptionSection()}
                        </div>
                      )}

                      {inspectorTab === 'efforts' && (
                        <div className={isInspectorFullView ? "max-w-4xl mx-auto" : ""}>
                          {renderEffortsSection()}
                        </div>
                      )}

                      {inspectorTab === 'comments' && (
                        <div className={isInspectorFullView ? "max-w-4xl mx-auto" : ""}>
                          {renderCommentsSection()}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </main>
        )}

        {/* ===================================================================== */}
        {/* TAB 2: EFFORTS & TIME TRACKER (Desktop 5-Day Grid & Filterable Table) */}
        {/* ===================================================================== */}
        {activeTab === 'efforts' && (
          <main className="flex-1 flex flex-col min-h-0 overflow-y-auto p-6 bg-[#090d16] space-y-6">
            {/* Week navigation & KPI Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-[#0d1322] border border-[#1e293b] p-4 rounded-2xl">
              <div>
                <span className="text-[10px] font-mono text-[#64748b] uppercase tracking-wider block">Time Tracking</span>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>Week of {weekDays[0]?.label} – {weekDays[weekDays.length - 1]?.label}</span>
                  {weekOffset === 0 && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 font-semibold border border-blue-500/30">
                      CURRENT WEEK
                    </span>
                  )}
                </h2>
              </div>

              {/* Week Switchers */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setWeekOffset(prev => prev - 1)}
                  className="px-3 py-1.5 rounded-xl border border-[#1e293b] bg-[#090d16] hover:border-slate-600 text-xs font-mono text-slate-300 flex items-center gap-1 transition"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Prev Week
                </button>
                {weekOffset !== 0 && (
                  <button
                    onClick={() => setWeekOffset(0)}
                    className="px-3 py-1.5 rounded-xl border border-blue-500/40 bg-blue-600/15 text-blue-300 text-xs font-mono font-semibold transition"
                  >
                    This Week
                  </button>
                )}
                <button
                  onClick={() => setWeekOffset(prev => prev + 1)}
                  className="px-3 py-1.5 rounded-xl border border-[#1e293b] bg-[#090d16] hover:border-slate-600 text-xs font-mono text-slate-300 flex items-center gap-1 transition"
                >
                  Next Week
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => setIsAddEffortModalOpen(true)}
                  className="ml-2 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-lg shadow-emerald-600/20"
                >
                  <Plus className="w-4 h-4" />
                  Log Effort
                </button>
              </div>
            </div>

            {/* KPI Summary strip for Today, This Week, and This Month */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-[#0d1322] border border-[#1e293b] p-3.5 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono text-emerald-400 uppercase tracking-wide">{activeDayCardTitle}</span>
                  <div className="text-2xl font-bold text-white font-mono mt-0.5">
                    {activeDayHours.toFixed(1)}h <span className="text-xs text-[#64748b] font-normal font-sans">/ 8.0h target</span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Timer className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-[#0d1322] border border-[#1e293b] p-3.5 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono text-blue-400 uppercase tracking-wide">{activeWeekCardTitle}</span>
                  <div className="text-2xl font-bold text-white font-mono mt-0.5">
                    {weeklyTotalHours.toFixed(1)}h <span className="text-xs text-[#64748b] font-normal font-sans">/ 40.0h week</span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <Clock className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-[#0d1322] border border-[#1e293b] p-3.5 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono text-purple-400 uppercase tracking-wide">{activeMonthCardTitle}</span>
                  <div className="text-2xl font-bold text-white font-mono mt-0.5">
                    {activeMonthTotalHours.toFixed(1)}h <span className="text-xs text-[#64748b] font-normal font-sans">/ 160h month</span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <Calendar className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* 5-Day Work Week Grid (Interactive cards for Mon - Fri) */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              {weekDays.map(day => {
                const dayHours = hoursPerDateMap[day.dateStr] || 0;
                const isSelected = selectedEffortDate === day.dateStr;
                const isGoalMet = dayHours >= 8.0;

                return (
                  <button
                    key={day.dateStr}
                    onClick={() => setSelectedEffortDate(day.dateStr)}
                    className={`p-4 rounded-2xl border text-left transition flex flex-col justify-between ${
                      isSelected
                        ? 'bg-blue-600/15 border-blue-500 shadow-lg shadow-blue-500/10'
                        : 'bg-[#0d1322] border-[#1e293b] hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-slate-200">{day.dayName}</span>
                      {day.isToday && (
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 font-bold border border-blue-500/30">
                          TODAY
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-[#64748b] mt-0.5">{day.label}</span>

                    <div className="mt-4">
                      <div className="flex items-baseline justify-between mb-1">
                        <span className={`text-xl font-bold font-mono ${dayHours > 0 ? (isGoalMet ? 'text-emerald-400' : 'text-blue-400') : 'text-[#64748b]'}`}>
                          {dayHours.toFixed(1)}h
                        </span>
                        <span className="text-[10px] text-[#64748b] font-mono">/ 8h</span>
                      </div>
                      <div className="w-full h-1.5 bg-[#090d16] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${isGoalMet ? 'bg-emerald-400' : 'bg-blue-500'}`}
                          style={{ width: `${Math.min(100, (dayHours / 8) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Effort History Table with Search */}
            <div className="bg-[#0d1322] border border-[#1e293b] rounded-2xl overflow-hidden flex flex-col">
              <div className="p-4 border-b border-[#1e293b] flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {searchedEfforts ? `Search Results (${searchedEfforts.length})` : `Efforts Logged on ${selectedEffortDate}`}
                  </h3>
                  <span className="text-[11px] text-[#64748b] font-mono">
                    Total: {((searchedEfforts || effortsForSelectedDate).reduce((s, e) => s + e.hours, 0)).toFixed(2)}h
                  </span>
                </div>

                <div className="relative w-64">
                  <Search className="w-3.5 h-3.5 text-[#64748b] absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search all efforts..."
                    value={effortSearchQuery}
                    onChange={(e) => setEffortSearchQuery(e.target.value)}
                    className="w-full bg-[#090d16] border border-[#1e293b] rounded-xl pl-8 pr-8 py-1.5 text-xs text-slate-200 placeholder-[#64748b] focus:border-blue-500 focus:outline-none"
                  />
                  {effortSearchQuery && (
                    <button
                      onClick={() => setEffortSearchQuery('')}
                      className="absolute right-2.5 top-2 text-[#64748b] hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-[#0a0f1d] border-b border-[#1e293b] text-[11px] font-mono text-[#64748b] uppercase">
                    <tr>
                      <th className="py-2.5 px-4 w-28">Date</th>
                      <th className="py-2.5 px-4 w-24">Ticket</th>
                      <th className="py-2.5 px-4">Subject</th>
                      <th className="py-2.5 px-4 w-24 text-right">Hours</th>
                      <th className="py-2.5 px-4">Comment</th>
                      <th className="py-2.5 px-4 w-24">Status</th>
                      <th className="py-2.5 px-4 w-20 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e293b]/70">
                    {(searchedEfforts || effortsForSelectedDate).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-[#64748b]">
                          No effort entries found for this selection.
                        </td>
                      </tr>
                    ) : (
                      (searchedEfforts || effortsForSelectedDate).map(entry => (
                        <tr key={entry.id} className="hover:bg-[#131b2e] transition">
                          <td className="py-2.5 px-4 font-mono text-[#94a3b8]">{entry.spentOn}</td>
                          <td className="py-2.5 px-4 font-mono font-bold text-blue-400">
                            <button
                              onClick={() => {
                                setSelectedTicketId(entry.workPackageId);
                                setActiveTab('tickets');
                              }}
                              className="hover:underline"
                            >
                              #{entry.workPackageId}
                            </button>
                          </td>
                          <td className="py-2.5 px-4 text-slate-200 truncate max-w-xs" title={entry.ticketSubject}>
                            {entry.ticketSubject || '–'}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-400">
                            {entry.hours.toFixed(2)}h
                          </td>
                          <td className="py-2.5 px-4 text-[#94a3b8] truncate max-w-sm" title={entry.comment}>
                            {entry.comment || '–'}
                          </td>
                          <td className="py-2.5 px-4">
                            {entry.pendingSync ? (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                Pending
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                Synced
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleEditEffort(entry)}
                                className="p-1 text-[#64748b] hover:text-blue-400 transition"
                                title="Edit entry"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteEffort({ id: entry.id, hours: entry.hours, spentOn: entry.spentOn })}
                                className="p-1 text-[#64748b] hover:text-rose-400 transition"
                                title="Delete entry"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tracked Tickets Overview (Requirement 8) */}
            <div className="bg-[#0d1322] border border-[#1e293b] rounded-2xl overflow-hidden flex flex-col">
              <div className="p-4 border-b border-[#1e293b] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-400" />
                    <span>Tracked Work Packages ({trackedTicketsSummary.length})</span>
                  </h3>
                  <span className="text-[11px] text-[#64748b] font-mono">
                    All tickets with recorded time entries
                  </span>
                </div>
                <button
                  onClick={() => setIsAddEffortModalOpen(true)}
                  className="px-3 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-mono font-medium flex items-center gap-1.5 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Log Time</span>
                </button>
              </div>

              {trackedTicketsSummary.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#64748b] font-mono">
                  No tracked work packages yet. Log time to start tracking tickets here.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
                  {trackedTicketsSummary.map(item => (
                    <div
                      key={item.id}
                      className="p-3 bg-[#090d16] border border-[#1e293b] rounded-xl hover:border-blue-500/30 transition flex flex-col justify-between space-y-2 group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                            #{item.id}
                          </span>
                          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                            {item.totalHours.toFixed(1)}h logged
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => openInFullScreenAndClose(`${opUrl.replace(/\/+$/, '')}/work_packages/${item.id}`)}
                          className="p-1 text-[#64748b] hover:text-white opacity-60 group-hover:opacity-100 transition"
                          title="Open in OpenProject tab"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-xs font-medium text-slate-200 line-clamp-2">
                        {item.subject}
                      </p>
                      <div className="flex items-center justify-between pt-1 border-t border-[#1e293b]/50 text-[10px] font-mono text-[#64748b]">
                        <span className="truncate max-w-[140px]">{item.project}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTicketId(item.id);
                            setActiveTab('tickets');
                          }}
                          className="text-blue-400 hover:underline flex items-center gap-0.5"
                        >
                          <span>View Details</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </main>
        )}

        {/* ===================================================================== */}
        {/* TAB 3: GOOGLE SHEET DUAL-SYNC (Desktop Control Center) */}
        {/* ===================================================================== */}
        {activeTab === 'sheet' && (
          <main className="flex-1 flex flex-col min-h-0 overflow-y-auto p-6 bg-[#090d16] space-y-6 max-w-4xl">
            <div>
              <span className="text-[10px] font-mono text-[#64748b] uppercase tracking-wider block">Database & Backup</span>
              <h2 className="text-xl font-bold text-white">Google Sheet Dual-Sync Center</h2>
              <p className="text-xs text-[#94a3b8] mt-1">
                Synchronize your local work packages and logged time entries with your personal Google Sheet spreadsheet via Google Apps Script web app.
              </p>
            </div>

            {/* Sync Status Card */}
            <div className="p-5 bg-[#0d1322] border border-[#1e293b] rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">Current Sheet Connection</h3>
                  <p className="text-xs font-mono text-[#64748b] mt-0.5">
                    {opSheetUrl ? opSheetUrl : 'No Google Sheet Web App URL connected yet.'}
                  </p>
                </div>
                {sheetLastSyncTime && (
                  <span className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-[#090d16] text-slate-300 border border-[#1e293b]">
                    Last synced: {sheetLastSyncTime}
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleSyncWithSheet}
                  disabled={isSyncingSheet || !opSheetUrl}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50"
                >
                  <UploadCloud className={`w-4 h-4 ${isSyncingSheet ? 'animate-spin' : ''}`} />
                  <span>{isSyncingSheet ? 'Pushing to Sheet...' : 'Push Local DB to Sheet'}</span>
                </button>

                <button
                  onClick={handleRestoreFromSheet}
                  disabled={isRestoringSheet || !opSheetUrl}
                  className="px-4 py-2 rounded-xl border border-[#1e293b] bg-[#090d16] hover:border-slate-600 text-slate-200 text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50"
                >
                  <DownloadCloud className={`w-4 h-4 ${isRestoringSheet ? 'animate-spin' : ''}`} />
                  <span>{isRestoringSheet ? 'Restoring from Sheet...' : 'Restore DB from Sheet'}</span>
                </button>

                <button
                  onClick={() => setActiveTab('settings')}
                  className="px-3 py-2 rounded-xl border border-[#1e293b] text-slate-400 hover:text-white text-xs font-mono transition"
                >
                  Configure URL
                </button>
              </div>
            </div>

            {/* Local Database Statistics Bento */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-[#0d1322] border border-[#1e293b] rounded-xl">
                <span className="text-xs font-mono text-[#64748b]">Total Cached Tickets</span>
                <p className="text-2xl font-bold font-mono text-white mt-1">{tickets.length}</p>
              </div>

              <div className="p-4 bg-[#0d1322] border border-[#1e293b] rounded-xl">
                <span className="text-xs font-mono text-[#64748b]">Logged Effort Records</span>
                <p className="text-2xl font-bold font-mono text-emerald-400 mt-1">{allEfforts.length}</p>
              </div>

              <div className="p-4 bg-[#0d1322] border border-[#1e293b] rounded-xl">
                <span className="text-xs font-mono text-[#64748b]">Saved Filter Views</span>
                <p className="text-2xl font-bold font-mono text-blue-400 mt-1">{savedViews.length}</p>
              </div>
            </div>
          </main>
        )}

        {/* ===================================================================== */}
        {/* TAB 4: SETTINGS & SERVER CONFIGURATION */}
        {/* ===================================================================== */}
        {activeTab === 'settings' && (
          <main className="flex-1 flex flex-col min-h-0 overflow-y-auto p-6 bg-[#090d16] space-y-6 max-w-3xl">
            <div>
              <span className="text-[10px] font-mono text-[#64748b] uppercase tracking-wider block">Configuration</span>
              <h2 className="text-xl font-bold text-white">Workspace & Server Settings</h2>
              <p className="text-xs text-[#94a3b8] mt-1">
                Configure your OpenProject instance URL, API token, and Google Sheet backup endpoint.
              </p>
            </div>

            {settingsNotice && (
              <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs font-mono flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>{settingsNotice}</span>
              </div>
            )}

            <form onSubmit={handleSettingsSaveSubmit} className="space-y-4">
              {/* OpenProject URL */}
              <div className="p-5 bg-[#0d1322] border border-[#1e293b] rounded-2xl space-y-4">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-blue-400" />
                  <span>OpenProject Connection</span>
                </h3>

                <div>
                  <label className="block text-xs font-mono text-[#94a3b8] mb-1">OpenProject Base URL</label>
                  <input
                    type="url"
                    value={formOpUrl}
                    onChange={e => setFormOpUrl(e.target.value)}
                    placeholder="https://ops.company.com"
                    className="w-full bg-[#090d16] border border-[#1e293b] rounded-xl px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-[#94a3b8] mb-1">API Key / Access Token</label>
                  <input
                    type="password"
                    value={formOpApiKey}
                    onChange={e => setFormOpApiKey(e.target.value)}
                    placeholder="Leave blank to keep existing key"
                    className="w-full bg-[#090d16] border border-[#1e293b] rounded-xl px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* Google Sheet URL */}
              <div className="p-5 bg-[#0d1322] border border-[#1e293b] rounded-2xl space-y-4">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <span>Google Sheet Backup</span>
                </h3>

                <div>
                  <label className="block text-xs font-mono text-[#94a3b8] mb-1">Google Apps Script Web App URL</label>
                  <input
                    type="url"
                    value={formOpSheetUrl}
                    onChange={e => setFormOpSheetUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="w-full bg-[#090d16] border border-[#1e293b] rounded-xl px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSavingFormSettings}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition disabled:opacity-50 shadow-lg shadow-blue-600/20"
                >
                  {isSavingFormSettings ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </main>
        )}
      </div>

      {/* ===================================================================== */}
      {/* PENDING SYNCS / OUTBOX MODAL (Resizable Window) */}
      {/* ===================================================================== */}
      {isOutboxModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div 
            style={outboxModalWindow.modalStyle}
            className="bg-[#0d1322] border border-[#1e293b] rounded-2xl w-full flex flex-col shadow-2xl overflow-hidden relative select-text"
          >
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-[#1e293b] flex items-center justify-between bg-[#0a0f1d] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">Pending Changes & Outbox</h3>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono text-xs font-semibold">
                      {syncQueue.length} item{syncQueue.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <p className="text-xs text-[#64748b] mt-0.5">
                    Review and manually sync or discard pending actions before sending to OpenProject
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={outboxModalWindow.toggleMaximize}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1e293b] transition"
                  title={outboxModalWindow.isMaximized ? "Restore window size" : "Maximize window"}
                >
                  {outboxModalWindow.isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setIsOutboxModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1e293b] transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Actions Bar if items exist */}
            {syncQueue.length > 0 && (
              <div className="px-5 py-2.5 bg-[#090d16] border-b border-[#1e293b] flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Click <strong>Send Now</strong> on any item to sync individually, or sync all:
                </span>
                <button
                  onClick={async () => {
                    await handleSync(true);
                  }}
                  disabled={isSyncing}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50 shadow-md shadow-blue-600/20"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>Sync All to Server ({syncQueue.length})</span>
                </button>
              </div>
            )}

            {/* Body / List */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1 min-h-[220px]">
              {syncQueue.length === 0 ? (
                <div className="h-56 flex flex-col items-center justify-center text-center p-6 text-slate-400">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-3">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <h4 className="text-sm font-bold text-white mb-1">Outbox is Clean!</h4>
                  <p className="text-xs text-[#64748b] max-w-sm">
                    All local changes have been successfully synced to your OpenProject server. Any offline updates will appear here.
                  </p>
                </div>
              ) : (
                syncQueue.map((item) => {
                  const isProcessing = processingItemId === item.id;
                  const ticket = item.payload.ticketId
                    ? tickets.find(t => String(t.id) === String(item.payload.ticketId))
                    : null;
                  const ticketSubject = ticket ? ticket.subject : null;

                  return (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl border border-[#1e293b] bg-[#0f172a] hover:border-slate-700 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      {/* Left: Item Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          {item.type === 'LOG_TIME' && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              LOG EFFORT
                            </span>
                          )}
                          {item.type === 'UPDATE_STATUS' && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                              STATUS UPDATE
                            </span>
                          )}
                          {item.type === 'UPDATE_ASSIGNEE' && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                              REASSIGN
                            </span>
                          )}
                          {item.type === 'UPDATE_TIME' && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                              EDIT EFFORT
                            </span>
                          )}
                          {item.type === 'DELETE_TIME' && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                              DELETE EFFORT
                            </span>
                          )}

                          <span className="text-[11px] text-[#64748b] font-mono">
                            {item.createdAt ? new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>

                        {/* Description */}
                        <div className="text-xs text-white">
                          {item.type === 'LOG_TIME' && (
                            <div>
                              <span className="font-semibold text-emerald-300">
                                Log {parseDurationToHours(item.payload.hours).toFixed(1)}h
                              </span>
                              {' on '}
                              <span className="font-mono text-blue-300">#{item.payload.ticketId}</span>
                              {ticketSubject && <span className="text-slate-300"> ({ticketSubject})</span>}
                              {' for '}
                              <span className="text-slate-400 font-mono">{item.payload.date}</span>
                              {item.payload.comment && (
                                <p className="text-[11px] text-slate-400 italic mt-0.5 truncate">
                                  "{item.payload.comment}"
                                </p>
                              )}
                            </div>
                          )}

                          {item.type === 'UPDATE_STATUS' && (
                            <div>
                              <span>Set status of </span>
                              <span className="font-mono text-blue-300">#{item.payload.ticketId}</span>
                              {ticketSubject && <span className="text-slate-300"> ({ticketSubject})</span>}
                              <span> to </span>
                              <strong className="text-blue-400">
                                {statuses.find(s => s.id === item.payload.statusId)?.name || `Status #${item.payload.statusId}`}
                              </strong>
                            </div>
                          )}

                          {item.type === 'UPDATE_ASSIGNEE' && (
                            <div>
                              <span>Reassign </span>
                              <span className="font-mono text-blue-300">#{item.payload.ticketId}</span>
                              {ticketSubject && <span className="text-slate-300"> ({ticketSubject})</span>}
                              <span> to user ID </span>
                              <strong className="text-indigo-400">
                                {item.payload.assigneeId}
                              </strong>
                            </div>
                          )}

                          {item.type === 'UPDATE_TIME' && (
                            <div>
                              <span>Edit effort entry </span>
                              <span className="font-mono text-cyan-300">#{item.payload.id}</span>
                              <span>: {parseDurationToHours(item.payload.hours).toFixed(1)}h</span>
                              {item.payload.comment && (
                                <p className="text-[11px] text-slate-400 italic mt-0.5 truncate">
                                  "{item.payload.comment}"
                                </p>
                              )}
                            </div>
                          )}

                          {item.type === 'DELETE_TIME' && (
                            <div>
                              <span>Delete effort entry </span>
                              <span className="font-mono text-rose-300">#{item.payload.id}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          onClick={async () => {
                            if (!handleProcessSingleSyncItem) return;
                            setProcessingItemId(item.id);
                            try {
                              await handleProcessSingleSyncItem(item);
                            } finally {
                              setProcessingItemId(null);
                            }
                          }}
                          disabled={isProcessing || isSyncing}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                          title="Send this item to OpenProject immediately"
                        >
                          <Send className={`w-3.5 h-3.5 ${isProcessing ? 'animate-pulse' : ''}`} />
                          <span>{isProcessing ? 'Sending...' : 'Send Now'}</span>
                        </button>

                        <button
                          onClick={async () => {
                            if (!handleDiscardSyncItem) return;
                            await handleDiscardSyncItem(item);
                          }}
                          disabled={isProcessing || isSyncing}
                          className="p-1.5 rounded-lg border border-[#1e293b] bg-[#090d16] text-slate-400 hover:text-rose-400 hover:border-rose-500/40 transition disabled:opacity-50"
                          title="Discard this pending change"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[#1e293b] bg-[#0a0f1d] flex items-center justify-between shrink-0">
              <span className="text-[11px] text-[#64748b]">
                Status: {isOnline ? 'Online (Connected)' : 'Offline (Local only)'}
              </span>
              <button
                onClick={() => setIsOutboxModalOpen(false)}
                className="px-4 py-1.5 rounded-xl border border-[#1e293b] bg-[#0d1322] hover:bg-[#1e293b] text-xs font-semibold text-slate-300 transition"
              >
                Close
              </button>
            </div>

            {/* Corner Resize Grip */}
            {!outboxModalWindow.isMaximized && (
              <div
                onMouseDown={outboxModalWindow.handleResizeStart}
                onDoubleClick={outboxModalWindow.resetSize}
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

      {/* Mobile Bottom Navigation Bar (md:hidden) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-[#0a0f1d] border-t border-[#1e293b] px-3 flex items-center justify-around z-30 shadow-2xl backdrop-blur-md">
        <button
          type="button"
          onClick={() => {
            setActiveTab('tickets');
            setSelectedTicketId(null);
          }}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-lg transition relative ${
            activeTab === 'tickets' && !selectedTicketId ? 'text-blue-400 font-semibold' : 'text-[#64748b] hover:text-slate-300'
          }`}
        >
          <FolderKanban className="w-4 h-4" />
          <span className="text-[10px] font-mono">Tickets</span>
          {tickets.length > 0 && (
            <span className="absolute -top-1 -right-1 px-1 rounded-full bg-blue-600/30 text-blue-300 text-[8px] font-mono font-bold">
              {tickets.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('efforts');
            setSelectedTicketId(null);
          }}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-lg transition ${
            activeTab === 'efforts' ? 'text-blue-400 font-semibold' : 'text-[#64748b] hover:text-slate-300'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span className="text-[10px] font-mono">Efforts</span>
        </button>

        {/* Center action: Quick Log Effort */}
        <button
          type="button"
          onClick={() => setIsAddEffortModalOpen(true)}
          className="flex items-center justify-center w-10 h-10 -mt-3 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40 border-2 border-[#0a0f1d] active:scale-95 transition"
          title="Log Time Effort"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
        </button>

        <button
          type="button"
          onClick={() => setIsOutboxModalOpen(true)}
          className="flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-lg transition relative text-[#64748b] hover:text-slate-300"
          title="Outbox & Pending Syncs"
        >
          <Send className="w-4 h-4" />
          <span className="text-[10px] font-mono">Outbox</span>
          {syncQueue.length > 0 && (
            <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full bg-amber-500 text-black text-[9px] font-mono font-bold animate-pulse">
              {syncQueue.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('sheet');
            setSelectedTicketId(null);
          }}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-lg transition ${
            activeTab === 'sheet' ? 'text-blue-400 font-semibold' : 'text-[#64748b] hover:text-slate-300'
          }`}
          title="Google Sheets Database"
        >
          <Database className="w-4 h-4" />
          <span className="text-[10px] font-mono">Sheets</span>
        </button>
      </nav>
    </div>
  );
}
