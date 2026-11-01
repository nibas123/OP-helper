import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { OpenProjectService } from './services/OpenProjectService';
// Removed webhook
// Removed useTheme
import { useDebounce } from 'use-debounce';
import { useFilters } from './hooks/useFilters';
import TicketPreview from './components/TicketPreview';

export default function Dashboard() {
  const { 
    filters, updateFilter, saveCurrentFilter, savedFilters, loadFilter, isLoaded 
  } = useFilters();

  const [debouncedSearch] = useDebounce(filters.searchQuery, 500);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);

  // Force dark mode for the entire extension to match Stitch UI
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  // Fetch Tickets
  const { data: ticketsData, isLoading } = useQuery({
    queryKey: ['tickets', filters.project, filters.status, filters.type, filters.assignee, filters.dateMode, debouncedSearch],
    queryFn: async () => {
      const client = await OpenProjectService.getApiClient();
      const apiFilters: any[] = [];
      
      if (filters.project.length > 0) apiFilters.push({ "project": { "operator": "=", "values": filters.project } });
      if (filters.status.length > 0) apiFilters.push({ "status": { "operator": "=", "values": filters.status } });
      if (filters.type.length > 0) apiFilters.push({ "type": { "operator": "=", "values": filters.type } });
      if (filters.assignee.length > 0) apiFilters.push({ "assignee": { "operator": "=", "values": filters.assignee } });

      if (debouncedSearch) apiFilters.push({ "subjectOrId": { "operator": "**", "values": [debouncedSearch] } });

      if (filters.dateMode !== 'any') {
        const d = new Date();
        if (filters.dateMode === 'today') {
          d.setHours(0,0,0,0);
        } else if (filters.dateMode === 'week') {
          d.setDate(d.getDate() - 7);
        } else if (filters.dateMode === 'month') {
          d.setDate(1);
          d.setHours(0,0,0,0);
        }
        apiFilters.push({ "updatedAt": { "operator": ">=", "values": [d.toISOString()] } });
      }

      const filterStr = JSON.stringify(apiFilters);
      const res = await client.get(`/work_packages?pageSize=50&filters=${encodeURIComponent(filterStr)}`);
      return res.data;
    },
    enabled: isLoaded
  });

  const { data: projectsData } = useQuery({ queryKey: ['projects'], queryFn: OpenProjectService.getProjects });
  const { data: statusesData } = useQuery({ queryKey: ['statuses'], queryFn: OpenProjectService.getStatuses });
  const { data: typesData } = useQuery({ queryKey: ['types'], queryFn: OpenProjectService.getTypes });
  const { data: usersData } = useQuery({ queryKey: ['users'], queryFn: async () => {
    const client = await OpenProjectService.getApiClient();
    const res = await client.get('/users');
    return res.data;
  }});

  const tickets = ticketsData?._embedded?.elements || [];
  const types = (typesData as any)?._embedded?.elements || [];
  const projects = (projectsData as any)?._embedded?.elements || [];
  const statuses = (statusesData as any)?._embedded?.elements || [];
  const users = (usersData as any)?._embedded?.elements || [];

  const handleSaveFilter = () => {
    const name = prompt("Enter a name for this filter combo:");
    if (name) {
      saveCurrentFilter(name);
    }
  };

  return (
    <div className="bg-surface text-on-surface font-body-md selection:bg-primary-container/30 selection:text-primary min-h-screen w-full flex">
      {/* Sidebar */}
      <aside className="w-sidebar-width h-screen sticky left-0 top-0 bg-surface-container-low border-r border-outline-variant flex flex-col p-unit z-50">
        <div className="px-gutter py-element-gap-standard mb-element-gap-standard">
          <div className="flex items-center gap-unit">
            <span className="material-symbols-outlined text-primary text-headline-sm" style={{ fontVariationSettings: "'FILL' 1" }}>developer_board</span>
            <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface">Project Workspace</h1>
          </div>
          <p className="font-label-md text-label-md text-on-surface-variant opacity-70">Management Console</p>
        </div>
        <nav className="flex-1 px-unit space-y-unit">
          <a className="flex items-center gap-3 px-3 py-2 bg-secondary-container text-on-secondary-container rounded-lg transition-all" href="#">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>dashboard</span>
            <span className="font-label-md text-label-md">Dashboard</span>
          </a>
          <a className="flex items-center gap-3 px-3 py-2 text-on-surface-variant hover:bg-surface-variant rounded-lg transition-all group" href="#">
            <span className="material-symbols-outlined">inventory_2</span>
            <span className="font-label-md text-label-md">Work Packages</span>
          </a>
          <a className="flex items-center gap-3 px-3 py-2 text-on-surface-variant hover:bg-surface-variant rounded-lg transition-all group" href="#">
            <span className="material-symbols-outlined">schedule</span>
            <span className="font-label-md text-label-md">Time Tracking</span>
          </a>
          <a className="flex items-center gap-3 px-3 py-2 text-on-surface-variant hover:bg-surface-variant rounded-lg transition-all group" href="#">
            <span className="material-symbols-outlined">analytics</span>
            <span className="font-label-md text-label-md">Reports</span>
          </a>
          <a className="flex items-center gap-3 px-3 py-2 text-on-surface-variant hover:bg-surface-variant rounded-lg transition-all group" href="#">
            <span className="material-symbols-outlined">settings</span>
            <span className="font-label-md text-label-md">Settings</span>
          </a>
        </nav>
        <div className="p-unit mt-auto">
          <div className="space-y-unit border-t border-outline-variant pt-unit">
            <a className="flex items-center gap-3 px-3 py-2 text-on-surface-variant hover:bg-surface-variant rounded-lg transition-all text-error" href="#" onClick={() => alert('Logout coming soon')}>
              <span className="material-symbols-outlined">logout</span>
              <span className="font-label-md text-label-md">Logout</span>
            </a>
          </div>
        </div>
      </aside>

      {/* Main Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {/* Header */}
        <header className="bg-surface-container w-full h-12 sticky top-0 z-50 border-b border-outline-variant flex justify-between items-center px-gutter shrink-0">
          <div className="flex items-center gap-gutter w-full">
            <span className="font-headline-sm text-headline-sm font-bold text-primary whitespace-nowrap">OpenProject Pro</span>
            <div className="relative w-64">
              <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
              <input 
                type="text" 
                placeholder="Search Workspace..." 
                value={filters.searchQuery}
                onChange={e => updateFilter('searchQuery', e.target.value)}
                className="bg-surface-variant border-none rounded-lg pl-9 pr-3 py-1 text-body-sm w-full focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/50 text-on-surface outline-none"
              />
            </div>
            
            <div className="ml-4 flex items-center gap-2">
                <span className="text-xs text-on-surface-variant">Saved Filters:</span>
                <select 
                  className="bg-surface-variant border border-outline-variant rounded px-2 py-1 text-xs focus:ring-1 focus:ring-primary text-on-surface w-32 outline-none"
                  onChange={e => e.target.value && loadFilter(e.target.value)}
                  value=""
                >
                  <option value="" disabled>Load...</option>
                  {savedFilters.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Content Header / Dashboard Summary */}
          <div className="p-gutter border-b border-outline-variant bg-surface-container-lowest shrink-0">
            <div className="flex justify-between items-end mb-gutter">
              <div>
                <h2 className="font-headline-md text-headline-md mb-unit">Assigned To Me</h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Manage your personal task queue and daily priorities.</p>
              </div>
            </div>
            {/* Summary Cards Bento Grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-element-gap-standard">
              <div className="bg-surface-container-high p-gutter rounded-xl border border-outline-variant/50 flex flex-col gap-unit group hover:border-primary/30 transition-all">
                <span className="text-on-surface-variant font-label-md text-label-md">Open Tasks</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-headline-lg font-headline-lg text-primary">{tickets.length}</span>
                  <span className="text-on-surface-variant text-[12px] opacity-60">loaded</span>
                </div>
              </div>
              <div className="bg-surface-container-high p-gutter rounded-xl border border-outline-variant/50 flex flex-col gap-unit group hover:border-error/30 transition-all">
                <span className="text-on-surface-variant font-label-md text-label-md">Overdue</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-headline-lg font-headline-lg text-error">0</span>
                  <span className="material-symbols-outlined text-error text-[18px]">warning</span>
                </div>
              </div>
              <div className="bg-surface-container-high p-gutter rounded-xl border border-outline-variant/50 flex flex-col gap-unit group hover:border-secondary/30 transition-all">
                <span className="text-on-surface-variant font-label-md text-label-md">Due Today</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-headline-lg font-headline-lg text-on-surface">0</span>
                </div>
              </div>
              <div className="bg-surface-container-high p-gutter rounded-xl border border-outline-variant/50 flex flex-col gap-unit group hover:border-tertiary/30 transition-all">
                <span className="text-on-surface-variant font-label-md text-label-md">High Priority</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-headline-lg font-headline-lg text-tertiary">0</span>
                </div>
              </div>
              <div className="bg-surface-container-high p-gutter rounded-xl border border-outline-variant/50 flex flex-col gap-unit group hover:border-primary/30 transition-all">
                <span className="text-on-surface-variant font-label-md text-label-md">Hours Logged</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-headline-lg font-headline-lg text-primary">0</span>
                  <span className="text-on-surface-variant text-[12px] opacity-60">/ 40h</span>
                </div>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="px-gutter py-2 border-b border-outline-variant bg-surface flex items-center gap-2 overflow-x-auto shrink-0">
            <span className="material-symbols-outlined text-on-surface-variant text-[18px]">filter_list</span>
            <div className="flex items-center gap-2">
              
              <div className="bg-surface-variant border border-outline-variant rounded-full px-3 py-1 flex items-center gap-2 group">
                <span className="text-[11px] text-on-surface-variant">Assignee:</span>
                <select value={filters.assignee[0] || ""} onChange={e => updateFilter('assignee', e.target.value ? [e.target.value] : [])} className="bg-transparent text-[12px] font-medium text-on-surface outline-none cursor-pointer">
                  <option value="" className="bg-surface text-on-surface">Any</option>
                  <option value="me" className="bg-surface text-on-surface">Mine</option>
                  {users.map((u: any) => <option key={u.id} value={u.id} className="bg-surface text-on-surface">{u.name}</option>)}
                </select>
              </div>

              <div className="bg-surface-variant border border-outline-variant rounded-full px-3 py-1 flex items-center gap-2 group">
                <span className="text-[11px] text-on-surface-variant">Status:</span>
                <select value={filters.status[0] || ""} onChange={e => updateFilter('status', e.target.value ? [e.target.value] : [])} className="bg-transparent text-[12px] font-medium text-on-surface outline-none cursor-pointer">
                  <option value="" className="bg-surface text-on-surface">Any</option>
                  {statuses.map((s: any) => <option key={s.id} value={s.id} className="bg-surface text-on-surface">{s.name}</option>)}
                </select>
              </div>

              <div className="bg-surface-variant border border-outline-variant rounded-full px-3 py-1 flex items-center gap-2 group">
                <span className="text-[11px] text-on-surface-variant">Type:</span>
                <select value={filters.type[0] || ""} onChange={e => updateFilter('type', e.target.value ? [e.target.value] : [])} className="bg-transparent text-[12px] font-medium text-on-surface outline-none cursor-pointer">
                  <option value="" className="bg-surface text-on-surface">Any</option>
                  {types.map((t: any) => <option key={t.id} value={t.id} className="bg-surface text-on-surface">{t.name}</option>)}
                </select>
              </div>

              <div className="bg-surface-variant border border-outline-variant rounded-full px-3 py-1 flex items-center gap-2 group">
                <span className="text-[11px] text-on-surface-variant">Project:</span>
                <select value={filters.project[0] || ""} onChange={e => updateFilter('project', e.target.value ? [e.target.value] : [])} className="bg-transparent text-[12px] font-medium text-on-surface outline-none cursor-pointer">
                  <option value="" className="bg-surface text-on-surface">Any</option>
                  {projects.map((p: any) => <option key={p.id} value={p.id} className="bg-surface text-on-surface">{p.name}</option>)}
                </select>
              </div>

              <button onClick={handleSaveFilter} className="text-primary hover:bg-primary/10 rounded-full px-3 py-1 text-[12px] font-medium flex items-center gap-1 transition-all ml-2">
                <span className="material-symbols-outlined text-[16px]">bookmark_add</span>
                Save Combo
              </button>
            </div>
          </div>

          {/* Split View Content Area */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left Pane: Table */}
            <div className={`${activeTicketId ? 'w-[60%]' : 'w-full'} transition-all duration-300 flex flex-col border-r border-outline-variant overflow-hidden`}>
              <div className="flex-1 overflow-auto relative">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-surface-container-high z-10 border-b border-outline-variant shadow-sm">
                    <tr className="text-on-surface-variant font-label-md text-label-md uppercase tracking-wider">
                      <th className="px-gutter py-2 font-medium w-24">ID</th>
                      <th className="px-gutter py-2 font-medium">Subject</th>
                      <th className="px-gutter py-2 font-medium w-32">Status</th>
                      <th className="px-gutter py-2 font-medium w-32">Type</th>
                      <th className="px-gutter py-2 font-medium w-32">Assignee</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {isLoading ? (
                      <tr><td colSpan={5} className="p-8 text-center text-on-surface-variant">Loading...</td></tr>
                    ) : tickets.length === 0 ? (
                      <tr><td colSpan={5} className="p-8 text-center text-on-surface-variant">No tickets match your filters.</td></tr>
                    ) : (
                      tickets.map((t: any) => {
                        const isActive = activeTicketId === String(t.id);
                        return (
                          <tr 
                            key={t.id} 
                            onClick={() => setActiveTicketId(String(t.id))}
                            className={`cursor-pointer transition-colors group ${isActive ? 'bg-primary/5 border-l-4 border-l-primary' : 'hover:bg-surface-variant'}`}
                          >
                            <td className={`px-gutter py-2 font-code-sm text-code-sm ${isActive ? 'text-primary' : 'text-on-surface-variant'}`}>
                              #{t.id}
                            </td>
                            <td className="px-gutter py-2 font-body-sm text-body-sm text-on-surface">
                              {t.subject}
                            </td>
                            <td className="px-gutter py-2">
                              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-[11px] font-bold uppercase border border-primary/20 truncate max-w-[100px] inline-block">
                                {t._links.status.title}
                              </span>
                            </td>
                            <td className="px-gutter py-2">
                              <span className="text-on-surface-variant text-[12px] truncate max-w-[100px] inline-block">
                                {t._links.type.title}
                              </span>
                            </td>
                            <td className="px-gutter py-2">
                              <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded-full bg-surface-variant flex items-center justify-center text-[10px] border border-outline-variant overflow-hidden uppercase font-bold text-on-surface">
                                  {t._links.assignee?.title ? t._links.assignee.title.charAt(0) : '?'}
                                </div>
                                <span className="text-[12px] truncate max-w-[80px]">{t._links.assignee?.title || 'Unassigned'}</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Table Footer */}
              <div className="bg-surface-container-low px-gutter py-2 border-t border-outline-variant flex justify-between items-center shrink-0">
                <span className="text-[12px] text-on-surface-variant">Showing {tickets.length} work packages</span>
              </div>
            </div>

            {/* Right Pane: Live Preview */}
            {activeTicketId && (
              <div className="w-[40%] transition-all duration-300 flex flex-col h-full bg-surface-container-low border-l border-outline-variant">
                <TicketPreview ticketId={activeTicketId} onClose={() => setActiveTicketId(null)} />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
