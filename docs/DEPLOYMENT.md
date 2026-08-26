# Entorns i publicació

## Principi de seguretat

El desenvolupament local no apunta mai a producció per defecte. Vite envia
`/api/*` al Worker local (`127.0.0.1:8787`) i bloqueja els dominis de producció
si no hi ha una acceptació explícita.

## Desenvolupament local

1. Instal·la les dependències amb `npm ci`.
2. Inicia el Worker amb `npm run dev:worker`.
3. En una altra terminal, inicia el client amb `npm run dev`.
4. Abans de compartir canvis, executa `npm run verify`.

Els secrets locals es configuren amb Wrangler o variables d’entorn no
versionades. `.env.local` no ha de contenir mai credencials de producció.

## Staging

L’entorn `staging` ja està declarat a `wrangler.jsonc` i disposa de recursos
Cloudflare propis:

- Worker i URL separats;
- namespaces KV separats;
- secrets propis;
- mostreig d’observabilitat ajustat al trànsit;
- D1 i cues amb DLQ separades;
- crons explícitament desactivats.

Els bindings es repeteixen explícitament. No s’han de substituir pels IDs de
producció ni eliminar `triggers.crons: []`, perquè Wrangler hereta els crons de
l’arrel si no es desactiven.

```bash
npm run db:migrate:staging
npm run verify
npm run deploy:staging
```

### Smoke territorial de staging

La fase territorial no necessita secrets ni migracions. Després del
desplegament reversible, comprova les dues comarques, el hit de KV i la
validació d’entrada:

```bash
curl -i 'https://bondiari-staging.sergicas.workers.dev/api/territorial?comarca=13'
curl -i 'https://bondiari-staging.sergicas.workers.dev/api/territorial?comarca=21'
curl -i 'https://bondiari-staging.sergicas.workers.dev/api/territorial?comarca=21'
curl -i 'https://bondiari-staging.sergicas.workers.dev/api/territorial?comarca=99'
```

La segona petició a `21` ha de retornar `X-Bondiari-Cache: hit`; `99` ha de
retornar `400`. Revisa també `/territori` amb teclat i els estats de càrrega,
error parcial i buit descrits a `docs/PHASE5-TERRITORIAL.md`.

## Producció

1. Confirma que la branca està verda a CI.
2. Executa `npm run verify`.
3. Revisa els canvis de `wrangler.jsonc`, secrets i migracions.
4. Aplica `npm run db:migrate:production`.
5. Publica amb `npm run deploy`.
6. Verifica portada, una notícia, RSS, sitemap i els endpoints de salut.
7. Revisa errors, traces i durada de CPU després del desplegament.

No s’han d’executar migracions destructives ni canvis de bindings dins del
mateix pas automàtic que publica el client.
