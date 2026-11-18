#!/usr/bin/env node
// Zero-dependency static server for local use:  node tools/serve.mjs [port]
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wav': 'audio/wav',
  '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon',
};

http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT + path.sep) || /[\\/]\.(cache|git)([\\/]|$)/.test(file)) { res.writeHead(403).end(); return; }
    const st = await stat(file);
    if (!st.isFile()) throw new Error('not a file');
    // Always revalidate, so rebuilt samples / edited code are picked up on reload.
    const lastModified = st.mtime.toUTCString();
    const ims = req.headers['if-modified-since'];
    if (ims && Math.floor(st.mtimeMs / 1000) <= Math.floor(Date.parse(ims) / 1000)) {
      res.writeHead(304, { 'Last-Modified': lastModified, 'Cache-Control': 'no-cache' }).end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Content-Length': st.size,
      'Last-Modified': lastModified,
      'Cache-Control': 'no-cache',
    });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`AP Trainer → http://localhost:${PORT}/`));
