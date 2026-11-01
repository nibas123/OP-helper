import type { LookupItem } from '../services/db';

export const DEFAULT_STATUSES: LookupItem[] = [
  { id: '1', name: 'New' },
  { id: '2', name: 'In specification' },
  { id: '3', name: 'Specified' },
  { id: '4', name: 'Confirmed' },
  { id: '5', name: 'To be scheduled' },
  { id: '6', name: 'Scheduled' },
  { id: '7', name: 'In progress' },
  { id: '8', name: 'In development' },
  { id: '9', name: 'Developed' },
  { id: '10', name: 'In testing' },
  { id: '11', name: 'Tested' },
  { id: '12', name: 'Test failed' },
  { id: '13', name: 'Closed' },
  { id: '14', name: 'On hold' },
  { id: '15', name: 'Rejected' },
  { id: '16', name: 'Completed' }
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
