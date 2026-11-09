import { OpenProjectService } from './OpenProjectService';
import { db, type LocalTicket, type LocalEffort, type SyncQueueItem } from './db';
import { extractTicketIdFromUrlOrText } from '../utils/urlParser';
import { shouldIncludeTicket } from '../utils/devOpsFilter';

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'synced' | 'error' | 'offline';
  message: string;
  lastSyncedAt?: number;
  pendingCount: number;
}

/**
 * Parses OpenProject ISO duration (e.g. PT1H30M, P28DT13H36M, P2DT9H42M, PT45M, P4DT4H, 1.5) to float hours
 */
export function parseDurationToHours(str?: string | null): number {
  if (!str) return 0;
  if (typeof str === 'number') return str;
  const s = String(str).trim();
  if (s.startsWith('P')) {
    // ISO 8601 duration: P[nY][nM][nW][nD][T[nH][nM][nS]]
    let days = 0, hours = 0, minutes = 0, seconds = 0, weeks = 0;
    const parts = s.split('T');
    const datePart = parts[0];
    const timePart = parts[1] || '';

    const weeksMatch = datePart.match(/(\d+(?:\.\d+)?)W/i);
    if (weeksMatch) weeks = parseFloat(weeksMatch[1]);

    const daysMatch = datePart.match(/(\d+(?:\.\d+)?)D/i);
    if (daysMatch) days = parseFloat(daysMatch[1]);

    const hoursMatch = timePart.match(/(\d+(?:\.\d+)?)H/i);
    if (hoursMatch) hours = parseFloat(hoursMatch[1]);

    const minsMatch = timePart.match(/(\d+(?:\.\d+)?)M/i);
    if (minsMatch) minutes = parseFloat(minsMatch[1]);

    const secsMatch = timePart.match(/(\d+(?:\.\d+)?)S/i);
    if (secsMatch) seconds = parseFloat(secsMatch[1]);

    const totalHours = (weeks * 168) + (days * 24) + hours + (minutes / 60) + (seconds / 3600);
    return +(totalHours.toFixed(2));
  }
  const floatVal = parseFloat(s);
  return isNaN(floatVal) ? 0 : +(floatVal.toFixed(2));
}

/**
 * Formats float hours into clean display string, e.g. 1.5 -> "1.5h" or 57.7 -> "57.7h"
 */
export function formatDurationHours(hours?: number | null): string {
  if (!hours || isNaN(hours) || hours <= 0) return '0h';
  const rounded = +(hours.toFixed(2));
  return `${rounded}h`;
}

/**
 * Detects whether an error from OpenProject is an HTTP 409 Conflict / Optimistic Lock error.
 */
export function is409Conflict(err: any): boolean {
  if (!err) return false;
  const status = err.response?.status || err.status || err.statusCode;
  if (status === 409) return true;
  const message = String(err.message || '');
  const dataStr = err.response?.data ? (typeof err.response.data === 'string' ? err.response.data : JSON.stringify(err.response.data)) : '';
  const combined = (message + ' ' + dataStr).toLowerCase();
  return combined.includes('409') || combined.includes('updateconflict') || combined.includes('optimistic');
}

