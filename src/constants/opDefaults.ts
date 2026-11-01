import type { LookupItem } from '../services/db';

export const DEFAULT_STATUSES: LookupItem[] = [
  { id: '1', name: 'New', isClosed: false },
  { id: '2', name: 'In specification', isClosed: false },
  { id: '3', name: 'Specified', isClosed: false },
  { id: '4', name: 'Confirmed', isClosed: false },
  { id: '5', name: 'To be scheduled', isClosed: false },
  { id: '6', name: 'Scheduled', isClosed: false },
  { id: '7', name: 'In progress', isClosed: false },
  { id: '8', name: 'In development', isClosed: false },
  { id: '9', name: 'Developed', isClosed: false },
  { id: '10', name: 'In testing', isClosed: false },
  { id: '11', name: 'Tested', isClosed: true },
  { id: '12', name: 'Test failed', isClosed: false },
  { id: '13', name: 'Closed', isClosed: true },
  { id: '14', name: 'On hold', isClosed: false },
  { id: '15', name: 'Rejected', isClosed: true },
  { id: '16', name: 'Completed', isClosed: false }
];

export const DEFAULT_TYPES: LookupItem[] = [
  { id: '1', name: 'Task' },
  { id: '2', name: 'Milestone' },
  { id: '3', name: 'Phase' },
  { id: '4', name: 'Feature' },
  { id: '5', name: 'Epic' },
  { id: '6', name: 'User story' },
  { id: '7', name: 'Bug' },
  { id: '8', name: 'Change Request' },
  { id: '11', name: 'Test Idea' },
  { id: '12', name: 'DevOps Deployment' },
  { id: '13', name: 'DevOps Task' },
  { id: '14', name: 'Security Incidents' },
  { id: '16', name: 'Change Management' },
  { id: '17', name: 'Development Task' },
  { id: '18', name: 'DevOps_test' }
];

export const DEFAULT_PRIORITIES: LookupItem[] = [
  { id: '1', name: 'Low' },
  { id: '2', name: 'Normal' },
  { id: '3', name: 'High' },
  { id: '4', name: 'Immediate' }
];
