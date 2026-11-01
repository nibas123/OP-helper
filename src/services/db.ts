/**
 * High-performance, zero-dependency IndexedDB storage for Offline-First Mobile PWA.
 */

export interface LocalTicket {
  id: number;
  subject: string;
  description?: string;
  type?: string;
  typeId?: string;
  project: string;
  projectId?: string;
  status: string;
  statusId: string;
  priority: string;
  priorityId?: string;
  assignee: string;
  assigneeId?: string;
  estimatedTime?: string;
  spentTime?: string;
  lockVersion: number;
  createdAt?: string;
  updatedAt: string;
  pendingSync?: boolean;
  starred?: boolean;
}

export interface LocalEffort {
  id: string;
  workPackageId: number;
  ticketSubject?: string;
  hours: number;
  comment: string;
  spentOn: string; // YYYY-MM-DD
  createdAt: string;
  pendingSync?: boolean;
}

export interface SyncQueueItem {
  id: string;
  type: 'UPDATE_STATUS' | 'UPDATE_ASSIGNEE' | 'LOG_TIME';
  payload: any;
  createdAt: string;
  retryCount: number;
}

export interface LookupItem {
  id: string;
  name: string;
}

const DB_NAME = 'op_mobile_pwa_db';
const DB_VERSION = 2;

class LocalDatabase {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private openDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB is not supported in this environment'));
        return;
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Tickets Store
        if (!db.objectStoreNames.contains('tickets')) {
          const ticketStore = db.createObjectStore('tickets', { keyPath: 'id' });
          ticketStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          ticketStore.createIndex('status', 'status', { unique: false });
          ticketStore.createIndex('assignee', 'assignee', { unique: false });
        }

        // Efforts Store
        if (!db.objectStoreNames.contains('efforts')) {
          const effortStore = db.createObjectStore('efforts', { keyPath: 'id' });
          effortStore.createIndex('spentOn', 'spentOn', { unique: false });
          effortStore.createIndex('workPackageId', 'workPackageId', { unique: false });
        }

        // Sync Queue Store
        if (!db.objectStoreNames.contains('syncQueue')) {
          db.createObjectStore('syncQueue', { keyPath: 'id' });
        }

        // Meta Store
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }

        // Statuses Store (Real OP Statuses)
        if (!db.objectStoreNames.contains('statuses')) {
          db.createObjectStore('statuses', { keyPath: 'id' });
        }

        // Types Store
        if (!db.objectStoreNames.contains('types')) {
          db.createObjectStore('types', { keyPath: 'id' });
        }

        // Users Store
        if (!db.objectStoreNames.contains('users')) {
          db.createObjectStore('users', { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  // --- Tickets ---

  async getAllTickets(): Promise<LocalTicket[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tickets', 'readonly');
      const store = tx.objectStore('tickets');
      const request = store.getAll();
      request.onsuccess = () => {
        const results = (request.result || []) as LocalTicket[];
        // Starred tickets first, then newest updated
        results.sort((a, b) => {
          if (a.starred && !b.starred) return -1;
          if (!a.starred && b.starred) return 1;
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() || b.id - a.id;
        });
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getTicket(id: number): Promise<LocalTicket | null> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tickets', 'readonly');
      const store = tx.objectStore('tickets');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async putTickets(tickets: LocalTicket[]): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tickets', 'readwrite');
      const store = tx.objectStore('tickets');
      for (const t of tickets) {
        store.put(t);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async putTicket(ticket: LocalTicket): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tickets', 'readwrite');
      const store = tx.objectStore('tickets');
      store.put(ticket);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async toggleStarTicket(id: number): Promise<boolean> {
    const ticket = await this.getTicket(id);
    if (!ticket) return false;
    const newStarred = !ticket.starred;
    ticket.starred = newStarred;
    await this.putTicket(ticket);
    return newStarred;
  }

  // --- Efforts ---

  async getAllEfforts(): Promise<LocalEffort[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('efforts', 'readonly');
      const store = tx.objectStore('efforts');
      const request = store.getAll();
      request.onsuccess = () => {
        const results = (request.result || []) as LocalEffort[];
        results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getEffortsForDate(dateStr: string): Promise<LocalEffort[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('efforts', 'readonly');
      const store = tx.objectStore('efforts');
      const index = store.index('spentOn');
      const request = index.getAll(dateStr);
      request.onsuccess = () => resolve((request.result || []) as LocalEffort[]);
      request.onerror = () => reject(request.error);
    });
  }

  async putEffort(effort: LocalEffort): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('efforts', 'readwrite');
      const store = tx.objectStore('efforts');
      store.put(effort);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async putEfforts(efforts: LocalEffort[]): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('efforts', 'readwrite');
      const store = tx.objectStore('efforts');
      for (const e of efforts) {
        store.put(e);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- Statuses / Types / Users Lookups ---

  async getStatuses(): Promise<LookupItem[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('statuses', 'readonly');
      const store = tx.objectStore('statuses');
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result || []) as LookupItem[]);
      req.onerror = () => reject(req.error);
    });
  }

  async putStatuses(items: LookupItem[]): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('statuses', 'readwrite');
      const store = tx.objectStore('statuses');
      for (const item of items) {
        store.put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getTypes(): Promise<LookupItem[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('types', 'readonly');
      const store = tx.objectStore('types');
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result || []) as LookupItem[]);
      req.onerror = () => reject(req.error);
    });
  }

  async putTypes(items: LookupItem[]): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('types', 'readwrite');
      const store = tx.objectStore('types');
      for (const item of items) {
        store.put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getUsers(): Promise<LookupItem[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('users', 'readonly');
      const store = tx.objectStore('users');
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result || []) as LookupItem[]);
      req.onerror = () => reject(req.error);
    });
  }

  async putUsers(items: LookupItem[]): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('users', 'readwrite');
      const store = tx.objectStore('users');
      for (const item of items) {
        store.put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- Sync Queue ---

  async getSyncQueue(): Promise<SyncQueueItem[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('syncQueue', 'readonly');
      const store = tx.objectStore('syncQueue');
      const request = store.getAll();
      request.onsuccess = () => resolve((request.result || []) as SyncQueueItem[]);
      request.onerror = () => reject(request.error);
    });
  }

  async enqueueSyncItem(item: SyncQueueItem): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('syncQueue', 'readwrite');
      const store = tx.objectStore('syncQueue');
      store.put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async removeSyncItem(id: string): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('syncQueue', 'readwrite');
      const store = tx.objectStore('syncQueue');
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- Metadata ---

  async getMeta<T = any>(key: string): Promise<T | null> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('meta', 'readonly');
      const store = tx.objectStore('meta');
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result ? request.result.value : null);
      request.onerror = () => reject(request.error);
    });
  }

  async setMeta(key: string, value: any): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('meta', 'readwrite');
      const store = tx.objectStore('meta');
      store.put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const db = new LocalDatabase();
