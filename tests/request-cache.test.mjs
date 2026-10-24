import assert from 'node:assert/strict';
import test from 'node:test';

import { RequestCache } from '../src/data/request-cache.ts';

test('shares in-flight work and reuses the successful result', async () => {
  const cache = new RequestCache();
  let calls = 0;
  let resolve;
  const load = () => { calls++; return new Promise((done) => { resolve = done; }); };
  const first = cache.get('week', load);
  const second = cache.get('week', load);
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);
  resolve('weekly data');
  assert.equal(await first, 'weekly data');
  assert.equal(await cache.get('week', load), 'weekly data');
  assert.equal(calls, 1);
  assert.equal(cache.getCached('week'), 'weekly data');
});

test('refresh preserves cached data until replacement and retries after failure', async () => {
  const cache = new RequestCache();
  await cache.get('month', async () => 'old');
  let resolve;
  const pending = cache.get('month', () => new Promise((done) => { resolve = done; }), true);
  assert.equal(cache.getCached('month'), 'old');
  await Promise.resolve();
  resolve('new');
  assert.equal(await pending, 'new');
  assert.equal(cache.getCached('month'), 'new');
  await assert.rejects(cache.get('month', async () => { throw new Error('offline'); }, true));
  assert.equal(cache.getCached('month'), 'new');
  assert.equal(await cache.get('month', async () => 'recovered', true), 'recovered');
});
