// Content Script for Page Scraping and Detection

function detectTicketIdFromUrl(): string | null {
  const url = window.location.href;
  const match = url.match(/\/work_packages\/(\d+)/) || url.match(/\/Tickets\/Details\/(\d+)/);
  return match ? match[1] : null;
}

function scrapeTicketDetails() {
  // Try to find common elements. For now, just placeholder selectors.
  const titleEl = document.querySelector('h2.subject') || document.querySelector('.ticket-title');
  const statusEl = document.querySelector('.status') || document.querySelector('.ticket-status');
  const assigneeEl = document.querySelector('.assignee') || document.querySelector('.ticket-assignee');

  return {
    title: titleEl?.textContent?.trim() || '',
    status: statusEl?.textContent?.trim() || '',
    assignee: assigneeEl?.textContent?.trim() || ''
  };
}

function runDetection() {
  const ticketId = detectTicketIdFromUrl();
  if (ticketId) {
    const details = scrapeTicketDetails();
    chrome.runtime.sendMessage({
      type: 'TICKET_DETECTED',
      payload: { ticketId, ...details }
    });
  }
}

// Run initially
runDetection();

// Observe for SPA navigations
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    runDetection();
  }
}).observe(document, { subtree: true, childList: true });
