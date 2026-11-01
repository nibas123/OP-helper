import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'

const manifest = {
  manifest_version: 3,
  name: "OP Ticket System",
  version: "1.0.0",
  description: "Chrome Extension for OP Ticketing System",
  permissions: ["sidePanel", "storage", "clipboardRead", "tabs", "activeTab", "scripting", "alarms", "contextMenus"],
  host_permissions: ["<all_urls>"],
  background: { service_worker: "src/background/index.ts", type: "module" },
  content_scripts: [{ matches: ["<all_urls>"], js: ["src/content/index.ts"] }],
  action: { default_title: "Open OP Ticket System" },
  side_panel: { default_path: "index.html" },
  commands: {
    _execute_side_panel: {
      suggested_key: { default: "Alt+Shift+T" },
      description: "Open Side Panel"
    },
    "open-dashboard": {
      suggested_key: { default: "Alt+Shift+D" },
      description: "Open Full Dashboard"
    }
  }
}

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest: manifest as any })
  ],
})
