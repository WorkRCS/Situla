import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';

test('admin dashboard routes reject requests without a session cookie', async () => {
  const response = await app.request('/api/admin/dashboard');
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.match(body.error, /Authentication required/);
});

test('health route reports missing server configuration without attempting a database connection', async (t) => {
  const names = ['MONGODB_URI', 'MONGODB_DB_NAME', 'ADMIN_USERNAME', 'ADMIN_PASSWORD', 'SESSION_SECRET'];
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  t.after(() => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  for (const name of names) delete process.env[name];

  const response = await app.request('/api/health');
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.status, 'needs_configuration');
  assert.deepEqual(new Set(body.missing), new Set(names));
});
