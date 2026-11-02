import { db, type LocalTicket, type LocalEffort, type LookupItem, type SavedView } from './db';
import { OpenProjectService } from './OpenProjectService';

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
 * Validates the Google Apps Script Web App URL
 */
function validateSheetUrl(rawUrl: string): { valid: boolean; error?: string; cleanUrl: string } {
  const clean = rawUrl.trim();
  if (!clean) {
    return { valid: false, error: 'Please enter a Google Apps Script Web App URL', cleanUrl: '' };
  }
  if (clean.includes('docs.google.com/spreadsheets')) {
    return {
      valid: false,
      error: 'You pasted the Google Sheet spreadsheet link! You need the Apps Script Web App URL ending in /exec (Extensions > Apps Script > Deploy > Web app).',
      cleanUrl: clean
    };
  }
  if (!clean.startsWith('https://script.google.com/')) {
    return {
      valid: false,
      error: 'URL must start with https://script.google.com/macros/s/.../exec',
      cleanUrl: clean
    };
  }
  if (clean.endsWith('/dev')) {
    return {
      valid: false,
      error: 'You pasted the /dev test URL. Please use the production /exec URL from Deploy > New deployment.',
      cleanUrl: clean
    };
  }
  return { valid: true, cleanUrl: clean };
}

/**
 * Universal request sender with automatic Edge CORS Proxy fallback
 */
async function sendToAppsScript(url: string, method: 'GET' | 'POST', body?: any): Promise<any> {
  const options: RequestInit = {
    method,
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    }
  };
  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
  }

  // 1. Try Direct Fetch first
  try {
    const res = await fetch(url, options);
    const text = await res.text();

    if (text.includes('accounts.google.com') || text.includes('Sign in - Google Accounts')) {
      throw new Error("Permission Denied: Ensure 'Who has access' is set to 'Anyone' in your Google Apps Script deployment.");
    }

    try {
      return JSON.parse(text);
    } catch {
      if (res.ok) {
        return { status: 'SUCCESS' };
      }
      throw new Error(`Google Sheet returned invalid response: ${text.slice(0, 100)}`);
    }
  } catch (directErr: any) {
    console.warn('[SheetSync] Direct fetch failed, trying Edge CORS proxy...', directErr.message);

    // If permission error, don't retry proxy, rethrow directly
    if (directErr.message && directErr.message.includes('Permission Denied')) {
      throw directErr;
    }

    // 2. Fallback to serverless CORS proxy
    const proxyUrl = `/api/proxy?endpoint=${encodeURIComponent(url)}`;
    const proxyRes = await fetch(proxyUrl, options);
    const proxyText = await proxyRes.text();

    if (proxyText.includes('accounts.google.com') || proxyText.includes('Sign in - Google Accounts')) {
      throw new Error("Permission Denied: Ensure 'Who has access' is set to 'Anyone' in your Google Apps Script deployment.");
    }

    try {
      return JSON.parse(proxyText);
    } catch {
      if (proxyRes.ok) {
        return { status: 'SUCCESS' };
      }
      throw new Error(`Proxy response error: ${proxyText.slice(0, 100)}`);
    }
  }
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
    const validation = validateSheetUrl(sheetUrl);
    if (!validation.valid) {
      return { success: false, message: validation.error };
    }

    try {
      const creds = await OpenProjectService.getCredentials();
      const payload = {
        action: 'SYNC_ALL',
        opUrl: creds.url,
        timestamp: new Date().toISOString(),
        currentUser: data.currentUser,
        projects: data.projects,
        statuses: data.statuses,
        types: data.types,
        views: data.views,
        tickets: data.tickets.slice(0, 300), // Protect against huge payloads
        efforts: data.efforts
      };

      const resJson = await sendToAppsScript(validation.cleanUrl, 'POST', payload);
      if (resJson && resJson.status === 'ERROR') {
        throw new Error(resJson.message || 'Google Apps Script reported an error');
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
    const validation = validateSheetUrl(sheetUrl);
    if (!validation.valid) {
      return { success: false, message: validation.error };
    }

    try {
      const json = await sendToAppsScript(validation.cleanUrl, 'GET');
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
   * Asynchronously syncs a single ticket to Google Sheet (for My_Assigned_Tickets).
   */
  async syncTicketAsync(ticket: LocalTicket, currentUser: { id: string; name: string }): Promise<void> {
    const sheetUrl = this.getSheetUrl();
    const validation = validateSheetUrl(sheetUrl);
    if (!validation.valid) return;

    try {
      const creds = await OpenProjectService.getCredentials();
      await sendToAppsScript(validation.cleanUrl, 'POST', {
        action: 'SYNC_TICKET',
        opUrl: creds.url,
        ticket,
        currentUser
      });
    } catch (e) {
      console.warn('[SheetSync] Background sync ticket to sheet failed:', e);
    }
  },

  /**
   * Asynchronously posts a newly logged effort to Google Sheet without blocking UI.
   */
  async logEffortAsync(effort: LocalEffort, currentUser: { id: string; name: string }): Promise<void> {
    const sheetUrl = this.getSheetUrl();
    const validation = validateSheetUrl(sheetUrl);
    if (!validation.valid) return;

    try {
      await sendToAppsScript(validation.cleanUrl, 'POST', {
        action: 'LOG_EFFORT',
        effort,
        currentUser
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
    const validation = validateSheetUrl(sheetUrl);
    if (!validation.valid) return;

    try {
      await sendToAppsScript(validation.cleanUrl, 'POST', {
        action: 'SAVE_VIEW',
        view
      });
    } catch (e) {
      console.warn('[SheetSync] Background save view to sheet failed:', e);
    }
  }
};
