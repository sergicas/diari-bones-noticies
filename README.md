# El Bon Diari

Mitjà constructiu en català amb portada React, radar de notícies, verificacions,
dades públiques, oportunitats, agenda local, hemeroteca, butlletí,
notificacions web/iOS i backend a Cloudflare Workers.

## Stack

- React 19 i Vite 8
- Cloudflare Workers, Static Assets, D1, Queues, KV i Workers AI
- Capacitor 7 per a l’app iOS
- Vitest i ESLint

## Desenvolupament

```bash
npm ci
npm run dev:worker
```

En una segona terminal:

```bash
npm run dev
```

El servidor de Vite envia `/api/*` a `http://127.0.0.1:8787` per defecte. Es pot
canviar amb `BONDIARI_API_TARGET`, però apuntar al domini de producció exigeix
també `BONDIARI_ALLOW_PRODUCTION_API=1`. Això evita que una sessió local executi
mutacions sobre dades reals per accident.

Copia `.env.example` a `.env.local` només si necessites personalitzar la
destinació. No versionis secrets ni valors d’entorn locals.

## Verificació

```bash
npm run verify
```

`npm run check:articles` comprova que cada peça editorial tingui `imageUrl` i
`imageAlt`, i que la imatge sigui una d’aquestes opcions:

- una fotografia vàlida amb crèdit i enllaç d’atribució;
- una il·lustració editorial pròpia generada a `/api/story-image/:id`.

No s’accepten placeholders ni SVG genèrics de categoria. La font de veritat de
aquestes regles és `src/lib/imageRules.js`.

La mateixa verificació s’executa automàticament a GitHub Actions per a cada
push i pull request.

El radar en viu també aplica una barrera de profunditat, especificitat i
utilitat abans de publicar una peça generada. Els criteris i l’estat de la fase
editorial prioritària són a
[`docs/QUALITAT-EDITORIAL.md`](docs/QUALITAT-EDITORIAL.md).

## Publicació

```bash
npm run deploy
```

El build genera els HTML estàtics de les notícies, `sitemap.xml`, `feed.xml` i
el service worker versionat. Wrangler publica el Worker i els assets de `dist/`
segons `wrangler.jsonc`.

Per validar o publicar staging:

```bash
npm run check:worker:staging
npm run deploy:staging
```

Els secrets (Resend, xarxes socials, VAPID, APNs i refresc manual) no han d’anar
mai al repositori. Es configuren amb `wrangler secret put`.

## Cervell d’IA de text (jutjar i reescriure)

La IA que jutja les notícies i en reescriu el titular i el cos passa per una
porta única: [`src/server/ai/textModel.js`](src/server/ai/textModel.js). Tria el
proveïdor de manera automàtica i segura:

- Si hi ha el secret `GEMINI_API_KEY` configurat al Worker → **Gemini** (Google).
  El model és `gemini-flash-lite-latest`; es pot canviar amb el secret opcional
  `GEMINI_MODEL`.
- Si no → **Cloudflare** (Llama), el d’abans. Mentre no hi hagi clau, res canvia.

Per activar Gemini, dins la carpeta del projecte:

```bash
npx wrangler secret put GEMINI_API_KEY
```

L’ordre demana la clau de manera interactiva: s’enganxa allà, no queda mai al
codi ni al repositori. Les **il·lustracions no** passen per aquí: es generen
sempre a Cloudflare (FLUX). Quin proveïdor s’ha fet servir a l’última edició es
veu al camp `textProvider` de `/diagnostic` i del registre `cron-timing:latest`.

L’operativa de D1, cues, migracions, diagnòstic i recuperació és a
[`docs/PHASE2-OPERATIONS.md`](docs/PHASE2-OPERATIONS.md).

El centre privat que resumeix si el sistema funciona correctament és a
`/diagnostic`. La guia d’ús i els llindars d’alerta són a
[`docs/PHASE3-CENTRE-OPERACIONS.md`](docs/PHASE3-CENTRE-OPERACIONS.md).

## Refresc manual protegit

L’endpoint `/api/refresh-news` només accepta `POST` amb un Bearer token. Crea el
secret al Worker i exposa el mateix valor només a la sessió local des d’on
executis l’script:

```bash
npx wrangler secret put BONDIARI_REFRESH_TOKEN
BONDIARI_REFRESH_TOKEN="..." npm run refresh
```

`npm run seccions` fa servir el mateix secret. El navegador només rellegeix
l’edició publicada; les passades cares de fonts i IA queden limitades als crons
i als scripts autenticats.

Per provar el pipeline asíncron sense enviar cap notificació ni correu:

```bash
curl -X POST \
  -H "Authorization: Bearer $BONDIARI_REFRESH_TOKEN" \
  -H "Idempotency-Key: prova-manual-1" \
  -H "Content-Type: application/json" \
  --data '{"distribution":"none"}' \
  https://bondiari-staging.sergicas.workers.dev/api/pipeline-trigger
```

## App iOS

```bash
npm run ios:assets
npm run ios:sync
npm run ios:open
```

Els fitxers de `ios/App/App/public/` són generats per Capacitor i no s’han
d’editar ni analitzar amb ESLint directament.
