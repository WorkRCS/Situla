import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { serve } from '@hono/node-server';
import app from './index.js';

const files = [
  ['/', 'public/index.html', 'text/html; charset=utf-8'],
  ['/index.html', 'public/index.html', 'text/html; charset=utf-8'],
  ['/styles.css', 'public/styles.css', 'text/css; charset=utf-8'],
  ['/app.js', 'public/app.js', 'text/javascript; charset=utf-8']
];
for (const [route, path, contentType] of files) {
  app.get(route, async (c) => {
    try {
      const body = await readFile(new URL('./' + path, import.meta.url));
      c.header('Content-Type', contentType);
      c.header('Cache-Control', 'no-cache');
      return c.body(body);
    } catch {
      return c.text('Dashboard asset not found.', 500);
    }
  });
}

const port = Number(process.env.PORT || 3000);
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log('Situla backend listening at http://localhost:' + info.port);
  console.log('Health check: http://localhost:' + info.port + '/api/health');
});
