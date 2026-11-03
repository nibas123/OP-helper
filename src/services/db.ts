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
  type: 'UPDATE_STATUS' | 'UPDATE_ASSIGNEE' | 'LOG_TIME' | 'UPDATE_TIME' | 'DELETE_TIME';
  payload: any;
  createdAt: string;
  retryCount: number;
}

export interface LookupItem {
  id: string;
  name: string;
  isClosed?: boolean;
}

export interface ProjectAssigneeRecord {
  projectId: string;
  members: LookupItem[];
  updatedAt: number;
}

export interface ViewFilters {
  statusCategory?: 'all' | 'open' | 'closed';
  statusId?: string;
  statusIds?: string[]; // Multiple status selection
  project?: string;
  projectId?: string;
  projects?: string[]; // Multiple project selection
  type?: string;
  types?: string[];
  assignee?: string; // 'all' | 'me' | 'unassigned' | specific userId/name
  priority?: string;
  starredOnly?: boolean;
  sortBy?: 'updated_desc' | 'updated_asc' | 'id_desc' | 'id_asc' | 'priority';
}

export interface SavedView {
  id: string;
  name: string;
  isFavorite: boolean;
  isSystem: boolean;
  isDefault?: boolean;
  createdAt: string;
  filters: ViewFilters;
}

export const DEFAULT_SAVED_VIEWS: SavedView[] = [
  {
    id: 'sys_all_open',
    name: 'All Open',
    isFavorite: true,
    isSystem: true,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00Z',
    filters: {
      statusCategory: 'open',
      sortBy: 'updated_desc'
    }
  },
  {
    id: 'sys_assigned_to_me',
    name: 'Assigned to Me',
    isFavorite: true,
    isSystem: true,
    createdAt: '2026-01-01T00:00:00Z',
    filters: {
      statusCategory: 'open',
      assignee: 'me',
      sortBy: 'updated_desc'
    }
  },
  {
    id: 'sys_starred',
    name: 'Starred Tasks',
    isFavorite: true,
    isSystem: true,
    createdAt: '2026-01-01T00:00:00Z',
    filters: {
      statusCategory: 'all',
      starredOnly: true,
      sortBy: 'updated_desc'
    }
  },
  {
    id: 'sys_recently_updated',
    name: 'Recently Updated',
    isFavorite: false,
    isSystem: true,
    createdAt: '2026-01-01T00:00:00Z',
    filters: {
      statusCategory: 'all',
      sortBy: 'updated_desc'
    }
  },
  {
    id: 'sys_closed',
    name: 'Closed',
    isFavorite: false,
    isSystem: true,
    createdAt: '2026-01-01T00:00:00Z',
    filters: {
      statusCategory: 'closed',
      sortBy: 'updated_desc'
    }
  },
  {
    id: 'sys_everything',
    name: 'Everything',
    isFavorite: false,
    isSystem: true,
    createdAt: '2026-01-01T00:00:00Z',
    filters: {
      statusCategory: 'all',
      sortBy: 'updated_desc'
    }
  }
];

const DB_NAME = 'op_mobile_pwa_db';
const DB_VERSION = 3;

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

        // Saved Views Store (Views feature similar to OpenProject)
        if (!db.objectStoreNames.contains('savedViews')) {
          db.createObjectStore('savedViews', { keyPath: 'id' });
        }

        // Project-Specific Assignees Store
        if (!db.objectStoreNames.contains('projectAssignees')) {
          db.createObjectStore('projectAssignees', { keyPath: 'projectId' });
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

  async deleteEffort(id: string): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('efforts', 'readwrite');
      const store = tx.objectStore('efforts');
      store.delete(id);
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

  // --- Project Specific Assignees ---

  async getProjectAssignees(projectId: string): Promise<LookupItem[] | null> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projectAssignees', 'readonly');
      const store = tx.objectStore('projectAssignees');
      const req = store.get(projectId);
      req.onsuccess = () => {
        const res = req.result as ProjectAssigneeRecord | undefined;
        resolve(res ? res.members : null);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async putProjectAssignees(projectId: string, members: LookupItem[]): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projectAssignees', 'readwrite');
      const store = tx.objectStore('projectAssignees');
      const record: ProjectAssigneeRecord = {
        projectId,
        members,
        updatedAt: Date.now()
      };
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getAllProjectAssignees(): Promise<Record<string, LookupItem[]>> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projectAssignees', 'readonly');
      const store = tx.objectStore('projectAssignees');
      const req = store.getAll();
      req.onsuccess = () => {
        const records = (req.result || []) as ProjectAssigneeRecord[];
        const map: Record<string, LookupItem[]> = {};
        for (const r of records) {
          map[r.projectId] = r.members;
        }
        resolve(map);
      };
      req.onerror = () => reject(req.error);
    });
  }

  // --- Saved Views ---

  async getSavedViews(): Promise<SavedView[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('savedViews', 'readonly');
      const store = tx.objectStore('savedViews');
      const req = store.getAll();
      req.onsuccess = async () => {
        let results = (req.result || []) as SavedView[];
        if (results.length === 0) {
          // Initialize default system views
          await this.putSavedViews(DEFAULT_SAVED_VIEWS);
          results = [...DEFAULT_SAVED_VIEWS];
        }
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async putSavedView(view: SavedView): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('savedViews', 'readwrite');
      const store = tx.objectStore('savedViews');
      store.put(view);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async putSavedViews(views: SavedView[]): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('savedViews', 'readwrite');
      const store = tx.objectStore('savedViews');
      for (const v of views) {
        store.put(v);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteSavedView(id: string): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('savedViews', 'readwrite');
      const store = tx.objectStore('savedViews');
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async toggleFavoriteView(id: string): Promise<boolean> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('savedViews', 'readwrite');
      const store = tx.objectStore('savedViews');
      const req = store.get(id);
      req.onsuccess = () => {
        const view = req.result as SavedView | undefined;
        if (!view) {
          resolve(false);
          return;
        }
        view.isFavorite = !view.isFavorite;
        store.put(view);
        resolve(view.isFavorite);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async setDefaultSavedView(id: string): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['savedViews', 'meta'], 'readwrite');
      const store = tx.objectStore('savedViews');
      const metaStore = tx.objectStore('meta');

      const req = store.getAll();
      req.onsuccess = () => {
        const views = (req.result || []) as SavedView[];
        for (const v of views) {
          const wasDefault = !!v.isDefault;
          const shouldBeDefault = v.id === id;
          if (wasDefault !== shouldBeDefault) {
            v.isDefault = shouldBeDefault;
            store.put(v);
          }
        }
        metaStore.put({ key: 'defaultViewId', value: id });
      };

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
