export async function sendWebhook(payload: any) {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.sync.get(['op_webhook_url'], async (res) => {
      const url = res.op_webhook_url as string;
      if (!url) return;
      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (e) {
        console.error('Failed to send webhook', e);
      }
    });
  }
}
