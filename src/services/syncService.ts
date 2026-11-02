import { OpenProjectService } from './OpenProjectService';
import { db, type LocalTicket, type LocalEffort } from './db';

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'synced' | 'error' | 'offline';
  message: string;
  lastSyncedAt?: number;
  pendingCount: number;
}

/**
 * Parses OpenProject ISO duration PT1H30M to float hours (1.5)
 */
export function parseDurationToHours(str?: string | null): number {
  if (!str) return 0;
  if (str.startsWith('PT')) {
    const hoursMatch = str.match(/(\d+)H/);
    const minsMatch = str.match(/(\d+)M/);
    const h = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
    const m = minsMatch ? parseInt(minsMatch[1], 10) : 0;
    return +(h + m / 60).toFixed(2);
  }
  const floatVal = parseFloat(str);
  return isNaN(floatVal) ? 0 : floatVal;
}

export const syncService = {
  /**
   * Main sync routine: flushes outbox queue, fetches latest tickets, statuses, users & efforts, saves to IndexedDB.
   */
  async syncAll(): Promise<{ success: boolean; reason?: string; count?: number }> {
    const hasCreds = await OpenProjectService.hasCredentials();
    if (!hasCreds) {
      return { success: false, reason: 'NO_CREDENTIALS' };
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { success: false, reason: 'OFFLINE' };
    }

    try {
      // 1. Flush Pending Sync Queue (Outbox)
      const queue = await db.getSyncQueue();
      for (const item of queue) {
        try {
          if (item.type === 'UPDATE_STATUS') {
            await OpenProjectService.updateWorkPackageStatus(
              item.payload.ticketId,
              item.payload.statusId,
              item.payload.lockVersion
            );
            await db.removeSyncItem(item.id);
          } else if (item.type === 'UPDATE_ASSIGNEE') {
            await OpenProjectService.updateWorkPackageAssignee(
              item.payload.ticketId,
              item.payload.assigneeId,
              item.payload.lockVersion
            );
            await db.removeSyncItem(item.id);
          } else if (item.type === 'LOG_TIME') {
            await OpenProjectService.logTime(
              item.payload.ticketId,
              item.payload.hours,
              item.payload.comment,
              item.payload.date
            );
            await db.removeSyncItem(item.id);
          }
        } catch (err: any) {
          console.warn('[Sync] Failed to process queue item:', item.id, err);
        }
      }

      // 2. Fetch Current User, Real Statuses (with isClosed), Types, Projects & Assignees
      try {
        const me = await OpenProjectService.getCurrentUser();
        if (me && me.id) {
          await db.setMeta('currentUser', { id: String(me.id), name: me.name });
        }
      } catch (e) {
        console.warn('[Sync] Current user warning:', e);
      }

      try {
        const statusesData = await OpenProjectService.getStatuses();
        const stElements = statusesData?._embedded?.elements || [];
        if (stElements.length > 0) {
          await db.putStatuses(stElements.map((s: any) => ({
            id: String(s.id),
            name: s.name,
            isClosed: !!s.isClosed
          })));
        }

        const typesData = await OpenProjectService.getTypes();
        const tyElements = typesData?._embedded?.elements || [];
        if (tyElements.length > 0) {
          await db.putTypes(tyElements.map((t: any) => ({ id: String(t.id), name: t.name })));
        }

        // Fetch Projects and available assignees for each project
        const projsData = await OpenProjectService.getProjects();
        const pElements = projsData?._embedded?.elements || [];
        if (pElements.length > 0) {
          await db.setMeta('projects', pElements.map((p: any) => ({
            id: String(p.id),
            identifier: p.identifier,
            name: p.name
          })));

          for (const p of pElements) {
            try {
              const aData = await OpenProjectService.getProjectMembers(p.id);
              const members = (aData?._embedded?.elements || []).map((u: any) => ({
                id: String(u.id),
                name: u.name
              }));
              if (members.length > 0) {
                await db.putProjectAssignees(String(p.id), members);
              }
            } catch {
              // 403 on some restricted projects is expected
            }
          }
        }
      } catch (e) {
        console.warn('[Sync] Lookups sync warning:', e);
      }

      // 3. Fetch Latest Work Packages from OP API
      const rawData = await OpenProjectService.getWorkPackages(50);
      const elements = rawData?._embedded?.elements || [];

      // Transform raw OpenProject work packages into clean typed LocalTicket
      const remoteTickets: LocalTicket[] = elements.map((item: any) => {
        const statusHref = item._links?.status?.href || '';
        const statusId = statusHref.split('/').pop() || '';
        const assigneeHref = item._links?.assignee?.href || '';
        const assigneeId = assigneeHref.split('/').pop() || undefined;
        const typeHref = item._links?.type?.href || '';
        const typeId = typeHref.split('/').pop() || undefined;
        const projectHref = item._links?.project?.href || '';
        const projectId = projectHref.split('/').pop() || undefined;

        return {
          id: item.id,
          subject: item.subject,
          description: item.description?.raw || '',
          type: item._links?.type?.title || 'Task',
          typeId: typeId,
          project: item._links?.project?.title || 'Unknown Project',
          projectId: projectId,
          status: item._links?.status?.title || 'Open',
          statusId: statusId,
          priority: item._links?.priority?.title || 'Normal',
          assignee: item._links?.assignee?.title || 'Unassigned',
          assigneeId: assigneeId,
          estimatedTime: item.estimatedTime,
          spentTime: item.spentTime,
          lockVersion: item.lockVersion,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt || new Date().toISOString(),
          pendingSync: false
        };
      });

      // Retrieve existing local tickets to check for pending local mutations
      const localTickets = await db.getAllTickets();
      const localMap = new Map(localTickets.map(t => [t.id, t]));

      const mergedTickets = remoteTickets.map(remote => {
        const existing = localMap.get(remote.id);
        const isStarred = existing ? !!existing.starred : false;

        // If local has pending changes, keep the local changes until sync confirmed
        if (existing && existing.pendingSync) {
          return {
            ...remote,
            status: existing.status,
            statusId: existing.statusId,
            assignee: existing.assignee,
            assigneeId: existing.assigneeId,
            spentTime: existing.spentTime,
            pendingSync: true,
            starred: isStarred
          };
        }
        return {
          ...remote,
          starred: isStarred
        };
      });

      await db.putTickets(mergedTickets);

      // Supplementary project assignees: derive from tickets if API 403'd
      const allTickets = await db.getAllTickets();
      const projectMap: Record<string, Map<string, string>> = {};
      for (const t of allTickets) {
        if (t.projectId && t.assigneeId && t.assignee && t.assignee.toLowerCase() !== 'unassigned') {
          if (!projectMap[t.projectId]) projectMap[t.projectId] = new Map();
          projectMap[t.projectId].set(t.assigneeId, t.assignee);
        }
      }
      for (const [projId, userMap] of Object.entries(projectMap)) {
        const existing = await db.getProjectAssignees(projId);
        if (!existing || existing.length === 0) {
          const derived = Array.from(userMap.entries()).map(([id, name]) => ({ id, name }));
          if (derived.length > 0) {
            await db.putProjectAssignees(projId, derived);
          }
        }
      }

      // 4. Fetch User's Recent Logged Efforts from OpenProject
      try {
        let timeData;
        try {
          timeData = await OpenProjectService.getMyTimeEntries(100);
        } catch {
          const past7Days = new Date();
          past7Days.setDate(past7Days.getDate() - 14);
          const startStr = past7Days.toISOString().split('T')[0];
          const endStr = new Date().toISOString().split('T')[0];
          timeData = await OpenProjectService.getTimeEntriesForDateRange(startStr, endStr);
        }

        const entries = timeData?._embedded?.elements || [];
        const efforts: LocalEffort[] = entries.map((entry: any) => {
          const wpId = entry._links?.workPackage?.href ? parseInt(entry._links.workPackage.href.split('/').pop()!, 10) : 0;
          return {
            id: String(entry.id),
            workPackageId: wpId,
            ticketSubject: entry._links?.workPackage?.title || '',
            hours: parseDurationToHours(entry.hours),
            comment: entry.comment?.raw || '',
            spentOn: entry.spentOn,
            createdAt: entry.createdAt || new Date().toISOString(),
            pendingSync: false
          };
        });

        if (efforts.length > 0) {
          await db.putEfforts(efforts);
        }
      } catch (e) {
        console.warn('[Sync] Time entries fetch failed (non-critical):', e);
      }

      // 5. Save metadata
      const now = Date.now();
      await db.setMeta('lastSyncTime', now);

      return { success: true, count: mergedTickets.length };
    } catch (err: any) {
      console.error('[Sync] Full sync error:', err);
      return { success: false, reason: err.message || 'NETWORK_ERROR' };
    }
  },

  /**
   * Fetch a single ticket by ID and cache it locally in IndexedDB (used for deep links, search, & clipboard)
   */
  async fetchAndCacheSingleTicket(ticketId: number): Promise<LocalTicket | null> {
    try {
      const existing = await db.getTicket(ticketId);
      const raw = await OpenProjectService.getWorkPackage(ticketId);
      if (!raw) return null;

      const statusHref = raw._links?.status?.href || '';
      const statusId = statusHref.split('/').pop() || '';
      const assigneeHref = raw._links?.assignee?.href || '';
      const assigneeId = assigneeHref.split('/').pop() || undefined;
      const typeHref = raw._links?.type?.href || '';
      const typeId = typeHref.split('/').pop() || undefined;
      const projectHref = raw._links?.project?.href || '';
      const projectId = projectHref.split('/').pop() || undefined;

      const ticket: LocalTicket = {
        id: raw.id,
        subject: raw.subject,
        description: raw.description?.raw || '',
        type: raw._links?.type?.title || 'Task',
        typeId: typeId,
        project: raw._links?.project?.title || 'Unknown Project',
        projectId: projectId,
        status: raw._links?.status?.title || 'Open',
        statusId: statusId,
        priority: raw._links?.priority?.title || 'Normal',
        assignee: raw._links?.assignee?.title || 'Unassigned',
        assigneeId: assigneeId,
        estimatedTime: raw.estimatedTime,
        spentTime: raw.spentTime,
        lockVersion: raw.lockVersion,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt || new Date().toISOString(),
        pendingSync: false,
        starred: existing ? existing.starred : false
      };

      await db.putTicket(ticket);
      return ticket;
    } catch (err) {
      console.warn('[Sync] Failed to fetch single ticket:', ticketId, err);
      return null;
    }
  },

  /**
   * Search OpenProject remotely and store results into local database
   */
  async searchRemoteAndCache(query: string): Promise<LocalTicket[]> {
    try {
      const trimmed = query.trim();
      // If direct ID
      const directId = parseInt(trimmed.replace(/^#/, ''), 10);
      if (!isNaN(directId) && directId > 0) {
        const single = await this.fetchAndCacheSingleTicket(directId);
        if (single) return [single];
      }

      // Keyword search
      const data = await OpenProjectService.searchWorkPackages(trimmed);
      const elements = data?._embedded?.elements || [];
      const newTickets: LocalTicket[] = [];

      for (const item of elements) {
        const statusHref = item._links?.status?.href || '';
        const statusId = statusHref.split('/').pop() || '';
        const assigneeHref = item._links?.assignee?.href || '';
        const assigneeId = assigneeHref.split('/').pop() || undefined;
        const typeHref = item._links?.type?.href || '';
        const typeId = typeHref.split('/').pop() || undefined;
        const projectHref = item._links?.project?.href || '';
        const projectId = projectHref.split('/').pop() || undefined;

        const ticket: LocalTicket = {
          id: item.id,
          subject: item.subject,
          description: item.description?.raw || '',
          type: item._links?.type?.title || 'Task',
          typeId: typeId,
          project: item._links?.project?.title || 'Unknown Project',
          projectId: projectId,
          status: item._links?.status?.title || 'Open',
          statusId: statusId,
          priority: item._links?.priority?.title || 'Normal',
          assignee: item._links?.assignee?.title || 'Unassigned',
          assigneeId: assigneeId,
          estimatedTime: item.estimatedTime,
          spentTime: item.spentTime,
          lockVersion: item.lockVersion,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt || new Date().toISOString(),
          pendingSync: false
        };

        await db.putTicket(ticket);
        newTickets.push(ticket);
      }

      return newTickets;
    } catch (e) {
      console.warn('[Sync] Search remote error:', e);
      return [];
    }
  }
};
