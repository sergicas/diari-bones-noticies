#!/bin/bash
set -e

echo "Aplicando Fase 3..."

# liveNews.js
if ! grep -q "import { buildDailySnapshot }" src/server/liveNews.js; then
  sed -i "1iimport { buildDailySnapshot } from './telemetry.js';" src/server/liveNews.js
fi
sed -i '/async function/,/{/ {
  /{/ a\    const feedsMetrics = [];
  T end
  : end
}' src/server/liveNews.js
sed -i '/^[[:space:]]*return /i\    const cronDurationMs = Date.now() - startTime;\n    await buildDailySnapshot(env, feedsMetrics, cronDurationMs, iaStats);' src/server/liveNews.js

# worker.js
if ! grep -q "import { saveCronTiming, getDashboardData }" src/worker.js; then
  sed -i "1iimport { saveCronTiming, getDashboardData } from './server/telemetry.js';" src/worker.js
fi
sed -i '/async function scheduled/,/^}/ {
  /^{/ a\    const startTime = Date.now();
  /try {/!b
  /try {/ {
    :loop
    n
    /^[[:space:]]*} catch/!b loop
    a\      const duration = Date.now() - startTime;\n      await saveCronTiming(env, duration, "ok");
  }
}' src/worker.js
if ! grep -q "'/api/feed-health' && url.searchParams.get('mode') === 'dashboard'" src/worker.js; then
  sed -i "/if (url.pathname === '\/api\/feed-health'/a\\
    \n  if (url.pathname === '/api/feed-health' && url.searchParams.get('mode') === 'dashboard') {\
    const token = request.headers.get('x-health-token');\
    if (token !== env.BONDIARI_FEED_HEALTH_TOKEN) {\
      return new Response('Unauthorized', { status: 401 });\
    }\
    try {\
      const data = await getDashboardData(env);\
      return new Response(JSON.stringify(data), {\
        headers: { 'Content-Type': 'application/json' },\
      });\
    } catch (e) {\
      return new Response('Internal error', { status: 500 });\
    }\
  }" src/worker.js
fi

# App.jsx
if ! grep -q "const DiagnosticView = React.lazy" src/App.jsx; then
  sed -i "/const .* = React.lazy(() => import/ a\const DiagnosticView = React.lazy(() => import('./DiagnosticView'));" src/App.jsx
fi
if ! grep -q 'path="/diagnostic"' src/App.jsx; then
  sed -i "/<Routes>/a\\
      <Route path=\"/diagnostic\" element={\
        <React.Suspense fallback={<div>Carregant diagnòstic...</div>}>\
          <DiagnosticView />\
        </React.Suspense>\
      } />" src/App.jsx
fi

echo "Fase 3 aplicada correctamente."
