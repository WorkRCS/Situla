import 'dotenv/config';
import { serve } from '@hono/node-server';
import app from './index.js';

const port = Number(process.env.PORT || 3000);
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log('Situla read-only API listening at http://localhost:' + info.port);
  console.log('Health check: http://localhost:' + info.port + '/api/health');
});
