# El Bon Diari

Mitjà constructiu en català amb portada React, radar de notícies, verificacions,
dades públiques, oportunitats, agenda local, hemeroteca, butlletí,
notificacions web/iOS i backend a Cloudflare Workers.

## Stack

- React 19 i Vite 8
- Cloudflare Workers, Static Assets, KV i Workers AI
- Capacitor 7 per a l’app iOS
- Vitest i ESLint

## Desenvolupament

```bash
npm ci
npm run dev
```

El servidor de Vite envia `/api/*` al Worker desplegat. Per provar també el
backend localment, usa `npm run dev:worker` després d’haver configurat els
bindings i secrets de desenvolupament.

## Verificació

```bash
npm run lint
npm test
npm run check:articles
npm run build
```

`npm run check:articles` comprova que cada peça editorial tingui `imageUrl` i
`imageAlt`, i que la imatge sigui una d’aquestes opcions:

- una fotografia vàlida amb crèdit i enllaç d’atribució;
- una il·lustració editorial pròpia generada a `/api/story-image/:id`.

No s’accepten placeholders ni SVG genèrics de categoria. La font de veritat de
aquestes regles és `src/lib/imageRules.js`.

## Publicació

```bash
npm run deploy
```

El build genera els HTML estàtics de les notícies, `sitemap.xml`, `feed.xml` i
el service worker versionat. Wrangler publica el Worker i els assets de `dist/`
segons `wrangler.jsonc`.

Els secrets (Resend, xarxes socials, VAPID, APNs i refresc manual) no han d’anar
mai al repositori. Es configuren amb `wrangler secret put`.

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

## App iOS

```bash
npm run ios:assets
npm run ios:sync
npm run ios:open
```

Els fitxers de `ios/App/App/public/` són generats per Capacitor i no s’han
d’editar ni analitzar amb ESLint directament.
