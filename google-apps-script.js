/**
 * ==============================================================================
 * OP HELPER - GOOGLE APPS SCRIPT DATABASE & EXCEL SYNC
 * ==============================================================================
 * This script turns your Google Sheet into a REST database for OP Helper.
 * It stores:
 *  1. Efforts_Log      - Full timesheet log with dates, hours, and work comments.
 *  2. Tickets_Snapshot - Active ticket inventory with statuses, assignees & spent hours.
 *  3. Config_Views     - Your custom saved views and filter definitions.
 *  4. Config_Static    - Projects, statuses, types, and current user info.
 *
 * HOW TO DEPLOY:
 *  1. In Google Sheets, go to: Extensions -> Apps Script.
 *  2. Replace all existing text with this code.
 *  3. Click "Deploy" (top right) -> "New deployment".
 *  4. Choose type: "Web app".
 *  5. Set "Execute as": "Me".
 *  6. Set "Who has access": "Anyone".
 *  7. Click "Deploy", authorize permissions, and copy the Web App URL.
 *  8. Paste the Web App URL into OP Helper's Settings modal.
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
    } else if (action === 'SAVE_VIEW') {
      saveViewToSheet(ss, payload.view);
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
  // 1. Static Configuration & Master Tables
  const configSheet = getOrCreateSheet(ss, 'Config_Static', ['Type', 'ID', 'Name', 'Extra', 'Updated At']);
  configSheet.clearContents();
  configSheet.appendRow(['Type', 'ID', 'Name', 'Extra', 'Updated At']);
  formatHeaderRow(configSheet, 5);

  const configRows = [];
  const nowStr = new Date().toLocaleString();

  // User
  if (payload.currentUser) {
    configRows.push(['CurrentUser', payload.currentUser.id, payload.currentUser.name, '', nowStr]);
  }
  // Projects
  if (payload.projects && payload.projects.length > 0) {
    payload.projects.forEach(p => {
      configRows.push(['Project', p.id, p.name, p.identifier || '', nowStr]);
    });
  }
  // Statuses
  if (payload.statuses && payload.statuses.length > 0) {
    payload.statuses.forEach(s => {
      configRows.push(['Status', s.id, s.name, s.isClosed ? 'Closed' : 'Open', nowStr]);
    });
  }
  // Types
  if (payload.types && payload.types.length > 0) {
    payload.types.forEach(t => {
      configRows.push(['Type', t.id, t.name, '', nowStr]);
    });
  }
  if (configRows.length > 0) {
    configSheet.getRange(2, 1, configRows.length, 5).setValues(configRows);
  }

  // 2. Saved Views
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

  // 3. Efforts Log
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

  // 4. Tickets Snapshot
  const ticketsSheet = getOrCreateSheet(ss, 'Tickets_Snapshot', [
    'Ticket #', 'Project', 'Subject', 'Status', 'Assignee', 'Spent (h)', 'Estimated (h)', 'Updated At'
  ]);
  if (payload.tickets && payload.tickets.length > 0) {
    ticketsSheet.clearContents();
    ticketsSheet.appendRow(['Ticket #', 'Project', 'Subject', 'Status', 'Assignee', 'Spent (h)', 'Estimated (h)', 'Updated At']);
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
// APPEND EFFORT (SINGLE LOG)
// -----------------------------------------------------------------------------
function appendEffortToSheet(ss, effort, currentUser) {
  if (!effort) return;
  const sheet = getOrCreateSheet(ss, 'Efforts_Log', [
    'Log ID', 'Date', 'Ticket #', 'Subject', 'Hours', 'User', 'Comment', 'Synced At'
  ]);
  sheet.appendRow([
    effort.id,
    effort.spentOn || new Date().toISOString().split('T')[0],
    effort.workPackageId || '',
    effort.ticketSubject || '',
    effort.hours || 0,
    currentUser ? currentUser.name : 'Nibas Nazeem',
    effort.comment || '',
    new Date().toLocaleString()
  ]);
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

  // 4. Tickets
  const ticketsSheet = ss.getSheetByName('Tickets_Snapshot');
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
