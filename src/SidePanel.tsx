import { useEffect, useState } from 'react';
import { Settings, CheckCircle, Clock, Search, Sun, Moon, ArrowLeft, Save, Loader2, AlertCircle, LayoutDashboard } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { OpenProjectService } from './services/OpenProjectService';
import { sendWebhook } from './utils/webhook';
import { useTheme } from './hooks/useTheme';

export default function SidePanel() {
  const queryClient = useQueryClient();
  const { theme, toggleTheme } = useTheme();
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [manualId, setManualId] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [opUrl, setOpUrl] = useState('');
  const [opApiKey, setOpApiKey] = useState('');
  const [opWebhookUrl, setOpWebhookUrl] = useState('');

  // Time logging state
  const [logTimeValue, setLogTimeValue] = useState('1h');
  const [logComment, setLogComment] = useState('');

  // Fetch ticket using React Query
  const { data: ticket, isLoading, isError, error } = useQuery({
    queryKey: ['ticket', ticketId],
    queryFn: () => OpenProjectService.getWorkPackage(ticketId!),
    enabled: !!ticketId,
    retry: 1,
  });

  // Fetch all statuses
  const { data: statusesData } = useQuery({
    queryKey: ['statuses'],
    queryFn: OpenProjectService.getStatuses,
    enabled: !!ticketId,
  });

  // Extract Project ID to fetch members
  const projectIdStr = ticket?._links?.project?.href?.split('/').pop();

  // Fetch assignees (project members)
  const { data: assigneesData } = useQuery({
    queryKey: ['assignees', projectIdStr],
    queryFn: () => OpenProjectService.getProjectMembers(projectIdStr!),
    enabled: !!projectIdStr,
  });

  // Fetch activities for time logging
  const { data: activitiesData } = useQuery({
    queryKey: ['activities'],
    queryFn: OpenProjectService.getTimeEntriesActivities,
    enabled: !!ticketId,
  });

  // Mutations
  const updateStatusMutation = useMutation({
    mutationFn: (newStatusId: string) => OpenProjectService.updateWorkPackageStatus(ticketId!, newStatusId, ticket.lockVersion),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
      const statusName = statusesData?._embedded?.elements.find((s: any) => String(s.id) === variables)?.name;
      sendWebhook({
        timestamp: new Date().toISOString(),
        ticketId: ticketId,
        subject: ticket?.subject,
        action: `Status changed to ${statusName || 'New Status'}`,
        url: `${opUrl.trim().replace(/\/+$/, '')}/work_packages/${ticketId}`
      });
    },
  });

  const updateAssigneeMutation = useMutation({
    mutationFn: (newAssigneeId: string) => OpenProjectService.updateWorkPackageAssignee(ticketId!, newAssigneeId, ticket.lockVersion),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] }),
  });

  const logTimeMutation = useMutation({
    mutationFn: async () => {
      let ptHours = 'PT1H';
      if (logTimeValue === '15m') ptHours = 'PT15M';
      if (logTimeValue === '30m') ptHours = 'PT30M';
      if (logTimeValue === '1h') ptHours = 'PT1H';
      if (logTimeValue === '2h') ptHours = 'PT2H';
      if (logTimeValue === '4h') ptHours = 'PT4H';
      
      const activities = activitiesData?._embedded?.elements || [];
      const defaultActivityId = activities.length > 0 ? activities[0].id : undefined;
      
      const today = new Date().toISOString().split('T')[0];
      return OpenProjectService.logTime(ticketId!, ptHours, logComment, today, defaultActivityId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
      sendWebhook({
        timestamp: new Date().toISOString(),
        ticketId: ticketId,
        subject: ticket?.subject,
        action: `Logged ${logTimeValue}${logComment ? ` - ${logComment}` : ''}`,
        url: `${opUrl.trim().replace(/\/+$/, '')}/work_packages/${ticketId}`
      });
      setLogComment('');
      alert('Time logged successfully!');
    },
    onError: (err: any) => {
      alert('Failed to log time: ' + err.message);
    }
  });

  useEffect(() => {
    // Listen for changes to latestTicketId
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get('latestTicketId', (res) => {
        if (res.latestTicketId) setTicketId(res.latestTicketId as string);
      });

      const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
        if (changes.latestTicketId) {
          setTicketId(changes.latestTicketId.newValue as string);
        }
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  }, []);

  useEffect(() => {
    if (showSettings && typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.get(['op_url', 'op_api_key', 'op_webhook_url'], (res) => {
        if (res.op_url) setOpUrl(res.op_url as string);
        if (res.op_api_key) setOpApiKey(res.op_api_key as string);
        if (res.op_webhook_url) setOpWebhookUrl(res.op_webhook_url as string);
      });
    }
  }, [showSettings]);

  const saveSettings = () => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.set({ 
        op_url: opUrl.trim(), 
        op_api_key: opApiKey.trim(),
        op_webhook_url: opWebhookUrl.trim()
      }, () => {
        setShowSettings(false);
      });
    } else {
      setShowSettings(false);
    }
  };

  const handleLoadManual = () => {
    if (manualId.trim()) {
      setTicketId(manualId.trim());
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ latestTicketId: manualId.trim() });
      }
    }
  };

  const openDashboard = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: chrome.runtime.getURL('index.html?mode=dashboard') });
    } else {
      window.open('?mode=dashboard', '_blank');
    }
  };

  const projectName = ticket?._links?.project?.title || '';

  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return null;
    if (timeStr.startsWith('PT')) {
      const match = timeStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
      if (match) {
        const h = match[1] || '0';
        const m = match[2] || '0';
        return `${h}h ${m}m`;
      }
    }
    return `${timeStr}h`;
  };

  const estimatedTime = formatTime(ticket?.estimatedTime) || '-';
  const spentTime = formatTime(ticket?.spentTime) || '-';

  const statuses = statusesData?._embedded?.elements || [];
  const assignees = assigneesData?._embedded?.elements || [];

  const currentStatusId = ticket?._links?.status?.href?.split('/').pop() || '';
  const currentAssigneeId = ticket?._links?.assignee?.href?.split('/').pop() || '';

  return (
    <div className="min-h-screen bg-background text-foreground font-sans transition-colors duration-200 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center space-x-2">
          <div className="bg-primary/20 p-2 rounded-lg">
            <CheckCircle className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">OP Helper</h1>
        </div>
        <div className="flex items-center space-x-1">
          <button onClick={openDashboard} title="Open Dashboard" className="p-2 hover:bg-muted rounded-full transition-colors text-primary">
            <LayoutDashboard className="w-4 h-4" />
          </button>
          <button onClick={toggleTheme} className="p-2 hover:bg-muted rounded-full transition-colors">
            {theme === 'dark' ? <Sun className="w-4 h-4 text-muted-foreground" /> : <Moon className="w-4 h-4 text-muted-foreground" />}
          </button>
          <button onClick={() => setShowSettings(!showSettings)} className="p-2 hover:bg-muted rounded-full transition-colors">
            <Settings className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-5 flex-1 flex flex-col">
        {showSettings ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center space-x-2">
              <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-muted rounded-full transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-xl font-bold">Settings</h2>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">OpenProject URL</label>
                <input 
                  type="url" 
                  value={opUrl}
                  onChange={e => setOpUrl(e.target.value)}
                  placeholder="https://openproject.fingent.net" 
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">API Token (apikey)</label>
                <input 
                  type="password" 
                  value={opApiKey}
                  onChange={e => setOpApiKey(e.target.value)}
                  placeholder="Paste API token here..." 
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center space-x-2">
                  <span>Sheets Webhook URL</span>
                  <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">Optional</span>
                </label>
                <input 
                  type="url" 
                  value={opWebhookUrl}
                  onChange={e => setOpWebhookUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/..." 
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-xs text-muted-foreground">Used to automatically log history of worked tickets.</p>
              </div>
            </div>

            <button onClick={saveSettings} className="w-full flex items-center justify-center space-x-2 bg-primary text-primary-foreground py-2.5 rounded-lg font-medium hover:bg-primary/90 transition-all shadow-sm active:scale-95">
              <Save className="w-4 h-4" />
              <span>Save Settings</span>
            </button>
          </div>
        ) : ticketId ? (
          <>
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-20 space-y-4 text-muted-foreground animate-in fade-in">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm font-medium">Fetching ticket #{ticketId}...</p>
              </div>
            )}
            
            {isError && (
              <div className="flex flex-col items-center justify-center py-10 space-y-4 text-center border border-destructive/20 bg-destructive/10 rounded-xl p-6 animate-in fade-in">
                <AlertCircle className="w-10 h-10 text-destructive" />
                <div>
                  <h3 className="font-semibold text-destructive">Failed to load ticket</h3>
                  <p className="text-xs text-destructive/80 mt-1 max-w-[200px] break-words">
                    {(error as Error)?.message || 'Check your settings and API token.'}
                  </p>
                </div>
                <button onClick={() => setTicketId(null)} className="text-xs bg-background border border-border px-4 py-2 rounded-lg hover:bg-muted font-medium">
                  Go Back
                </button>
              </div>
            )}
            
            {!isLoading && !isError && ticket && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
                {/* Ticket Details */}
                <div>
                  <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-2">
                    <span className="font-mono bg-muted px-2 py-0.5 rounded text-xs">#{ticket.id}</span>
                    {projectName && (
                      <>
                        <span>•</span>
                        <span className="text-xs font-medium truncate">{projectName}</span>
                      </>
                    )}
                  </div>
                  <h2 className="text-lg font-bold leading-tight mb-2">{ticket.subject}</h2>
                  
                  <div className="flex items-center space-x-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded-md inline-flex">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Time: {spentTime} spent / {estimatedTime} est</span>
                  </div>
                </div>

                <div className="h-px bg-border my-4 w-full" />

                {/* Editable Fields */}
                <div className="space-y-4">
                  {/* Status Dropdown */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground block">Status</label>
                    <div className="relative">
                      <select 
                        disabled={updateStatusMutation.isPending}
                        value={currentStatusId}
                        onChange={(e) => updateStatusMutation.mutate(e.target.value)}
                        className="w-full appearance-none bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                      >
                        {statuses.length === 0 && <option value={currentStatusId}>{ticket._links.status.title}</option>}
                        {statuses.map((status: any) => (
                          <option key={status.id} value={status.id}>{status.name}</option>
                        ))}
                      </select>
                      {updateStatusMutation.isPending && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Assignee Dropdown */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground block">Assignee</label>
                    <div className="relative">
                      <select 
                        disabled={updateAssigneeMutation.isPending}
                        value={currentAssigneeId}
                        onChange={(e) => updateAssigneeMutation.mutate(e.target.value)}
                        className="w-full appearance-none bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                      >
                        <option value="">- Unassigned -</option>
                        {assignees.map((assignee: any) => (
                          <option key={assignee.id} value={assignee.id}>{assignee.name}</option>
                        ))}
                      </select>
                      {updateAssigneeMutation.isPending && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="h-px bg-border my-4 w-full" />

                {/* Work Logging (Simplified) */}
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-sm flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span>Log Time</span>
                    </h3>
                  </div>
                  
                  <div className="flex space-x-2">
                    {['15m', '30m', '1h', '2h', '4h'].map(time => (
                      <button 
                        key={time} 
                        onClick={() => setLogTimeValue(time)}
                        className={`flex-1 py-1 rounded text-xs font-medium transition-colors ${logTimeValue === time ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80 text-muted-foreground'}`}
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                  
                  <div className="space-y-2">
                    <textarea 
                      value={logComment}
                      onChange={e => setLogComment(e.target.value)}
                      placeholder="Comment for time log..." 
                      className="w-full bg-background border border-border rounded-lg p-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                      rows={2}
                    ></textarea>
                    <button 
                      onClick={() => logTimeMutation.mutate()}
                      disabled={logTimeMutation.isPending}
                      className="w-full bg-primary/10 text-primary hover:bg-primary/20 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
                    >
                      {logTimeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Submit Time</span>}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-2">
              <Search className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <h2 className="text-lg font-semibold">No Ticket Detected</h2>
            <p className="text-sm text-muted-foreground max-w-[200px]">Navigate to an OP ticket page to automatically load it here.</p>
            <div className="w-full max-w-xs mt-6 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Or enter manually</p>
              <div className="flex space-x-2">
                <input 
                  type="text" 
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  placeholder="Ticket ID..." 
                  className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleLoadManual();
                    }
                  }}
                />
                <button onClick={handleLoadManual} className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                  Load
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
