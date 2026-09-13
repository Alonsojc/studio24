import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve('out');
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
createServer(async (req, res) => {
  try {
    const pathname =
      decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/studio24(?=\/|$)/, '') || '/';
    let path = resolve(root, '.' + pathname);
    if (path !== root && !path.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    if (pathname.endsWith('/')) path += '/index.html';
    else if (!extname(path)) {
      try {
        if ((await stat(path)).isDirectory()) path += '.html';
      } catch {
        path += '.html';
      }
    }
    const body = await readFile(path);
    res
      .writeHead(200, {
        'Content-Type': types[extname(path)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      .end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(Number(process.env.PORT || 3107), '127.0.0.1');
