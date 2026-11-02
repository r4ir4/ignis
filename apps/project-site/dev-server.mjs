// Local dev server: serves ./public and proxies /api/* to the Ignis API,
// mirroring nginx.conf.tmpl. The web secret comes from the environment only.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "public");
const port = Number(process.env.PORT || 4173);
const api = new URL(process.env.IGNIS_API_URL || "http://127.0.0.1:8001");
const secret = process.env.IGNIS_WEB_SECRET;
if (!secret) { console.error("IGNIS_WEB_SECRET is not set"); process.exit(1); }

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    const headers = { ...req.headers, host: api.host, "x-ignis-web-secret": secret };
    delete headers.authorization;
    const up = http.request({ host: api.hostname, port: api.port, method: req.method,
      path: url.pathname.slice(4) + url.search, headers }, (r) => {
      res.writeHead(r.statusCode, r.headers); r.pipe(res);
    });
    up.on("error", (e) => { res.writeHead(502); res.end(`API unreachable: ${e.message}`); });
    return req.pipe(up);
  }
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  for (const f of [rel, rel + ".html", join(rel, "index.html"), "index.html"]) {
    try {
      const body = await readFile(join(root, f));
      res.writeHead(200, { "content-type": types[extname(f)] || "application/octet-stream", "cache-control": "no-cache" });
      return res.end(body);
    } catch {}
  }
  res.writeHead(404); res.end("not found");
}).listen(port, () => console.log(`project-site on http://localhost:${port} -> API ${api.origin}`));
