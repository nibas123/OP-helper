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

function devProxyPlugin() {
  return {
    name: 'dev-api-proxy',
    configureServer(server: any) {
      server.middlewares.use('/api/proxy', async (req: any, res: any) => {
        try {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const target = url.searchParams.get('endpoint');
          if (!target) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Missing endpoint' }));
            return;
          }
          const headers: Record<string, string> = {};
          if (req.headers.authorization) headers['Authorization'] = req.headers.authorization;
          if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
          if (req.headers.accept) headers['Accept'] = req.headers.accept;

          const fetchOptions: any = {
            method: req.method,
            headers
          };

          if (req.method !== 'GET' && req.method !== 'HEAD') {
            const chunks: any[] = [];
            for await (const chunk of req) chunks.push(chunk);
            if (chunks.length > 0) fetchOptions.body = Buffer.concat(chunks);
          }

          const response = await fetch(target, fetchOptions);
          res.statusCode = response.status;
          response.headers.forEach((v: string, k: string) => {
            if (k !== 'content-encoding' && k !== 'content-security-policy') {
              res.setHeader(k, v);
            }
          });
          res.setHeader('Access-Control-Allow-Origin', '*');
          const buffer = await response.arrayBuffer();
          res.end(Buffer.from(buffer));
        } catch (e: any) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [
    react(),
    devProxyPlugin(),
    crx({ manifest: manifest as any })
  ],
})
