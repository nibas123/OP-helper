import { db, type LocalTicket, type LocalEffort, type LookupItem, type SavedView } from './db';

const SHEET_STORAGE_KEY = 'op_sheet_url';
const SHEET_LAST_SYNC_KEY = 'op_sheet_last_sync';

export interface SheetBackupData {
  projects: { id: string; name: string; identifier?: string }[];
  statuses: LookupItem[];
  types: LookupItem[];
  views: SavedView[];
  tickets: LocalTicket[];
  efforts: LocalEffort[];
  currentUser: { id: string; name: string };
  lastSyncedAt?: string;
}

/**
 * Service to Dual-Sync and Restore state, views, tickets, and effort data with Google Sheets / Excel.
 */
export const sheetSyncService = {
  /**
   * Get the saved Google Apps Script Web App URL
   */
  getSheetUrl(): string {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(SHEET_STORAGE_KEY) || '';
    }
    return '';
  },

  /**
   * Save the Google Apps Script Web App URL
   */
  setSheetUrl(url: string): void {
    const clean = url.trim();
    if (typeof window !== 'undefined' && window.localStorage) {
      if (clean) {
        window.localStorage.setItem(SHEET_STORAGE_KEY, clean);
      } else {
        window.localStorage.removeItem(SHEET_STORAGE_KEY);
      }
    }
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      chrome.storage.sync.set({ [SHEET_STORAGE_KEY]: clean });
    }
  },

  getLastSyncTime(): string {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(SHEET_LAST_SYNC_KEY) || '';
    }
    return '';
  },

  setLastSyncTime(timeStr: string): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(SHEET_LAST_SYNC_KEY, timeStr);
    }
  },

  /**
   * Sends full snapshot of static data (projects, views, statuses, types) and dynamic data (tickets, efforts)
   * to Google Sheet.
   */
  async syncAllToSheet(data: {
    projects: { id: string; name: string; identifier?: string }[];
    statuses: LookupItem[];
    types: LookupItem[];
    views: SavedView[];
    tickets: LocalTicket[];
    efforts: LocalEffort[];
    currentUser: { id: string; name: string };
  }): Promise<{ success: boolean; message?: string }> {
    const sheetUrl = this.getSheetUrl();
    if (!sheetUrl) {
      return { success: false, message: 'Google Sheet Webhook URL not configured in Settings' };
    }

    try {
      const payload = {
        action: 'SYNC_ALL',
        timestamp: new Date().toISOString(),
        currentUser: data.currentUser,
        projects: data.projects,
        statuses: data.statuses,
        types: data.types,
        views: data.views,
        tickets: data.tickets.slice(0, 300), // Protect against huge payloads
        efforts: data.efforts
      };

      let fetchUrl = sheetUrl;
      // If web browser CORS happens, can route through proxy or direct
      const response = await fetch(fetchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8' // Text/plain avoids CORS preflight OPTIONS in Apps Script
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const resJson = await response.json();
      if (resJson.status === 'ERROR') {
        throw new Error(resJson.message || 'Sheet returned error');
      }

      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      this.setLastSyncTime(nowStr);

      return { success: true };
    } catch (err: any) {
      console.warn('[SheetSync] syncAllToSheet failed:', err);
      return { success: false, message: err.message || 'Failed to sync to Google Sheet' };
    }
  },

  /**
   * Fetches the complete snapshot from Google Sheet to rehydrate local database & state if cache was cleared.
   */
  async restoreFromSheet(): Promise<{ success: boolean; data?: SheetBackupData; message?: string }> {
    const sheetUrl = this.getSheetUrl();
    if (!sheetUrl) {
      return { success: false, message: 'Google Sheet Webhook URL not configured' };
    }

    try {
      let fetchUrl = sheetUrl;
      const response = await fetch(fetchUrl, {
        method: 'GET'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const json = await response.json();
      if (json.status !== 'SUCCESS' || !json.data) {
        throw new Error(json.message || 'Invalid data returned from Google Sheet');
      }

      const payload: SheetBackupData = json.data;

      // Hydrate IndexedDB
      if (payload.projects && payload.projects.length > 0) {
        await db.setMeta('projects', payload.projects);
      }
      if (payload.statuses && payload.statuses.length > 0) {
        await db.setMeta('statuses', payload.statuses);
      }
      if (payload.types && payload.types.length > 0) {
        await db.setMeta('types', payload.types);
      }
      if (payload.views && payload.views.length > 0) {
        await db.putSavedViews(payload.views);
      }
      if (payload.tickets && payload.tickets.length > 0) {
        await db.putTickets(payload.tickets);
      }
      if (payload.efforts && payload.efforts.length > 0) {
        await db.putEfforts(payload.efforts);
      }
      if (payload.currentUser) {
        await db.setMeta('currentUser', payload.currentUser);
      }

      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      this.setLastSyncTime(nowStr);

      return { success: true, data: payload };
    } catch (err: any) {
      console.warn('[SheetSync] restoreFromSheet failed:', err);
      return { success: false, message: err.message || 'Failed to restore from Google Sheet' };
    }
  },

  /**
   * Asynchronously posts a newly logged effort to Google Sheet without blocking UI.
   */
  async logEffortAsync(effort: LocalEffort, currentUser: { id: string; name: string }): Promise<void> {
    const sheetUrl = this.getSheetUrl();
    if (!sheetUrl) return;

    try {
      await fetch(sheetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'LOG_EFFORT',
          effort,
          currentUser
        })
      });
    } catch (e) {
      console.warn('[SheetSync] Background log effort to sheet failed:', e);
    }
  },

  /**
   * Asynchronously posts a saved view to Google Sheet.
   */
  async saveViewAsync(view: SavedView): Promise<void> {
    const sheetUrl = this.getSheetUrl();
    if (!sheetUrl) return;

    try {
      await fetch(sheetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'SAVE_VIEW',
          view
        })
      });
    } catch (e) {
      console.warn('[SheetSync] Background save view to sheet failed:', e);
    }
  }
};
