import { test } from 'vitest';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { handleStats, handleTrackVisit } from '../stats.js';

const day = new Date().toISOString().slice(0, 10);
const baseline = { total: 42, daily: { [day]: 42 }, paths: { '/peça': 42 },
  referrers: { directe: 42 }, devices: { desktop: 42 }, [`paths:${day}`]: { '/peça': 42 } };
function environment() {
  const sql = new DatabaseSync(':memory:');
  let writes = 0;
  const kv = { async get(key) { return structuredClone(baseline[key] ?? null); },
    async put(key, value) { writes++; baseline[key] = JSON.parse(value); } };
  const db = { prepare(query) { return { query, params: [], bind(...params) { return { query, params }; } }; },
    async batch(statements) {
      sql.exec('BEGIN');
      try {
        const results = statements.map(({ query, params }) => {
          const statement = sql.prepare(query);
          return { success: true, results: query.startsWith('SELECT') ? statement.all(...params) : (statement.run(...params), []) };
        });
        sql.exec('COMMIT'); return results;
      } catch (error) { sql.exec('ROLLBACK'); throw error; }
    } };
  return { env: { STATS_KV: kv, EDITORIAL_DB: db }, sql, writes: () => writes };
}
function visit(overrides = {}) {
  return new Request('https://bondiari.com/api/track-visit', { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: '/peça?private=discard#anchor', referrer: '', viewport: 1280, ...overrides }) });
}
const statsRequest = () => new Request('https://bondiari.com/api/stats');

test('1000 concurrent visits make zero KV writes and preserve all counts', async () => {
  const e = environment();
  const responses = await Promise.all(Array.from({ length: 1000 }, () => handleTrackVisit(visit(), e.env)));
  assert(responses.every(r => r.status === 200));
  assert.equal(e.writes(), 0);
  const result = await (await handleStats(statsRequest(), e.env)).json();
  assert.equal(result.total, 1042);
  assert.equal(result.daily.find(r => r.day === day).count, 1042);
  assert.equal(result.topPaths.find(r => r.key === '/peça').count, 1042);
  assert.equal(result.topPathsWeek.find(r => r.key === '/peça').count, 1042);
  assert.equal(result.topReferrers.find(r => r.key === 'directe').count, 1042);
  assert.equal(result.devices.desktop, 1042);
  assert.equal(e.sql.prepare('SELECT COUNT(*) AS n FROM visit_counters_v1').get().n, 6);
  assert.equal(e.writes(), 0);
});

test('read-only dashboard preserves historical statistics before first new visit', async () => {
  const e = environment();
  const result = await (await handleStats(statsRequest(), e.env)).json();
  assert.equal(result.total, 42);
  assert.equal(result.devices.desktop, 42);
  assert.equal(e.writes(), 0);
});

test('D1 failure rolls back the whole visit and never falls back to KV', async () => {
  const e = environment();
  await handleStats(statsRequest(), e.env);
  e.sql.exec(`CREATE TRIGGER fail_devices BEFORE INSERT ON visit_counters_v1
    WHEN NEW.kind = 'devices' BEGIN SELECT RAISE(ABORT, 'test failure'); END;`);
  const result = await handleTrackVisit(visit(), e.env);
  assert.equal(result.status, 503);
  assert.equal(e.sql.prepare('SELECT COUNT(*) AS n FROM visit_counters_v1').get().n, 0);
  assert.equal(e.writes(), 0);
});

test('missing D1 never re-enables KV counters and reports unavailable honestly', async () => {
  const e = environment(); delete e.env.EDITORIAL_DB;
  assert.equal((await handleTrackVisit(visit(), e.env)).status, 503);
  assert.equal((await handleStats(statsRequest(), e.env)).status, 503);
  assert.equal(e.writes(), 0);
});

test('invalid bodies/methods are rejected and query strings are not stored', async () => {
  const e = environment();
  assert.equal((await handleTrackVisit(statsRequest(), e.env)).status, 405);
  assert.equal((await handleTrackVisit(new Request('https://bondiari.com/api/track-visit', { method: 'POST', body: 'null' }), e.env)).status, 400);
  await handleTrackVisit(visit(), e.env);
  const keys = e.sql.prepare("SELECT bucket FROM visit_counters_v1 WHERE kind = 'paths'").all();
  assert.deepEqual(keys.map(r => r.bucket), ['/peça']);
});

