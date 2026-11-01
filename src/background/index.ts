// Background Service Worker

// Function to extract ticket ID from URL
function extractTicketId(url: string): string | null {
  if (!url) return null;
  // Match standard paths: /work_packages/1234 or /Tickets/Details/1234
  let match = url.match(/\/work_packages\/(\d+)/) || url.match(/\/Tickets\/Details\/(\d+)/);
  if (match) return match[1];

  // Match split view: ?work_package=1234 or &work_package=1234
  match = url.match(/[?&]work_package=(\d+)/);
  if (match) return match[1];

  return null;
}

// Listen for tab updates (URL changes)
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, _tab) => {
  if (changeInfo.url) {
    const ticketId = extractTicketId(changeInfo.url);
    if (ticketId) {
      chrome.storage.local.set({ latestTicketId: ticketId });
    }
  }
});

// Listen for tab switching
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.url) {
      const ticketId = extractTicketId(tab.url);
      if (ticketId) {
        chrome.storage.local.set({ latestTicketId: ticketId });
      }
    }
  } catch(e) {}
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'TICKET_DETECTED') {
    console.log('Ticket detected:', message.payload);
    // Store latest ticket ID
    chrome.storage.local.set({ latestTicketId: message.payload.ticketId });
    sendResponse({ status: 'ok' });
  }
});

// Setup context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'open-op-ticket',
    title: 'Open in OP Ticket System',
    contexts: ['selection']
  });
});

// Listen for keyboard commands
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-dashboard') {
    chrome.tabs.create({ url: chrome.runtime.getURL('index.html?mode=dashboard') });
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'open-op-ticket' && info.selectionText) {
    const text = info.selectionText.trim();
    // Assuming ticket is a number for now, or match a pattern
    if (/^\d+$/.test(text) || text.includes('/work_packages/')) {
      if (tab?.id) {
        chrome.sidePanel.open({ tabId: tab.id });
      }
    }
  }
});

// Allow side panel to open on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));
