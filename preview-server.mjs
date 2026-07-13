#!/usr/bin/env node
/*
 * ProLinker — local preview server (demo mode)
 * ---------------------------------------------
 * Serves this project over http://localhost so you can check the UI in a normal
 * browser. Two things happen automatically:
 *   1. A normal browser applies no strict Content-Security-Policy, so the Design
 *      Canvas runtime (support.js, which compiles pages with `new Function`)
 *      renders fine — no more "unsafe-eval" error.
 *   2. On localhost the app runs in LOCAL mode and uses built-in demo data, so
 *      no backend is needed. Your backend integration is untouched; it only
 *      activates on the real production host.
 *
 * Run:  node preview-server.mjs        (or double-click "Preview website.bat")
 * Stop: Ctrl + C
 */

import http from 'node:http';
import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HOME = '/project/Prolinker%20Homepage.dc.html';
const START_PORT = 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);

    if (urlPath === '/') {
      res.writeHead(302, { Location: HOME });
      res.end();
      return;
    }

    // Resolve inside ROOT only (block path traversal).
    const resolved = path.normalize(path.join(ROOT, urlPath));
    if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    let target = resolved;
    let stat;
    try {
      stat = await fs.stat(target);
    } catch {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    if (stat.isDirectory()) {
      target = path.join(target, 'index.html');
      try {
        await fs.stat(target);
      } catch {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
    }

    res.writeHead(200, {
      'Content-Type': contentType(target),
      'Cache-Control': 'no-store'
    });
    createReadStream(target).pipe(res);
  } catch {
    res.writeHead(500);
    res.end('Server error');
  }
});

function openBrowser(url) {
  const cmd =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

function listen(port) {
  server.once('error', (err) => {
    if (err && err.code === 'EADDRINUSE' && port < START_PORT + 20) {
      listen(port + 1);
    } else {
      console.error(err);
      process.exit(1);
    }
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}${HOME}`;
    console.log('\n  ProLinker preview is running in demo mode (no backend needed).\n');
    console.log('  Opening your browser at:\n');
    console.log('      ' + url + '\n');
    console.log('  If it does not open, paste that address into Chrome/Edge/Firefox.');
    console.log('  Press Ctrl + C here to stop.\n');
    openBrowser(url);
  });
}

listen(START_PORT);
