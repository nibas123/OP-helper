import axios from 'axios';

const STORAGE_KEYS = {
  URL: 'op_url',
  API_KEY: 'op_api_key'
};

const DEFAULT_URL = 'https://openproject.fingent.net';

/**
 * Utility to get credentials from localStorage or chrome.storage
 */
async function getCredentials(): Promise<{ url: string; apiKey: string }> {
  // 1. Check localStorage first (instant for standalone PWA / Mobile Web)
  if (typeof window !== 'undefined' && window.localStorage) {
    const localUrl = window.localStorage.getItem(STORAGE_KEYS.URL);
    const localApiKey = window.localStorage.getItem(STORAGE_KEYS.API_KEY);
    if (localUrl && localApiKey) {
      return { url: localUrl, apiKey: localApiKey };
    }
  }

  // 2. Check chrome.storage as fallback (when running in extension)
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    const result = await new Promise<{ url: string; apiKey: string }>((resolve) => {
      chrome.storage.sync.get([STORAGE_KEYS.URL, STORAGE_KEYS.API_KEY], (res) => {
        resolve({
          url: (res[STORAGE_KEYS.URL] as string) || DEFAULT_URL,
          apiKey: (res[STORAGE_KEYS.API_KEY] as string) || ''
        });
      });
    });
    if (result.apiKey) return result;
  }

  // Fallback default
  const fallbackUrl = (typeof window !== 'undefined' && window.localStorage?.getItem(STORAGE_KEYS.URL)) || DEFAULT_URL;
  const fallbackKey = (typeof window !== 'undefined' && window.localStorage?.getItem(STORAGE_KEYS.API_KEY)) || '';
  return { url: fallbackUrl, apiKey: fallbackKey };
}

/**
 * Utility to save credentials to both localStorage and chrome.storage
 */
async function saveCredentials(url: string, apiKey: string): Promise<void> {
  const cleanUrl = url.trim().replace(/\/+$/, '');
  const cleanKey = apiKey.trim();

  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEYS.URL, cleanUrl);
    window.localStorage.setItem(STORAGE_KEYS.API_KEY, cleanKey);
  }

  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    chrome.storage.sync.set({
      [STORAGE_KEYS.URL]: cleanUrl,
      [STORAGE_KEYS.API_KEY]: cleanKey
    });
  }
}

/**
 * Creates an authenticated Axios instance
 */
