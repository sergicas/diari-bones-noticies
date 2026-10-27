// Visit counters use the existing D1 binding. Historical KV counters remain
// read-only; newsletter/push records in STATS_KV are deliberately untouched.
const STATS_SCHEMA = `CREATE TABLE IF NOT EXISTS visit_counters_v1 (
  kind TEXT NOT NULL, bucket TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, bucket)
) WITHOUT ROWID`;

const jsonStats = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow',
    'x-bondiari-visit-store': 'd1-v1' },
});

function statsDay(offset = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

function statsPath(value) {
  if (typeof value !== 'string') return '/';
  const clean = value.split('#')[0].split('?')[0];
  if (!clean || clean.length > 200) return '/';
  return clean.startsWith('/') ? clean : `/${clean}`;
}

function statsReferrer(value) {
  if (typeof value !== 'string' || !value) return 'directe';
  try {
    const host = new URL(value).hostname.toLowerCase();
    if (!host || host === 'bondiari.com' || host === 'www.bondiari.com') return 'intern';
    return host.replace(/^www\./, '').slice(0, 100);
  } catch { return 'directe'; }
}

function statsDevice(viewport) {
  const width = Number(viewport) || 0;
  return width === 0 ? 'unknown' : width < 600 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop';
}

function statsAdd(map, key, count) {
  // Use own properties: a public path/referrer must not affect Object.prototype.
  const old = Object.hasOwn(map, key) ? Number(map[key]) || 0 : 0;
  Object.defineProperty(map, key, { value: old + Number(count || 0),
    writable: true, enumerable: true, configurable: true });
}

function statsTop(map, n) {
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([key, count]) => ({ key, count }));
}

export async function handleTrackVisit(request, env) {
  if (request.method !== 'POST') return jsonStats({ ok: false }, 405);
  let body;
  try { body = await request.json(); } catch { return jsonStats({ ok: false }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return jsonStats({ ok: false }, 400);
  const day = statsDay();
  const path = statsPath(body.path);
  const counters = [['total', 'all'], ['daily', day], ['paths', path],
    [`paths:${day}`, path], ['referrers', statsReferrer(body.referrer)],
    ['devices', statsDevice(body.viewport)]];
  try {
    const db = env.EDITORIAL_DB;
    // D1 batches are atomic: a failed write cannot leave a partly counted visit.
    // Idempotent CREATE also makes a cold isolate safe without a KV lock or flag.
    await db.batch([db.prepare(STATS_SCHEMA), ...counters.map(([kind, bucket]) =>
      db.prepare(`INSERT INTO visit_counters_v1 (kind, bucket, count) VALUES (?, ?, 1)
        ON CONFLICT(kind, bucket) DO UPDATE SET count = count + 1`).bind(kind, bucket))]);
    return jsonStats({ ok: true, store: 'd1' });
  } catch {
    console.error('Visit statistics unavailable: D1 write failed');
    // Never fall back to KV: optional analytics must not exhaust the shared quota.
    return jsonStats({ ok: false, store: 'd1', error: 'Estadístiques temporalment no disponibles.' }, 503);
  }
}

export async function handleStats(request, env) {
  try {
    const days = Array.from({ length: 7 }, (_, i) => statsDay(i));
    const kvKeys = ['total', 'daily', 'paths', 'referrers', 'devices', ...days.map(d => `paths:${d}`)];
    const kinds = ['total', 'daily', 'paths', 'referrers', 'devices', ...days.map(d => `paths:${d}`)];
    const db = env.EDITORIAL_DB;
    const [legacy, results] = await Promise.all([
      Promise.all(kvKeys.map(key => env.STATS_KV.get(key, 'json'))),
      db.batch([db.prepare(STATS_SCHEMA), db.prepare(`SELECT kind, bucket, count FROM visit_counters_v1
        WHERE kind IN (${kinds.map(() => '?').join(',')})`).bind(...kinds)]),
    ]);
    const daily = Object.assign(Object.create(null), legacy[1] || {});
    const paths = Object.assign(Object.create(null), legacy[2] || {});
    const referrers = Object.assign(Object.create(null), legacy[3] || {});
    const devices = Object.assign(Object.create(null), legacy[4] || {});
    const weekly = Object.create(null);
    for (const map of legacy.slice(5)) for (const [key, count] of Object.entries(map || {})) statsAdd(weekly, key, count);
    const baseDailyTotal = Object.values(daily).reduce((sum, n) => sum + Number(n || 0), 0);
    let total = baseDailyTotal || Number(legacy[0] || 0);
    for (const row of results[1].results || []) {
      if (row.kind === 'total') total += Number(row.count);
      else if (row.kind === 'daily') statsAdd(daily, row.bucket, row.count);
      else if (row.kind === 'paths') statsAdd(paths, row.bucket, row.count);
      else if (row.kind === 'referrers') statsAdd(referrers, row.bucket, row.count);
      else if (row.kind === 'devices') statsAdd(devices, row.bucket, row.count);
      else if (row.kind.startsWith('paths:')) statsAdd(weekly, row.bucket, row.count);
    }
    return jsonStats({ total,
      daily: Object.entries(daily).sort(([a], [b]) => a.localeCompare(b)).slice(-30).map(([day, count]) => ({ day, count })),
      topPaths: statsTop(paths, 12), topPathsWeek: statsTop(weekly, 12),
      topReferrers: statsTop(referrers, 10), devices,
      updatedAt: new Date().toISOString(), store: 'd1+kv-history' });
  } catch {
    console.error('Visit statistics unavailable: statistics read failed');
    return jsonStats({ error: 'No s’han pogut llegir les estadístiques.' }, 503);
  }
}
