/**
 * server.js — Node.js gateway for Legal Aid Advisor.
 *
 * Serves the static frontend (public/) on http://localhost:3000
 * The Python FastAPI backend runs separately on port 8000.
 *
 * Routes:
 *   /           → landing page (public/index.html)
 *   /dashboard  → app dashboard (public/dashboard.html)
 *
 * Run:  node server.js
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT   = 3000;
const PUBLIC = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
};

const server = http.createServer((req, res) => {
  // Normalize URL — strip query string
  let urlPath = req.url.split('?')[0];

  // Route: landing at /, dashboard at /dashboard, everything else → index.html
  if (urlPath === '/' || urlPath === '') {
    urlPath = '/index.html';
  } else if (urlPath === '/dashboard') {
    urlPath = '/dashboard.html';
  } else if (!path.extname(urlPath)) {
    urlPath = '/index.html';
  }

  const filePath = path.join(PUBLIC, urlPath);

  // Security: prevent path traversal
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Not found: ' + urlPath);
      } else {
        res.writeHead(500);
        res.end('Server error: ' + err.message);
      }
      return;
    }
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n  Legal Aid Advisor Dashboard`);
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  Frontend  →  http://localhost:${PORT}`);
  console.log(`  Backend   →  http://localhost:8000`);
  console.log(`  API Docs  →  http://localhost:8000/docs`);
  console.log(`  ─────────────────────────────────────────\n`);
});