async function getApiClient() {
  const { url, apiKey } = await getCredentials();

  if (!apiKey) {
    throw new Error('API key is not configured. Please set your API key in Settings.');
  }

  const baseUrl = (url || DEFAULT_URL).trim().replace(/\/+$/, '');
  const encodedToken = btoa(`apikey:${apiKey.trim()}`);

  return axios.create({
    baseURL: `${baseUrl}/api/v3`,
    headers: {
      'Authorization': `Basic ${encodedToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    timeout: 10000 // 10s timeout for mobile resilience
  });
}

export const OpenProjectService = {
  getCredentials,
  saveCredentials,

  hasCredentials: async (): Promise<boolean> => {
    const { apiKey } = await getCredentials();
    return !!apiKey;
  },

  getApiClient: async () => {
    return await getApiClient();
  },

  getWorkPackages: async (pageSize = 50) => {
    const client = await getApiClient();
    const response = await client.get(`/work_packages?pageSize=${pageSize}&sortBy=[["updated_at","desc"]]`);
    return response.data;
  },

  getWorkPackage: async (id: number | string) => {
    const client = await getApiClient();
    const response = await client.get(`/work_packages/${id}`);
    return response.data;
  },

  getStatuses: async () => {
    const client = await getApiClient();
    const response = await client.get('/statuses');
    return response.data;
  },

  getProjects: async () => {
    const client = await getApiClient();
    const response = await client.get('/projects');
    return response.data;
  },

  getTypes: async () => {
    const client = await getApiClient();
    const response = await client.get('/types');
    return response.data;
  },

  getPriorities: async () => {
    const client = await getApiClient();
    const response = await client.get('/priorities');
    return response.data;
  },

  getCurrentUser: async () => {
    const client = await getApiClient();
    const response = await client.get('/users/me');
    return response.data;
  },

  getProjectMembers: async (projectId: number | string) => {
    const client = await getApiClient();
    const response = await client.get(`/projects/${projectId}/available_assignees`);
    return response.data;
  },

  getUsers: async () => {
    const client = await getApiClient();
    const response = await client.get('/users?pageSize=100');
    return response.data;
  },

  searchWorkPackages: async (query: string) => {
    const client = await getApiClient();
    const trimmed = query.trim();
    // If it's a numeric ID, search by ID or subject
    const filters = [{ "subjectOrId": { "operator": "**", "values": [trimmed] } }];
    const filterStr = JSON.stringify(filters);
    const response = await client.get(`/work_packages?filters=${encodeURIComponent(filterStr)}&pageSize=20`);
    return response.data;
  },

  getTimeEntriesActivities: async () => {
    const client = await getApiClient();
    const response = await client.get('/time_entries/activities');
    return response.data;
  },

  updateWorkPackageStatus: async (id: number | string, statusId: string, lockVersion: number) => {
    const client = await getApiClient();
    const payload = {
      lockVersion,
      _links: {
        status: { href: `/api/v3/statuses/${statusId}` }
      }
    };
    const response = await client.patch(`/work_packages/${id}`, payload);
    return response.data;
  },

  updateWorkPackageAssignee: async (id: number | string, assigneeId: string, lockVersion: number) => {
    const client = await getApiClient();
    const payload = {
      lockVersion,
      _links: {
        assignee: { href: `/api/v3/users/${assigneeId}` }
      }
    };
    const response = await client.patch(`/work_packages/${id}`, payload);
    return response.data;
  },

  logTime: async (workPackageId: number | string, hours: string, comment: string, date: string, activityId?: string) => {
    const client = await getApiClient();
    const payload: any = {
      hours,
      comment: { format: 'plain', raw: comment },
      spentOn: date,
      _links: {
        workPackage: { href: `/api/v3/work_packages/${workPackageId}` }
      }
    };
    if (activityId) {
      payload._links.activity = { href: `/api/v3/time_entries/activities/${activityId}` };
    }
    const response = await client.post(`/time_entries`, payload);
    return response.data;
  },

  getMyTimeEntries: async (pageSize = 100) => {
    const client = await getApiClient();
    const filter = JSON.stringify([{ "user": { "operator": "=", "values": ["me"] } }]);
    const response = await client.get(`/time_entries?filters=${encodeURIComponent(filter)}&pageSize=${pageSize}&sortBy=[["spent_on","desc"]]`);
    return response.data;
  },

  getTimeEntriesForDate: async (dateStr: string) => {
    const client = await getApiClient();
    const filter = JSON.stringify([
      { "user": { "operator": "=", "values": ["me"] } },
      { "spentOn": { "operator": "=d", "values": [dateStr] } }
    ]);
    const response = await client.get(`/time_entries?filters=${encodeURIComponent(filter)}&pageSize=100`);
    return response.data;
  },

  getTimeEntriesForDateRange: async (startDate: string, endDate: string) => {
    const client = await getApiClient();
    const filter = JSON.stringify([
      { "user": { "operator": "=", "values": ["me"] } },
      { "spentOn": { "operator": "<>d", "values": [startDate, endDate] } }
    ]);
    const response = await client.get(`/time_entries?filters=${encodeURIComponent(filter)}&pageSize=200&sortBy=[["spent_on","desc"]]`);
    return response.data;
  },

  addComment: async (id: number | string, comment: string, lockVersion: number) => {
    const client = await getApiClient();
    const payload = {
      lockVersion,
      comment: { format: 'plain', raw: comment }
    };
    const response = await client.patch(`/work_packages/${id}`, payload);
    return response.data;
  },

  uploadAttachment: async (workPackageId: number | string, file: File) => {
    const client = await getApiClient();
    const formData = new FormData();
    formData.append('file', file);
    const metadata = {
      fileName: file.name,
      description: { format: 'plain', raw: '' }
    };
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));

    const response = await client.post(`/work_packages/${workPackageId}/attachments`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  }
};