export const syncService = {
  /**
   * Process a single queued sync item immediately with automatic 409 conflict resolution
   */
  async processQueueItem(item: SyncQueueItem): Promise<void> {
    if (item.type === 'UPDATE_STATUS') {
      try {
        // PRE-VERIFICATION: Verify ticket with live OP fetch before mutating to prevent 409 conflicts
        try {
          const live = await OpenProjectService.getWorkPackage(Number(item.payload.ticketId));
          if (live) {
            const liveStatusHref = live._links?.status?.href || '';
            const liveStatusId = liveStatusHref.split('/').pop() || '';
            if (String(liveStatusId) === String(item.payload.statusId)) {
              console.log(`[Sync] Pre-verification: Ticket #${item.payload.ticketId} is already in status (${live._links?.status?.title || liveStatusId}). Resolving outbox item without redundant mutation.`);
              await db.removeSyncItem(item.id);
              const t = await db.getTicket(Number(item.payload.ticketId));
              if (t) {
                await db.putTicket({
                  ...t,
                  statusId: String(liveStatusId),
                  status: live._links?.status?.title || t.status,
                  lockVersion: live.lockVersion,
                  pendingSync: false
                });
              }
              return;
            }
            // Use verified latest lockVersion from live ticket
            item.payload.lockVersion = live.lockVersion;
          }
        } catch (verifErr) {
          console.warn(`[Sync] Pre-verification fetch for ticket #${item.payload.ticketId} status update returned warning, proceeding with queued payload:`, verifErr);
        }

        const updated = await OpenProjectService.updateWorkPackageStatus(
          item.payload.ticketId,
          item.payload.statusId,
          item.payload.lockVersion
        );
        await db.removeSyncItem(item.id);
        const t = await db.getTicket(Number(item.payload.ticketId));
        if (t) {
          await db.putTicket({
            ...t,
            statusId: item.payload.statusId,
            status: updated?._links?.status?.title || t.status,
            lockVersion: updated?.lockVersion ?? ((t.lockVersion || 1) + 1),
            pendingSync: false
          });
        }
      } catch (err: any) {
        if (is409Conflict(err)) {
          console.warn(`[Sync] 409 Conflict detected for ticket #${item.payload.ticketId} status update. Re-fetching latest ticket details...`);
          const latest = await this.fetchAndCacheSingleTicket(Number(item.payload.ticketId));
          if (latest) {
            if (String(latest.statusId) === String(item.payload.statusId)) {
              console.log(`[Sync] Ticket #${item.payload.ticketId} is already in desired status (${latest.status}). Resolving conflict.`);
              await db.removeSyncItem(item.id);
              const t = await db.getTicket(Number(item.payload.ticketId));
              if (t) {
                await db.putTicket({ ...t, pendingSync: false });
              }
              return;
            }

            console.log(`[Sync] Conflict: Updating lockVersion from ${item.payload.lockVersion} to ${latest.lockVersion} and re-pushing status...`);
            item.payload.lockVersion = latest.lockVersion;
            await db.enqueueSyncItem(item);

            const updated = await OpenProjectService.updateWorkPackageStatus(
              item.payload.ticketId,
              item.payload.statusId,
              latest.lockVersion
            );

            await db.removeSyncItem(item.id);
            const t = await db.getTicket(Number(item.payload.ticketId));
            if (t) {
              await db.putTicket({
                ...t,
                statusId: item.payload.statusId,
                status: updated?._links?.status?.title || t.status,
                lockVersion: updated?.lockVersion ?? (latest.lockVersion + 1),
                pendingSync: false
              });
            }
            return;
          }
        }
        throw err;
      }
    } else if (item.type === 'UPDATE_ASSIGNEE') {
      try {
        // PRE-VERIFICATION: Verify ticket with live OP fetch before mutating to prevent 409 conflicts
        try {
          const live = await OpenProjectService.getWorkPackage(Number(item.payload.ticketId));
          if (live) {
            const liveAssigneeHref = live._links?.assignee?.href || '';
            const liveAssigneeId = liveAssigneeHref.split('/').pop() || '';
            const desiredAssigneeId = String(item.payload.assigneeId || '');
            if (liveAssigneeId === desiredAssigneeId) {
              console.log(`[Sync] Pre-verification: Ticket #${item.payload.ticketId} is already assigned to desired assignee. Resolving outbox item.`);
              await db.removeSyncItem(item.id);
              const t = await db.getTicket(Number(item.payload.ticketId));
              if (t) {
                await db.putTicket({
                  ...t,
                  assigneeId: item.payload.assigneeId,
                  assignee: live._links?.assignee?.title || t.assignee,
                  lockVersion: live.lockVersion,
                  pendingSync: false
                });
              }
              return;
            }
            // Use verified latest lockVersion from live ticket
            item.payload.lockVersion = live.lockVersion;
          }
        } catch (verifErr) {
          console.warn(`[Sync] Pre-verification fetch for ticket #${item.payload.ticketId} assignee update returned warning, proceeding with queued payload:`, verifErr);
        }

        const updated = await OpenProjectService.updateWorkPackageAssignee(
          item.payload.ticketId,
          item.payload.assigneeId,
          item.payload.lockVersion
        );
        await db.removeSyncItem(item.id);
        const t = await db.getTicket(Number(item.payload.ticketId));
        if (t) {
          await db.putTicket({
            ...t,
            assigneeId: item.payload.assigneeId,
            assignee: updated?._links?.assignee?.title || t.assignee,
            lockVersion: updated?.lockVersion ?? ((t.lockVersion || 1) + 1),
            pendingSync: false
          });
        }
      } catch (err: any) {
        if (is409Conflict(err)) {
          console.warn(`[Sync] 409 Conflict detected for ticket #${item.payload.ticketId} assignee update. Re-fetching latest ticket details...`);
          const latest = await this.fetchAndCacheSingleTicket(Number(item.payload.ticketId));
          if (latest) {
            const desiredAssigneeId = String(item.payload.assigneeId || '');
            const currentAssigneeId = String(latest.assigneeId || '');
            if (desiredAssigneeId === currentAssigneeId) {
              console.log(`[Sync] Ticket #${item.payload.ticketId} is already assigned to desired assignee. Resolving conflict.`);
              await db.removeSyncItem(item.id);
              const t = await db.getTicket(Number(item.payload.ticketId));
              if (t) {
                await db.putTicket({ ...t, pendingSync: false });
              }
              return;
            }

            console.log(`[Sync] Conflict: Updating lockVersion from ${item.payload.lockVersion} to ${latest.lockVersion} and re-pushing assignee...`);
            item.payload.lockVersion = latest.lockVersion;
            await db.enqueueSyncItem(item);

            const updated = await OpenProjectService.updateWorkPackageAssignee(
              item.payload.ticketId,
              item.payload.assigneeId,
              latest.lockVersion
            );

            await db.removeSyncItem(item.id);
            const t = await db.getTicket(Number(item.payload.ticketId));
            if (t) {
              await db.putTicket({
                ...t,
                assigneeId: item.payload.assigneeId,
                assignee: updated?._links?.assignee?.title || t.assignee,
                lockVersion: updated?.lockVersion ?? (latest.lockVersion + 1),
                pendingSync: false
              });
            }
            return;
          }
        }
        throw err;
      }
    } else if (item.type === 'LOG_TIME') {
      // PRE-VERIFICATION: Verify ticket exists on OP before submitting time log
      let liveTicket = null;
      try {
        liveTicket = await OpenProjectService.getWorkPackage(Number(item.payload.ticketId));
        if (liveTicket) {
          console.log(`[Sync] Pre-verification: Confirmed ticket #${item.payload.ticketId} exists on OP (${liveTicket.subject}).`);
        }
      } catch (verifErr) {
        console.warn(`[Sync] Pre-verification fetch for ticket #${item.payload.ticketId} time log warning:`, verifErr);
      }

      await OpenProjectService.logTime(
        item.payload.ticketId,
        item.payload.hours,
        item.payload.comment,
        item.payload.date
      );
      await db.removeSyncItem(item.id);
      const allEfforts = await db.getAllEfforts();
      const match = allEfforts.find(
        e => String(e.workPackageId) === String(item.payload.ticketId) &&
             e.spentOn === item.payload.date &&
             e.pendingSync
      );
      if (match) {
        await db.putEffort({ ...match, pendingSync: false });
      }

      // Re-fetch ticket from OP to refresh total spentTime and lockVersion in local DB
      if (liveTicket) {
        try {
          const fresh = await OpenProjectService.getWorkPackage(Number(item.payload.ticketId));
          if (fresh && fresh.spentTime) {
            const t = await db.getTicket(Number(item.payload.ticketId));
            if (t) {
              await db.putTicket({ ...t, spentTime: fresh.spentTime, lockVersion: fresh.lockVersion });
            }
          }
        } catch {}
      }
    } else if (item.type === 'UPDATE_TIME') {
      await OpenProjectService.updateTimeEntry(
        item.payload.id,
        item.payload.hours,
        item.payload.comment,
        item.payload.date
      );
      await db.removeSyncItem(item.id);
      const allEfforts = await db.getAllEfforts();
      const match = allEfforts.find(e => e.id === item.payload.id);
      if (match) {
        await db.putEffort({ ...match, pendingSync: false });
      }
    } else if (item.type === 'DELETE_TIME') {
      await OpenProjectService.deleteTimeEntry(item.payload.id);
      await db.removeSyncItem(item.id);
    }
  },

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
          await this.processQueueItem(item);
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

      // DEV OPS & IT RULE: Dev Ops & IT tickets should ONLY be saved if assigned to current user
      const currentUserMeta = await db.getMeta<{ id: string; name: string }>('currentUser');
      const eligibleRemoteTickets = remoteTickets.filter(remote => shouldIncludeTicket(remote, currentUserMeta));

      // Retrieve existing local tickets to check for pending local mutations
      const localTickets = await db.getAllTickets();
      const localMap = new Map(localTickets.map(t => [t.id, t]));

      const mergedTickets = eligibleRemoteTickets.map(remote => {
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

      // Prune any existing Dev Ops & IT tickets from local DB that are not assigned to current user
      const toDeleteIds = localTickets
        .filter(t => !shouldIncludeTicket(t, currentUserMeta))
        .map(t => t.id);
      if (toDeleteIds.length > 0) {
        console.log(`[Sync] Pruning ${toDeleteIds.length} Dev Ops & IT tickets not assigned to me from local DB:`, toDeleteIds);
        await db.deleteTickets(toDeleteIds);
      }

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

      // DEV OPS & IT RULE: Dev Ops & IT tickets should ONLY be saved if assigned to me
      const currentUserMeta = await db.getMeta<{ id: string; name: string }>('currentUser');
      if (!shouldIncludeTicket(ticket, currentUserMeta)) {
        console.log(`[Sync] Ticket #${ticket.id} belongs to Dev Ops & IT and is not assigned to current user. Skipping save.`);
        return null;
      }

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
      // 1. Direct ID or OpenProject URL extraction (e.g. https://openproject.../work_packages/353351 or #353351)
      const extractedId = extractTicketIdFromUrlOrText(trimmed) || parseInt(trimmed.replace(/^#/, ''), 10);
      if (extractedId && !isNaN(extractedId) && extractedId > 0) {
        const single = await this.fetchAndCacheSingleTicket(extractedId);
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

        // DEV OPS & IT RULE: Dev Ops & IT tickets should ONLY be added/saved if assigned to me
        const currentUserMeta = await db.getMeta<{ id: string; name: string }>('currentUser');
        if (!shouldIncludeTicket(ticket, currentUserMeta)) {
          console.log(`[Sync] Remote search result #${ticket.id} belongs to Dev Ops & IT and is not assigned to current user. Skipping.`);
          continue;
        }

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
