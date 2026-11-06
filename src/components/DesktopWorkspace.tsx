import React, { useState, useMemo } from 'react';
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
  Smartphone,
  ChevronDown,
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
  Flame,
  Copy,
  FileText,
  Globe,
  CheckCircle2
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import type { LocalTicket, LocalEffort, LookupItem, SavedView } from '../services/db';
import { parseDurationToHours } from '../services/syncService';
import { AuthenticatedImage } from './AuthenticatedImage';
import { preprocessOpenProjectMarkdown } from '../utils/markdownUtils';

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
  filterType: string;
  setFilterType: (type: string) => void;
  filterAssignee: string;
  setFilterAssignee: (assignee: string) => void;
  filterPriority: string;
  setFilterPriority: (priority: string) => void;
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
  onSwitchToMobileView: () => void;
  onQuickLogEffortSubmit?: (ticketId: number, hours: string, comment: string) => Promise<void>;
  onAddCommentSubmit?: (ticketId: number, comment: string) => Promise<void>;
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
    allEfforts,
    searchQuery,
    setSearchQuery,
    isSearchingRemote,
    handleRemoteSearch,
    filterProjects,
    setFilterProjects,
    filterStatusCategory,
    setFilterStatusCategory,
    filterType,
    setFilterType,
    filterAssignee,
    setFilterAssignee,
    filterPriority,
    setFilterPriority,
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
    onSwitchToMobileView,
    onQuickLogEffortSubmit,
    onAddCommentSubmit,
    onSaveSettings
  } = props;

  const [activeTab, setActiveTab] = useState<'tickets' | 'efforts' | 'sheet' | 'settings'>('tickets');
  const [inspectorTab, setInspectorTab] = useState<'details' | 'efforts' | 'comments'>('details');
  const [copiedId, setCopiedId] = useState(false);

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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#090d16] text-[#f1f5f9] font-sans select-none">
      {/* ========================================================================= */}
      {/* 1. LEFT NAVIGATION RAIL (Sidebar) */}
      {/* ========================================================================= */}
      <aside className="w-64 bg-[#0d1322] border-r border-[#1e293b] flex flex-col shrink-0 z-20">
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
              <p className="text-[11px] text-[#64748b] font-mono">Desktop Workspace</p>
            </div>
          </div>
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
            onClick={() => setActiveTab('tickets')}
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
            onClick={() => setActiveTab('efforts')}
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
            onClick={() => setActiveTab('sheet')}
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
            onClick={() => setActiveTab('settings')}
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
          <div className="pt-4 px-3 py-1.5 text-[10px] font-mono font-semibold tracking-wider text-[#64748b] uppercase">
            Quick Views
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
            onClick={() => setIsAddEffortModalOpen(true)}
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

            {pendingCount > 0 && (
              <span className="px-2 py-1 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px] font-mono font-bold" title="Pending offline changes">
                {pendingCount}
              </span>
            )}

            <button
              onClick={() => setActiveTab('settings')}
              className="p-1.5 rounded-lg border border-[#1e293b] bg-[#0d1322] text-slate-400 hover:text-white hover:border-slate-600 transition"
              title="Open Settings"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Switch to Mobile View Toggle Pill */}
          <button
            onClick={onSwitchToMobileView}
            className="w-full py-1.5 px-3 rounded-lg border border-dashed border-[#334155] hover:border-blue-500/60 bg-[#090d16] text-[#94a3b8] hover:text-blue-300 text-[11px] font-mono flex items-center justify-center gap-2 transition"
            title="Switch to Mobile Frame Layout (for side-panel or testing)"
          >
            <Smartphone className="w-3.5 h-3.5 text-blue-400" />
            <span>Switch to Mobile View</span>
          </button>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 2. MAIN DESKTOP AREA (Header + Content) */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Desktop App Bar */}
        <header className="h-14 bg-[#0d1322] border-b border-[#1e293b] px-6 flex items-center justify-between shrink-0 gap-4 z-10">
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
          <div className="flex items-center gap-3 shrink-0">
            {/* Quick Effort Summary Pill */}
            <button
              onClick={() => setIsAddEffortModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 hover:bg-emerald-500/20 text-emerald-400 transition text-xs font-mono group"
              title="Click to log time"
            >
              <Timer className="w-4 h-4 text-emerald-400" />
              <span>
                Today: <strong className="text-white">{todayTotalHours.toFixed(1)}h</strong> / 8.0h
              </span>
              <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden hidden sm:block">
                <div
                  className="h-full bg-emerald-400 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (todayTotalHours / 8) * 100)}%` }}
                />
              </div>
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

            {/* Mobile View Toggle */}
            <button
              onClick={onSwitchToMobileView}
              className="p-1.5 rounded-xl border border-[#1e293b] bg-[#090d16] text-[#64748b] hover:text-blue-400 hover:border-blue-500/40 transition"
              title="Switch to Mobile Frame"
            >
              <Smartphone className="w-4 h-4" />
            </button>

            {/* Settings */}
            <button
              onClick={() => setActiveTab('settings')}
              className="p-1.5 rounded-xl border border-[#1e293b] bg-[#090d16] text-[#64748b] hover:text-white hover:border-slate-600 transition"
              title="Open Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* ===================================================================== */}
        {/* TAB 1: WORK PACKAGES / TICKETS (High Density Split View) */}
        {/* ===================================================================== */}
        {activeTab === 'tickets' && (
          <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Top Bento KPI Summary Cards */}
            <div className="px-6 py-3.5 bg-[#0a0f1d] border-b border-[#1e293b] grid grid-cols-2 md:grid-cols-5 gap-3 shrink-0">
              <div className="bg-[#0f172a] p-3 rounded-xl border border-[#1e293b] flex flex-col justify-between hover:border-blue-500/30 transition">
                <span className="text-[11px] font-mono text-[#94a3b8] uppercase tracking-wide">Work Packages</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-xl font-bold text-white font-mono">{filteredTickets.length}</span>
                  <span className="text-[11px] text-[#64748b]">of {tickets.length}</span>
                </div>
              </div>

              <div 
                onClick={() => setFilterStarredOnly(prev => !prev)}
                className={`p-3 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                  filterStarredOnly 
                    ? 'bg-amber-500/10 border-amber-500/40' 
                    : 'bg-[#0f172a] border-[#1e293b] hover:border-amber-500/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-amber-400 uppercase tracking-wide">Starred (Daily)</span>
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-current" />
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-xl font-bold text-amber-400 font-mono">{starredTickets.length}</span>
                  <span className="text-[11px] text-amber-400/60">{filterStarredOnly ? 'Filter Active' : 'Click to filter'}</span>
                </div>
              </div>

              <div 
                onClick={() => setFilterPriority(filterPriority === 'urgent' ? '' : 'urgent')}
                className="bg-[#0f172a] p-3 rounded-xl border border-[#1e293b] hover:border-rose-500/30 cursor-pointer flex flex-col justify-between transition"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-rose-400 uppercase tracking-wide">Urgent / High</span>
                  <Flame className="w-3.5 h-3.5 text-rose-400" />
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-xl font-bold text-rose-400 font-mono">
                    {tickets.filter(t => (t.priority || '').toLowerCase().includes('urgent') || (t.priority || '').toLowerCase().includes('high')).length}
                  </span>
                  <span className="text-[11px] text-[#64748b]">tickets</span>
                </div>
              </div>

              <div className="bg-[#0f172a] p-3 rounded-xl border border-[#1e293b] flex flex-col justify-between hover:border-emerald-500/30 transition">
                <span className="text-[11px] font-mono text-emerald-400 uppercase tracking-wide">Today's Effort</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-xl font-bold text-emerald-400 font-mono">{todayTotalHours.toFixed(1)}h</span>
                  <span className="text-[11px] text-[#64748b]">/ 8.0h target</span>
                </div>
              </div>

              <div className="bg-[#0f172a] p-3 rounded-xl border border-[#1e293b] flex flex-col justify-between hover:border-blue-500/30 transition">
                <span className="text-[11px] font-mono text-blue-400 uppercase tracking-wide">Week Total</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-xl font-bold text-blue-400 font-mono">{weeklyTotalHours.toFixed(1)}h</span>
                  <span className="text-[11px] text-[#64748b]">/ 40.0h week</span>
                </div>
              </div>
            </div>

            {/* Filter & Sorting Toolbar */}
            <div className="px-6 py-2.5 bg-[#0d1322] border-b border-[#1e293b] flex flex-wrap items-center justify-between gap-3 shrink-0">
              {/* Left filter pill group */}
              <div className="flex items-center gap-2 flex-wrap">
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

                {/* Project Filter */}
                <div className="relative">
                  <select
                    value={filterProjects[0] || ''}
                    onChange={(e) => setFilterProjects(e.target.value ? [e.target.value] : [])}
                    className="bg-[#090d16] border border-[#1e293b] text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:border-blue-500 focus:outline-none appearance-none pr-7 cursor-pointer max-w-[160px] truncate"
                  >
                    <option value="">All Projects</option>
                    {projectsList.map(p => (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-[#64748b] absolute right-2 top-2.5 pointer-events-none" />
                </div>

                {/* Type Filter */}
                <div className="relative">
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="bg-[#090d16] border border-[#1e293b] text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:border-blue-500 focus:outline-none appearance-none pr-7 cursor-pointer"
                  >
                    <option value="">All Types</option>
                    {types.map(t => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-[#64748b] absolute right-2 top-2.5 pointer-events-none" />
                </div>

                {/* Assignee Filter */}
                <div className="relative">
                  <select
                    value={filterAssignee}
                    onChange={(e) => setFilterAssignee(e.target.value)}
                    className="bg-[#090d16] border border-[#1e293b] text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:border-blue-500 focus:outline-none appearance-none pr-7 cursor-pointer"
                  >
                    <option value="">All Assignees</option>
                    <option value="me">Assigned to Me</option>
                    <option value="unassigned">Unassigned</option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-[#64748b] absolute right-2 top-2.5 pointer-events-none" />
                </div>

                {/* Priority Filter */}
                <div className="relative">
                  <select
                    value={filterPriority}
                    onChange={(e) => setFilterPriority(e.target.value)}
                    className="bg-[#090d16] border border-[#1e293b] text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:border-blue-500 focus:outline-none appearance-none pr-7 cursor-pointer"
                  >
                    <option value="">All Priorities</option>
                    {displayPriorities.map(p => (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-[#64748b] absolute right-2 top-2.5 pointer-events-none" />
                </div>

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
              {/* LEFT: High-Density Work Package Table (58% width) */}
              {/* =============================================================== */}
              <div className="flex-1 flex flex-col border-r border-[#1e293b] min-w-0 bg-[#090d16]">
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left border-collapse">
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
                              onClick={() => setSelectedTicketId(ticket.id)}
                              className={`cursor-pointer transition group select-none ${
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
                                <a
                                  href={`${opUrl.replace(/\/+$/, '')}/work_packages/${ticket.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[#64748b] hover:text-blue-400 transition"
                                  title="Open in OpenProject web"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Table Footer Summary */}
                <div className="h-9 px-6 bg-[#0d1322] border-t border-[#1e293b] flex items-center justify-between text-xs text-[#64748b] font-mono shrink-0">
                  <span>Showing {filteredTickets.length} of {tickets.length} work packages</span>
                  <span>Click any row to view & edit details</span>
                </div>
              </div>

              {/* =============================================================== */}
              {/* RIGHT: Live Work Package Detail Inspector (42% width) */}
              {/* =============================================================== */}
              <div className="w-[42%] min-w-[360px] max-w-[620px] bg-[#0c1220] flex flex-col h-full overflow-hidden border-l border-[#1e293b]">
                {!selectedTicket ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#64748b]">
                    <div className="w-16 h-16 rounded-2xl bg-[#1e293b]/40 flex items-center justify-center mb-4 text-[#94a3b8]">
                      <FileText className="w-8 h-8" />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-300 mb-1">No Work Package Selected</h3>
                    <p className="text-xs max-w-xs text-[#64748b]">
                      Click any row from the work package table on the left to preview details, log effort, and edit comments.
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
                    {/* Inspector Header */}
                    <div className="p-4 border-b border-[#1e293b] bg-[#0d1322] shrink-0">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
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

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={handleCopyLink}
                            className="p-1.5 rounded-lg border border-[#1e293b] bg-[#090d16] hover:border-slate-600 text-slate-400 hover:text-white transition"
                            title="Copy OpenProject URL"
                          >
                            {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>

                          <a
                            href={`${opUrl.replace(/\/+$/, '')}/work_packages/${selectedTicket.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-lg border border-[#1e293b] bg-[#090d16] hover:border-blue-500/50 text-slate-400 hover:text-blue-400 transition"
                            title="Open in OpenProject"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>

                          <button
                            onClick={(e) => handleToggleStar(e, selectedTicket.id)}
                            className="p-1.5 rounded-lg border border-[#1e293b] bg-[#090d16] hover:border-amber-500/50 text-slate-400 hover:text-amber-400 transition"
                            title={selectedTicket.starred ? 'Starred' : 'Star for daily access'}
                          >
                            <Star className={`w-3.5 h-3.5 ${selectedTicket.starred ? 'text-amber-400 fill-current' : ''}`} />
                          </button>

                          <button
                            onClick={() => setSelectedTicketId(null)}
                            className="p-1.5 rounded-lg border border-[#1e293b] bg-[#090d16] hover:border-slate-600 text-slate-400 hover:text-white transition"
                            title="Close Inspector"
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
                        Activity
                      </button>
                    </div>

                    {/* Inspector Scrollable Body */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {/* TAB 1: Markdown Description */}
                      {inspectorTab === 'details' && (
                        <div className="space-y-4">
                          <div className="prose prose-invert max-w-none text-xs leading-relaxed text-slate-300">
                            {preprocessedDescription ? (
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[rehypeRaw]}
                                components={{
                                  img: ({ src, alt }) => (
                                    <AuthenticatedImage src={src} alt={alt} onZoom={setZoomedImageUrl} />
                                  )
                                }}
                              >
                                {preprocessedDescription}
                              </ReactMarkdown>
                            ) : (
                              <p className="italic text-[#64748b]">No description provided for this work package.</p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* TAB 2: Time Tracking & Inline Effort Form */}
                      {inspectorTab === 'efforts' && (
                        <div className="space-y-4">
                          {/* Quick Effort Entry Card */}
                          <div className="p-3 bg-[#090d16] border border-[#1e293b] rounded-xl space-y-3">
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
                          <div className="space-y-2">
                            <h4 className="text-[11px] font-mono uppercase text-[#64748b] tracking-wider">Log History</h4>
                            {isLoadingTicketEfforts ? (
                              <p className="text-xs text-blue-400 font-mono animate-pulse">Loading logged efforts...</p>
                            ) : ticketEffortsList.length === 0 ? (
                              <p className="text-xs text-[#64748b]">No time entries logged for this work package yet.</p>
                            ) : (
                              ticketEffortsList.map(entry => (
                                <div
                                  key={entry.id}
                                  className="p-2.5 bg-[#090d16] border border-[#1e293b] rounded-xl flex items-start justify-between gap-2"
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
                      )}

                      {/* TAB 3: Comments & Activity Thread */}
                      {inspectorTab === 'comments' && (
                        <div className="space-y-4">
                          <form onSubmit={handleInlineCommentSubmit} className="space-y-2">
                            <textarea
                              rows={3}
                              value={newCommentText}
                              onChange={e => setNewCommentText(e.target.value)}
                              placeholder="Write a comment or update for this work package..."
                              className="w-full bg-[#090d16] border border-[#1e293b] rounded-xl p-2.5 text-xs text-white placeholder-[#64748b] focus:border-blue-500 focus:outline-none resize-none"
                            />
                            <div className="flex justify-end">
                              <button
                                type="submit"
                                disabled={isSubmittingComment || !newCommentText.trim()}
                                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50 flex items-center gap-1.5"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                <span>{isSubmittingComment ? 'Posting...' : 'Post Comment'}</span>
                              </button>
                            </div>
                          </form>
                          <p className="text-xs text-[#64748b] italic">
                            Comments posted will sync directly to OpenProject work package activity.
                          </p>
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
    </div>
  );
}
