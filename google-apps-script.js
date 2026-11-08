/**
 * ==============================================================================
 * OP HELPER - GOOGLE APPS SCRIPT DATABASE & EXCEL SYNC
 * ==============================================================================
 * This script turns your Google Sheet into a live REST database for OP Helper.
 * It manages:
 *  1. My_Assigned_Tickets - Permanent inventory of all tickets assigned to your name.
 *                           Keeps updating statuses and never deletes past tickets.
 *  2. Efforts_Log         - Full timesheet log with dates, hours, and work comments.
 *  3. Tickets_Snapshot    - All active tickets snapshot.
 *  4. Config_Views        - Custom saved views and filter definitions.
 *  5. Config_Static       - Projects, statuses, types, and user master data.
 *
 * HOW TO DEPLOY / UPDATE:
 *  1. In Google Sheets, go to: Extensions -> Apps Script.
 *  2. Replace all existing text with this code.
 *  3. Click "Deploy" -> "Manage deployments".
 *  4. Click the Pencil (Edit) icon.
 *  5. Set Version to: "New version".
 *  6. Ensure "Who has access" is set to: "Anyone".
 *  7. Click "Deploy" and copy the Web App URL (ends with /exec).
 * ==============================================================================
 */

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const data = restoreAllDataFromSheet(ss);
    return ContentService.createTextOutput(JSON.stringify({ status: 'SUCCESS', data: data }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'ERROR', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const rawContent = e.postData.contents;
    const payload = JSON.parse(rawContent);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const action = payload.action || 'SYNC_ALL';

    if (action === 'SYNC_ALL') {
      saveAllDataToSheet(ss, payload);
    } else if (action === 'LOG_EFFORT') {
      appendEffortToSheet(ss, payload.effort, payload.currentUser);
    } else if (action === 'SYNC_TICKET') {
      syncSingleTicketToAssignedSheet(ss, payload.ticket, payload.currentUser, payload.opUrl);
    } else if (action === 'SAVE_VIEW') {
      saveViewToSheet(ss, payload.view);
    } else if (action === 'DELETE_EFFORT') {
      deleteEffortFromSheet(ss, payload.id);
    } else if (action === 'GET_ALL') {
      const data = restoreAllDataFromSheet(ss);
      return ContentService.createTextOutput(JSON.stringify({ status: 'SUCCESS', data: data }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'SUCCESS',
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'ERROR',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// -----------------------------------------------------------------------------
// SAVE ALL DATA (FULL BACKUP / DUAL-SYNC)
// -----------------------------------------------------------------------------
function saveAllDataToSheet(ss, payload) {
  const nowStr = new Date().toLocaleString();

  // 1. My Assigned Tickets (Intelligent Upsert - Keeps all tickets assigned to your name)
  syncAssignedTickets(ss, payload.tickets, payload.currentUser, payload.opUrl);

  // 2. Static Configuration & Master Tables
  const configSheet = getOrCreateSheet(ss, 'Config_Static', ['Type', 'ID', 'Name', 'Extra', 'Updated At']);
  configSheet.clearContents();
  configSheet.appendRow(['Type', 'ID', 'Name', 'Extra', 'Updated At']);
  formatHeaderRow(configSheet, 5);

  const configRows = [];
  if (payload.currentUser) {
    configRows.push(['CurrentUser', payload.currentUser.id, payload.currentUser.name, '', nowStr]);
  }
  if (payload.opUrl) {
    configRows.push(['OpConfig', 'opUrl', payload.opUrl, payload.opApiKey || '', nowStr]);
  }
  if (payload.projects && payload.projects.length > 0) {
    payload.projects.forEach(p => configRows.push(['Project', p.id, p.name, p.identifier || '', nowStr]));
  }
  if (payload.statuses && payload.statuses.length > 0) {
    payload.statuses.forEach(s => configRows.push(['Status', s.id, s.name, s.isClosed ? 'Closed' : 'Open', nowStr]));
  }
  if (payload.types && payload.types.length > 0) {
    payload.types.forEach(t => configRows.push(['Type', t.id, t.name, '', nowStr]));
  }
  if (configRows.length > 0) {
    configSheet.getRange(2, 1, configRows.length, 5).setValues(configRows);
  }

  // 3. Saved Views
  const viewsSheet = getOrCreateSheet(ss, 'Config_Views', ['View ID', 'Name', 'Is Favorite', 'Filters JSON', 'Updated At']);
  viewsSheet.clearContents();
  viewsSheet.appendRow(['View ID', 'Name', 'Is Favorite', 'Filters JSON', 'Updated At']);
  formatHeaderRow(viewsSheet, 5);

  if (payload.views && payload.views.length > 0) {
    const viewRows = payload.views.map(v => [
      v.id,
      v.name,
      v.isFavorite ? 'TRUE' : 'FALSE',
      JSON.stringify(v.filters || {}),
      nowStr
    ]);
    viewsSheet.getRange(2, 1, viewRows.length, 5).setValues(viewRows);
  }

  // 4. Efforts Log
  const effortsSheet = getOrCreateSheet(ss, 'Efforts_Log', [
    'Log ID', 'Date', 'Ticket #', 'Subject', 'Hours', 'User', 'Comment', 'Synced At'
  ]);
  if (payload.efforts && payload.efforts.length > 0) {
    effortsSheet.clearContents();
    effortsSheet.appendRow(['Log ID', 'Date', 'Ticket #', 'Subject', 'Hours', 'User', 'Comment', 'Synced At']);
    formatHeaderRow(effortsSheet, 8);

    const effortRows = payload.efforts.map(e => [
      e.id,
      e.spentOn || '',
      e.workPackageId || '',
      e.ticketSubject || '',
      e.hours || 0,
      payload.currentUser ? payload.currentUser.name : 'Nibas Nazeem',
      e.comment || '',
      nowStr
    ]);
    effortsSheet.getRange(2, 1, effortRows.length, 8).setValues(effortRows);
  }

  // 5. All Tickets Snapshot
  const ticketsSheet = getOrCreateSheet(ss, 'Tickets_Snapshot', [
    'Ticket #', 'Project', 'Subject', 'Status', 'Assignee', 'Spent', 'Estimated', 'Updated At'
  ]);
  if (payload.tickets && payload.tickets.length > 0) {
    ticketsSheet.clearContents();
    ticketsSheet.appendRow(['Ticket #', 'Project', 'Subject', 'Status', 'Assignee', 'Spent', 'Estimated', 'Updated At']);
    formatHeaderRow(ticketsSheet, 8);

    const ticketRows = payload.tickets.map(t => [
      t.id,
      t.project || '',
      t.subject || '',
      t.status || '',
      t.assignee || 'Unassigned',
      t.spentTime || '',
      t.estimatedTime || '',
      t.updatedAt || nowStr
    ]);
    ticketsSheet.getRange(2, 1, ticketRows.length, 8).setValues(ticketRows);
  }
}

// -----------------------------------------------------------------------------
// SYNC ASSIGNED TICKETS (MY_ASSIGNED_TICKETS TAB)
// -----------------------------------------------------------------------------
function syncAssignedTickets(ss, tickets, currentUser, opUrl) {
  if (!tickets || tickets.length === 0) return;

  const baseUrl = (opUrl || 'https://openproject.fingent.net').replace(/\/+$/, '');
  const myName = (currentUser && currentUser.name) ? String(currentUser.name).toLowerCase().trim() : 'nibas';
  const myId = (currentUser && currentUser.id) ? String(currentUser.id).trim() : '';

  // Filter only tickets assigned to this user
  const assignedTickets = tickets.filter(t => {
    const assignee = String(t.assignee || '').toLowerCase().trim();
    const assigneeId = String(t.assigneeId || '').trim();
    return (myId && assigneeId === myId) ||
           (myName && assignee.includes(myName)) ||
           assignee.includes('nibas') ||
           assignee === 'me';
  });

  if (assignedTickets.length === 0) return;

  const sheet = getOrCreateSheet(ss, 'My_Assigned_Tickets', [
    'Ticket #', 'Project', 'Ticket Name', 'Status', 'Priority', 'Spent', 'Estimated', 'Direct Link', 'Assigned To', 'Last Updated'
  ]);
  formatHeaderRow(sheet, 10);

  // Read existing ticket IDs in Column A to perform intelligent upsert
  const lastRow = sheet.getLastRow();
  const existingMap = new Map(); // Ticket ID -> Row Number
  if (lastRow > 1) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    ids.forEach((row, idx) => {
      const idVal = String(row[0]).trim();
      if (idVal) existingMap.set(idVal, idx + 2);
    });
  }

  const nowStr = new Date().toLocaleString();

  assignedTickets.forEach(t => {
    const ticketId = String(t.id);
    const linkFormula = `=HYPERLINK("${baseUrl}/work_packages/${ticketId}", "Open #${ticketId}")`;
    const rowValues = [
      t.id,
      t.project || '',
      t.subject || '',
      t.status || '',
      t.priority || 'Normal',
      t.spentTime || '',
      t.estimatedTime || '',
      linkFormula,
      t.assignee || (currentUser ? currentUser.name : 'Nibas Nazeem'),
      nowStr
    ];

    if (existingMap.has(ticketId)) {
      // Update existing row in place
      const targetRow = existingMap.get(ticketId);
      sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
    } else {
      // Append new assigned ticket
      sheet.appendRow(rowValues);
      existingMap.set(ticketId, sheet.getLastRow());
    }
  });
}

function syncSingleTicketToAssignedSheet(ss, ticket, currentUser, opUrl) {
  if (!ticket) return;
  syncAssignedTickets(ss, [ticket], currentUser, opUrl);
}

// -----------------------------------------------------------------------------
// APPEND OR UPDATE EFFORT (UPSERT)
// -----------------------------------------------------------------------------
function appendEffortToSheet(ss, effort, currentUser) {
  if (!effort) return;
  const sheet = getOrCreateSheet(ss, 'Efforts_Log', [
    'Log ID', 'Date', 'Ticket #', 'Subject', 'Hours', 'User', 'Comment', 'Synced At'
  ]);
  const rowData = [
    effort.id,
    effort.spentOn || new Date().toISOString().split('T')[0],
    effort.workPackageId || '',
    effort.ticketSubject || '',
    effort.hours || 0,
    currentUser ? currentUser.name : 'Nibas Nazeem',
    effort.comment || '',
    new Date().toLocaleString()
  ];

  if (sheet.getLastRow() > 1) {
    const finder = sheet.getRange("A:A").createTextFinder(String(effort.id)).matchEntireCell(true);
    const match = finder.findNext();
    if (match) {
      sheet.getRange(match.getRow(), 1, 1, rowData.length).setValues([rowData]);
      return;
    }
  }
  sheet.appendRow(rowData);
}

function deleteEffortFromSheet(ss, effortId) {
  if (!effortId) return;
  const sheet = ss.getSheetByName('Efforts_Log');
  if (sheet && sheet.getLastRow() > 1) {
    const finder = sheet.getRange("A:A").createTextFinder(String(effortId)).matchEntireCell(true);
    const match = finder.findNext();
    if (match) {
      sheet.deleteRow(match.getRow());
    }
  }
}

// -----------------------------------------------------------------------------
// SAVE VIEW (UPSERT)
// -----------------------------------------------------------------------------
function saveViewToSheet(ss, view) {
  if (!view) return;
  const sheet = getOrCreateSheet(ss, 'Config_Views', ['View ID', 'Name', 'Is Favorite', 'Filters JSON', 'Updated At']);
  const finder = sheet.getRange("A:A").createTextFinder(String(view.id)).matchEntireCell(true);
  const match = finder.findNext();
  const rowData = [
    view.id,
    view.name,
    view.isFavorite ? 'TRUE' : 'FALSE',
    JSON.stringify(view.filters || {}),
    new Date().toLocaleString()
  ];
  if (match) {
    sheet.getRange(match.getRow(), 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
}

// -----------------------------------------------------------------------------
// RESTORE ALL DATA (FOR CACHE CLEAR / HYDRATION)
// -----------------------------------------------------------------------------
function restoreAllDataFromSheet(ss) {
  const result = {
    projects: [],
    statuses: [],
    types: [],
    views: [],
    tickets: [],
    efforts: [],
    currentUser: null
  };

  // 1. Static Config
  const configSheet = ss.getSheetByName('Config_Static');
  if (configSheet && configSheet.getLastRow() > 1) {
    const data = configSheet.getRange(2, 1, configSheet.getLastRow() - 1, 5).getValues();
    data.forEach(row => {
      const type = String(row[0]).trim();
      const id = String(row[1]).trim();
      const name = String(row[2]).trim();
      const extra = String(row[3]).trim();
      if (type === 'CurrentUser') {
        result.currentUser = { id, name };
      } else if (type === 'OpConfig') {
        result.opConfig = { url: name, apiKey: extra };
      } else if (type === 'Project') {
        result.projects.push({ id, name, identifier: extra || undefined });
      } else if (type === 'Status') {
        result.statuses.push({ id, name, isClosed: extra.toLowerCase() === 'closed' });
      } else if (type === 'Type') {
        result.types.push({ id, name });
      }
    });
  }

  // 2. Views
  const viewsSheet = ss.getSheetByName('Config_Views');
  if (viewsSheet && viewsSheet.getLastRow() > 1) {
    const data = viewsSheet.getRange(2, 1, viewsSheet.getLastRow() - 1, 5).getValues();
    data.forEach(row => {
      try {
        result.views.push({
          id: String(row[0]),
          name: String(row[1]),
          isFavorite: String(row[2]).toUpperCase() === 'TRUE',
          isSystem: false,
          createdAt: new Date().toISOString(),
          filters: JSON.parse(String(row[3]) || '{}')
        });
      } catch (e) {}
    });
  }

  // 3. Efforts
  const effortsSheet = ss.getSheetByName('Efforts_Log');
  if (effortsSheet && effortsSheet.getLastRow() > 1) {
    const data = effortsSheet.getRange(2, 1, effortsSheet.getLastRow() - 1, 8).getValues();
    data.forEach(row => {
      result.efforts.push({
        id: String(row[0]),
        spentOn: String(row[1]).substring(0, 10),
        workPackageId: parseInt(row[2], 10) || 0,
        ticketSubject: String(row[3]),
        hours: parseFloat(row[4]) || 0,
        comment: String(row[6]),
        createdAt: new Date().toISOString(),
        pendingSync: false
      });
    });
  }

  // 4. Tickets (from Tickets_Snapshot or My_Assigned_Tickets)
  const ticketsSheet = ss.getSheetByName('Tickets_Snapshot') || ss.getSheetByName('My_Assigned_Tickets');
  if (ticketsSheet && ticketsSheet.getLastRow() > 1) {
    const data = ticketsSheet.getRange(2, 1, ticketsSheet.getLastRow() - 1, 8).getValues();
    data.forEach(row => {
      result.tickets.push({
        id: parseInt(row[0], 10) || 0,
        project: String(row[1]),
        subject: String(row[2]),
        status: String(row[3]),
        statusId: '',
        priority: 'Normal',
        assignee: String(row[4]),
        spentTime: String(row[5]),
        estimatedTime: String(row[6]),
        lockVersion: 1,
        updatedAt: String(row[7]),
        pendingSync: false
      });
    });
  }

  return result;
}

// -----------------------------------------------------------------------------
// SHEET HELPERS
// -----------------------------------------------------------------------------
function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    formatHeaderRow(sheet, headers.length);
  }
  return sheet;
}

function formatHeaderRow(sheet, colCount) {
  sheet.getRange(1, 1, 1, colCount)
    .setFontWeight('bold')
    .setBackground('#0f172a')
    .setFontColor('#38bdf8');
  sheet.setFrozenRows(1);
}
